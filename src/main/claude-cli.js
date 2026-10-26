/**
 * 定位并启动本机 Claude Code CLI。
 *
 * Windows 上 Claude Code 有两种常见安装方式：
 *   - 原生安装器：`~/.local/bin/claude.exe`，Node 的 spawn 可以直接执行；
 *   - npm 全局安装：`%APPDATA%/npm/claude.cmd`，只是一层批处理 shim，
 *     Node 的 spawn 不会解析 .cmd，直接调用会 ENOENT。
 * 这里按 PATH 与常见安装目录依次找 claude.exe / claude.cmd / claude.bat，
 * .cmd / .bat 经 cmd.exe 转一手，让两种安装下碎碎念与对话都能用。
 * @module claude-pet/src/main/claude-cli
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

/** Windows 上可执行的 Claude Code 入口后缀，按优先级排列。 */
const WIN_EXTS = ['.exe', '.cmd', '.bat'];

const isFile = (p) => {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
};

/**
 * Claude Code 的常见安装目录：即使没进 PATH 也找一次。
 * @param {NodeJS.ProcessEnv} [env] 环境变量
 * @returns {string[]} 目录列表
 */
export const claudeCliDirs = (env = process.env) => {
  const home = env.USERPROFILE || os.homedir();
  return [
    path.join(home, '.local', 'bin'), // 原生安装器
    path.join(home, '.claude', 'local'), // 旧版本地安装
    env.APPDATA ? path.join(env.APPDATA, 'npm') : '', // npm 全局
    env.LOCALAPPDATA ? path.join(env.LOCALAPPDATA, 'Programs', 'claude') : '',
  ].filter(Boolean);
};

/**
 * 找到本机 Claude Code CLI。
 *
 * 优先级：`CLAUDE_PET_CLAUDE` 环境变量 → PATH 里的 claude.exe/.cmd/.bat → 常见安装目录。
 * 非 Windows 直接用 PATH 里的 `claude`。
 * @param {{env?: NodeJS.ProcessEnv, platform?: NodeJS.Platform, exists?: (p: string) => boolean}} [opts]
 * @returns {string|null} 可执行文件路径；找不到返回 null
 */
export const resolveClaudeCli = ({ env = process.env, platform = process.platform, exists = isFile } = {}) => {
  const override = env.CLAUDE_PET_CLAUDE;
  if (override) return exists(override) ? override : null;
  if (platform !== 'win32') return 'claude';
  const pathVar = env.PATH || env.Path || '';
  const dirs = [...pathVar.split(path.delimiter), ...claudeCliDirs(env)];
  for (const raw of dirs) {
    const dir = raw.trim().replace(/^"(.*)"$/, '$1');
    if (!dir) continue;
    for (const ext of WIN_EXTS) {
      const file = path.join(dir, `claude${ext}`);
      if (exists(file)) return file;
    }
  }
  return null;
};

/**
 * cmd.exe 参数的引号处理：整体加引号，内部的 `"` 写成 `""`。
 * @param {string} s 参数
 * @returns {string} 加引号后的参数
 */
const quoteWin = (s) => `"${String(s).replace(/"/g, '""')}"`;

/**
 * 拼出 `cmd.exe /d /s /c` 后面的完整命令行（首尾各多一层引号，cmd 才会正确剥引号）。
 * @param {string} cli 批处理文件路径
 * @param {string[]} args 参数
 * @returns {string} 命令行
 */
export const windowsCmdLine = (cli, args) => `"${quoteWin(cli)} ${args.map(quoteWin).join(' ')}"`;

/**
 * 启动 Claude Code CLI，自动处理 .cmd / .bat 需要经 cmd.exe 的情况。
 * @param {string[]} args CLI 参数
 * @param {{cwd?: string, env?: NodeJS.ProcessEnv, platform?: NodeJS.Platform, cli?: string, spawnFn?: typeof spawn}} [opts] 启动选项
 * @returns {import('node:child_process').ChildProcess} 子进程
 */
export const spawnClaude = (args, { cwd, env = process.env, platform = process.platform, cli, spawnFn = spawn } = {}) => {
  const exe = cli ?? resolveClaudeCli({ env, platform });
  if (!exe) {
    const err = new Error(
      '找不到 Claude Code CLI（claude.exe / claude.cmd）。请先安装 Claude Code，或用环境变量 CLAUDE_PET_CLAUDE 指定它的路径；也可以在环境里配置 ANTHROPIC_API_KEY 改走 API',
    );
    err.code = 'ENOCLI';
    throw err;
  }
  const ext = path.extname(exe).toLowerCase();
  if (platform === 'win32' && (ext === '.cmd' || ext === '.bat')) {
    const comspec = env.ComSpec || process.env.ComSpec || 'cmd.exe';
    return spawnFn(comspec, ['/d', '/s', '/c', windowsCmdLine(exe, args)], {
      cwd,
      env,
      windowsHide: true,
      windowsVerbatimArguments: true,
    });
  }
  return spawnFn(exe, args, { cwd, env, windowsHide: true });
};
