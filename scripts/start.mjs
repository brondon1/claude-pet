#!/usr/bin/env node
/**
 * 启动桌宠：找一个可用的 Electron 可执行文件，把项目根当 app 跑起来。
 * 查找顺序：CLAUDE_PET_ELECTRON 环境变量 → node_modules/electron → dsh-pet 下载过的 ~/.dsh/electron。
 * 用法：node scripts/start.mjs [--detach]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

const exeName = { win32: 'electron.exe', darwin: 'Electron.app/Contents/MacOS/Electron' }[process.platform] ?? 'electron';

const findElectron = () => {
  if (process.env.CLAUDE_PET_ELECTRON) return process.env.CLAUDE_PET_ELECTRON;
  try {
    return require('electron'); // npm 包 electron 导出的就是可执行文件路径
  } catch {
    // 没装就继续找
  }
  const dsh = path.join(os.homedir(), '.dsh', 'electron', exeName);
  if (fs.existsSync(dsh)) return dsh;
  return null;
};

const electron = findElectron();
if (!electron) {
  console.error('[claude-pet] 找不到 Electron。请执行 `npm install electron` 或设置 CLAUDE_PET_ELECTRON 指向 electron 可执行文件。');
  process.exit(1);
}

const detach = process.argv.includes('--detach');
// 不把宿主 Claude Code 会话的临时凭证 / 代理地址带进桌宠（见 src/main/brain.js 的 cleanEnv）
const env = Object.fromEntries(
  Object.entries(process.env).filter(
    ([k]) => !/^(CLAUDECODE$|CLAUDE_CODE_|CLAUDE_AGENT_SDK_|CLAUDE_PID$|CLAUDE_PREVIEW_)/.test(k) &&
      !(k === 'ANTHROPIC_BASE_URL' && process.env.CLAUDE_CODE_HOST_SESSION_ID),
  ),
);
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, [root], {
  stdio: detach ? 'ignore' : 'inherit',
  detached: detach,
  env,
  windowsHide: false,
});
if (detach) {
  child.unref();
  console.log(`[claude-pet] 已在后台启动（pid ${child.pid}）`);
} else child.on('exit', (code) => process.exit(code ?? 0));
