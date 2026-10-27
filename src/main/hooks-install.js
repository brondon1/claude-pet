/**
 * 把 claude-pet 的 hook 写进 / 移出 Claude Code 的 ~/.claude/settings.json。
 * 只动自己那几条（command 里带 claude-pet-hook 标记），其余 hooks 原样保留；写入前备份。
 * @module claude-pet/src/main/hooks-install
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { unpacked } from './config.js';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
/** hook 脚本绝对路径。 */
export const HOOK_SCRIPT = unpacked(path.resolve(here, '..', '..', 'hooks', 'claude-pet-hook.mjs'));
/** Claude Code 用户级配置。 */
export const SETTINGS_FILE = path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'settings.json');

/** 需要监听的事件；带 matcher 的是工具类事件。 */
export const EVENTS = [
  'SessionStart',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'Notification',
  'PreCompact',
  'Stop',
  'StopFailure',
  'SessionEnd',
];
const TOOL_EVENTS = new Set(['PreToolUse', 'PostToolUse', 'PostToolUseFailure']);
const MARK = 'claude-pet-hook';

const isOurs = (h) => typeof h?.command === 'string' && h.command.includes(MARK);

/**
 * 从 settings 对象里移除本插件的 hook（纯函数，返回新对象）。
 * @param {any} settings 原 settings
 * @returns {any} 新 settings
 */
export const withoutPetHooks = (settings) => {
  const s = structuredClone(settings ?? {});
  if (!s.hooks) return s;
  for (const ev of Object.keys(s.hooks)) {
    s.hooks[ev] = (s.hooks[ev] || [])
      .map((g) => ({ ...g, hooks: (g.hooks || []).filter((h) => !isOurs(h)) }))
      .filter((g) => g.hooks.length);
    if (!s.hooks[ev].length) delete s.hooks[ev];
  }
  if (!Object.keys(s.hooks).length) delete s.hooks;
  return s;
};

/**
 * 往 settings 对象里加入本插件的 hook（先去重再加，可重复执行）。
 * @param {any} settings 原 settings
 * @param {string} command hook 命令行
 * @returns {any} 新 settings
 */
export const withPetHooks = (settings, command) => {
  const s = withoutPetHooks(settings);
  s.hooks ??= {};
  for (const ev of EVENTS) {
    const group = { hooks: [{ type: 'command', command, timeout: 5 }] };
    if (TOOL_EVENTS.has(ev)) group.matcher = '*';
    (s.hooks[ev] ??= []).push(group);
  }
  return s;
};

/**
 * 实际写进 settings 的命令行。
 * @param {number} port 宠物 HTTP 端口
 * @returns {string} 命令行
 */
export const hookCommand = (port, runner = 'node') => `${runner} "${HOOK_SCRIPT.replace(/\\/g, '/')}" ${port}`;

/**
 * 用什么跑 hook 脚本：有 node 就用 node；装的是 exe 版、电脑上又没装 Node.js 时，让桌宠自己的可执行文件以 Node 模式跑
 * （Claude Code 在 Windows 上用 Git Bash 执行 hook 命令，所以可以写 VAR=1 前缀）。
 */
const hookRunner = () => {
  if (!process.versions.electron) return 'node';
  try {
    execFileSync(process.platform === 'win32' ? 'where' : 'which', ['node'], { stdio: 'ignore', windowsHide: true });
    return 'node';
  } catch {
    return `ELECTRON_RUN_AS_NODE=1 "${process.execPath.replace(/\\/g, '/')}"`;
  }
};

const readSettings = () => (fs.existsSync(SETTINGS_FILE) ? JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) : {});

const writeSettings = (s) => {
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
  if (fs.existsSync(SETTINGS_FILE)) fs.copyFileSync(SETTINGS_FILE, `${SETTINGS_FILE}.claude-pet.bak`);
  fs.writeFileSync(SETTINGS_FILE, `${JSON.stringify(s, null, 2)}\n`);
};

/** 当前是否已安装。 */
export const hooksInstalled = () => {
  try {
    const s = readSettings();
    return Object.values(s.hooks || {}).some((groups) => groups.some((g) => (g.hooks || []).some(isOurs)));
  } catch {
    return false;
  }
};

/**
 * 安装到 ~/.claude/settings.json（会先备份为 settings.json.claude-pet.bak）。
 * @param {number} port 宠物 HTTP 端口
 */
export const installHooks = (port) => writeSettings(withPetHooks(readSettings(), hookCommand(port, hookRunner())));

/** 从 ~/.claude/settings.json 卸载。 */
export const uninstallHooks = () => writeSettings(withoutPetHooks(readSettings()));
