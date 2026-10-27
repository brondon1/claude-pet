/**
 * 守望进程：开机自启（Windows 登录项），不开任何窗口，盯着 Claude 的启动：每打开一次 Claude 桌面端或 Claude Code CLI
 * （原生 claude.exe、npm 装的 node cli.js 都算），如果桌宠没在运行就把它唤醒。手动退出桌宠后不会被反复拉起，
 * 下次打开 Claude 时才会。配置 autoStart 改为 false 时自行退出。
 * 由桌宠主进程负责注册登录项和首次启动（见 main.js 的 syncAutoStart）。
 * @module claude-pet/src/main/watcher
 */
import { app } from 'electron';
import { execFile, spawn } from 'node:child_process';
import { loadConfig, APP_ARGS } from './config.js';
import { cleanEnv } from './brain.js';
import { isClaudeLaunch } from '../shared/claude-proc.js';

// 与桌宠本体用不同的应用名 → 不同的单实例锁：守望进程只留一个，且不挡桌宠启动
app.setName('claude-pet-watcher');
if (!app.requestSingleInstanceLock()) app.quit();

const POLL_MS = 5000;
/** 刚拉起桌宠后这段时间内不重复拉（桌宠启动要几秒，期间 /health 还连不上）。 */
const LAUNCH_COOLDOWN_MS = 15_000;

/** Claude 桌面端 / Claude Code 是否在运行。 */
const claudeRunning = () =>
  new Promise((resolve) => {
    if (process.platform === 'win32') {
      execFile('tasklist', ['/FI', 'IMAGENAME eq claude.exe', '/FO', 'CSV', '/NH'], { windowsHide: true }, (e, out) =>
        resolve(!e && /claude\.exe/i.test(out)),
      );
    } else {
      execFile('pgrep', ['-if', 'claude'], (e, out) => resolve(!e && out.trim().length > 0));
    }
  });

/** 桌宠是否在运行（问它的本机接口）。 */
const petRunning = async (port) => {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1500) });
    return r.ok;
  } catch {
    return false;
  }
};

const launchPet = () => {
  const child = spawn(process.execPath, APP_ARGS, { detached: true, stdio: 'ignore', env: cleanEnv(process.env) });
  child.unref();
};

let lastLaunch = 0;
/** 有 Claude 新启动：桌宠没在跑就拉起来（你之前手动退出了也会，打开 Claude 就是在叫她）。 */
const wake = async () => {
  const { config } = loadConfig();
  if (config.autoStart === false) return app.quit();
  if (Date.now() - lastLaunch < LAUNCH_COOLDOWN_MS || (await petRunning(config.port))) return;
  lastLaunch = Date.now();
  console.log('[claude-pet] 检测到 Claude 启动，唤醒桌宠');
  launchPet();
};

/**
 * Windows：常驻一个 PowerShell 订阅 WMI「进程创建」事件，每有 claude.exe / node.exe 启动就把映像名和命令行吐出来，
 * 由 isClaudeLaunch 判断是不是打开了 Claude 桌面端或 Claude Code CLI。比轮询进程列表及时，也能分辨每一次新启动。
 * 守望进程没了它自己会发现并退出；它意外退出则 10 秒后重开。
 */
const PS_WATCH = String.raw`
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$q = "SELECT * FROM __InstanceCreationEvent WITHIN 1 WHERE TargetInstance ISA 'Win32_Process' AND (TargetInstance.Name = 'claude.exe' OR TargetInstance.Name = 'node.exe')"
Register-CimIndicationEvent -Query $q -SourceIdentifier ClaudePetWatch | Out-Null
while ($true) {
  $e = Wait-Event -SourceIdentifier ClaudePetWatch -Timeout 5
  if ($e) {
    $p = $e.SourceEventArgs.NewEvent.TargetInstance
    [Console]::Out.WriteLine($p.Name + [char]9 + ($p.CommandLine -replace '[\r\n]+', ' '))
    [Console]::Out.Flush()
    Remove-Event -EventIdentifier $e.EventIdentifier
  }
  if (-not (Get-Process -Id PARENT_PID -ErrorAction SilentlyContinue)) { exit }
}`.replace('PARENT_PID', String(process.pid));

let psChild = null;
let quitting = false;
const watchLaunches = () => {
  const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(PS_WATCH, 'utf16le').toString('base64')], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  let buf = '';
  ps.stdout.setEncoding('utf8');
  ps.stdout.on('data', (d) => {
    buf += d;
    const lines = buf.split(/\r?\n/);
    buf = lines.pop();
    for (const line of lines) {
      const [name, cmd = ''] = line.split('\t');
      if (isClaudeLaunch(name, cmd)) wake();
    }
  });
  ps.on('exit', () => {
    if (!quitting) setTimeout(watchLaunches, 10_000);
  });
  psChild = ps;
};
app.on('will-quit', () => {
  quitting = true;
  psChild?.kill();
});

// 其他平台：轮询，Claude 从「没开」变成「开了」时拉起
let wasRunning = false;
const poll = async () => {
  const running = await claudeRunning();
  if (running && !wasRunning) await wake();
  wasRunning = running;
};

app.whenReady().then(async () => {
  // 守望进程启动时（开机登录 / 桌宠刚打开时顺带拉起）Claude 已经开着，也算一次
  if (await claudeRunning()) wake();
  if (process.platform === 'win32') {
    watchLaunches();
    // 只用来发现 autoStart 被关掉后自行退出
    setInterval(() => loadConfig().config.autoStart === false && app.quit(), POLL_MS);
  } else {
    wasRunning = await claudeRunning();
    setInterval(poll, POLL_MS);
  }
});
