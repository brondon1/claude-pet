#!/usr/bin/env node
/**
 * 命令行安装 / 卸载 Claude Code hooks（与右键菜单「连接 Claude Code」等价）。
 * 用法：node scripts/hooks.mjs install|uninstall|status
 */
import { loadConfig } from '../src/main/config.js';
import { installHooks, uninstallHooks, hooksInstalled, SETTINGS_FILE } from '../src/main/hooks-install.js';

const cmd = process.argv[2];
if (cmd === 'install') {
  installHooks(loadConfig().config.port);
  console.log(`已写入 ${SETTINGS_FILE}（备份：settings.json.claude-pet.bak）。新开的 Claude Code 会话生效。`);
} else if (cmd === 'uninstall') {
  uninstallHooks();
  console.log(`已从 ${SETTINGS_FILE} 移除 claude-pet hooks。`);
} else if (cmd === 'status') {
  console.log(hooksInstalled() ? '已安装' : '未安装');
} else {
  console.log('用法：node scripts/hooks.mjs install|uninstall|status');
  process.exit(1);
}
