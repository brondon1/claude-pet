#!/usr/bin/env node
/**
 * 打包 Windows 安装包（dist/claude-pet-Setup-<版本>.exe）。
 * 和 start.mjs 一样找本机已有的 Electron（CLAUDE_PET_ELECTRON → node_modules/electron → ~/.dsh/electron），
 * 交给 electron-builder 直接用，不再重复下载。配置见 package.json 的 build 字段。
 * 用法：npm run dist
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { build } = require('electron-builder');

const findElectronDir = () => {
  if (process.env.CLAUDE_PET_ELECTRON) return path.dirname(process.env.CLAUDE_PET_ELECTRON);
  try {
    return path.dirname(require('electron'));
  } catch {
    // 没装就继续找
  }
  const dsh = path.join(os.homedir(), '.dsh', 'electron');
  return fs.existsSync(path.join(dsh, 'electron.exe')) ? dsh : null;
};

const dir = findElectronDir();
const version = dir && fs.existsSync(path.join(dir, 'version')) ? fs.readFileSync(path.join(dir, 'version'), 'utf8').trim() : null;
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const config = { ...pkg.build, ...(dir && version ? { electronDist: dir, electronVersion: version } : { electronVersion: '43.3.0' }) };
console.log(dir ? `[claude-pet] 使用本机 Electron ${version}：${dir}` : '[claude-pet] 没找到本机 Electron，由 electron-builder 下载');

const out = await build({ projectDir: root, win: ['nsis'], config });
for (const f of out) console.log(`[claude-pet] 产物：${path.relative(root, f)}`);
