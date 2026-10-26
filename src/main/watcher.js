/**
 * 守望进程：开机自启（Windows 登录项），不开任何窗口，每 5 秒看一眼 Claude（桌面端或 Claude Code）是否在运行。
 * Claude 从「没开」变成「开了」的那一刻，如果桌宠没在运行就把它拉起来；之后你手动退出桌宠，它不会反复拉起，
 * 等下次再打开 Claude 才会。配置 autoStart 改为 false 时自行退出。
 * 由桌宠主进程负责注册登录项和首次启动（见 main.js 的 syncAutoStart）。
 * @module claude-pet/src/main/watcher
 */
import { app } from 'electron';
import { execFile, spawn } from 'node:child_process';
import { loadConfig, ROOT } from './config.js';
import { cleanEnv } from './brain.js';

// 与桌宠本体用不同的应用名 → 不同的单实例锁：守望进程只留一个，且不挡桌宠启动
app.setName('claude-pet-watcher');
if (!app.requestSingleInstanceLock()) app.quit();

const POLL_MS = 5000;

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
  const child = spawn(process.execPath, [ROOT], { detached: true, stdio: 'ignore', env: cleanEnv(process.env) });
  child.unref();
};

let wasRunning = false;
const tick = async () => {
  const { config } = loadConfig();
  if (config.autoStart === false) return app.quit();
  const running = await claudeRunning();
  if (running && !wasRunning && !(await petRunning(config.port))) launchPet();
  wasRunning = running;
};

app.whenReady().then(() => {
  tick();
  setInterval(tick, POLL_MS);
});
