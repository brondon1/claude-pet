/**
 * 判断一个新启动的进程是不是「打开了 Claude」：Claude 桌面端主进程、Claude Code CLI（原生 claude.exe 或 npm 装的 node 跑 cli.js）。
 * 桌面端（Electron）会带出一堆 --type=renderer / gpu-process 之类的子进程，不算。纯函数，守望进程与测试共用。
 * @module claude-pet/src/shared/claude-proc
 */

/**
 * @param {string} name 进程映像名，如 claude.exe / Claude.exe / node.exe
 * @param {string} cmd 完整命令行
 * @returns {boolean}
 */
export const isClaudeLaunch = (name, cmd = '') => {
  const n = String(name).toLowerCase();
  const c = String(cmd ?? '');
  if (n === 'claude.exe' || n === 'claude') return !/--type=/.test(c);
  if (n === 'node.exe' || n === 'node') return /[\\/]@anthropic-ai[\\/]claude-code[\\/]|[\\/]claude-code[\\/]cli\.(m?js)/i.test(c);
  return false;
};
