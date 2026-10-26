/**
 * Windows 通知顶栏的发送方身份（名字 + 图标）。未登记的应用 ID 会退回显示「Electron」。两层登记：
 * ① 注册表 HKCU\Software\Classes\AppUserModelId\<APP_ID> 写显示名和图标——Windows 给未打包桌面应用的标准做法；
 * ② 开始菜单快捷方式（带同一应用 ID），顺便能从开始菜单启动。只在缺失或内容变化时写——每次启动都重写会让
 *    Windows 重新建立对应关系，期间通知又退回「Electron」。
 * 多开时通知以第一只宠物的名字发出。
 * @module claude-pet/src/main/identity
 */
import { app, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { ROOT } from './config.js';

export const APP_ID = 'ClaudePet.XiaoCheng';

const safeName = (n) => String(n || APP_ID).replace(/[\\/:*?"<>|]/g, '');
const startMenuLink = (n) => path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', `${safeName(n)}.lnk`);

/**
 * 登记通知身份。
 * @param {string} name 显示名（第一只宠物的名字）
 * @param {string} [oldName] 改名前的名字：有就先把旧快捷方式改名成新名字（不删除），避免同一应用 ID 留两个快捷方式
 */
export const registerToastIdentity = (name, oldName) => {
  if (process.platform !== 'win32') return;
  name = safeName(name);
  if (oldName && safeName(oldName) !== name) {
    const from = startMenuLink(oldName);
    const to = startMenuLink(name);
    try {
      if (fs.existsSync(from) && !fs.existsSync(to)) fs.renameSync(from, to);
    } catch (e) {
      console.warn('[claude-pet] 快捷方式改名失败：', e.message);
    }
  }
  const key = `HKCU\\Software\\Classes\\AppUserModelId\\${APP_ID}`;
  for (const [k, v] of [
    ['DisplayName', name],
    ['IconUri', path.join(ROOT, 'assets', 'sprite', 'icon.png')],
    ['IconBackgroundColor', 'FFFFFFFF'],
  ]) {
    execFile('reg', ['add', key, '/v', k, '/t', 'REG_EXPAND_SZ', '/d', v, '/f'], { windowsHide: true }, (e) => {
      if (e) console.warn('[claude-pet] 通知身份登记失败：', e.message);
    });
  }
  const link = startMenuLink(name);
  const want = {
    target: process.execPath,
    args: `"${ROOT}"`,
    cwd: ROOT,
    description: `${name}（claude-pet 桌宠）`,
    icon: path.join(ROOT, 'assets', 'sprite', 'icon.ico'),
    iconIndex: 0,
    appUserModelId: APP_ID,
  };
  let same = false;
  try {
    const cur = shell.readShortcutLink(link);
    same = cur.target === want.target && cur.args === want.args && cur.appUserModelId === want.appUserModelId && cur.icon === want.icon;
  } catch {
    // 不存在就新建
  }
  if (!same && !shell.writeShortcutLink(link, fs.existsSync(link) ? 'replace' : 'create', want)) {
    console.warn('[claude-pet] 开始菜单快捷方式创建失败');
  }
  retagStrayShortcuts(name);
};

/**
 * Electron 发通知时若找不到它预期的快捷方式，会自己在开始菜单补一个「Electron.lnk」并绑上我们的应用 ID；
 * 同一 ID 有两个快捷方式时 Windows 可能挑中它，通知顶栏就变回「Electron」。
 * 不删它（删了下次通知又会补回来），只把它的应用 ID 改成另一个，让桌宠的 ID 只对应自己的快捷方式。
 * @param {string} name 当前显示名（自己的快捷方式不动）
 */
export const retagStrayShortcuts = (name) => {
  if (process.platform !== 'win32') return;
  const own = startMenuLink(name);
  const dir = path.dirname(own);
  let files = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.lnk'));
  } catch {
    return;
  }
  for (const f of files) {
    const p = path.join(dir, f);
    if (p === own) continue;
    try {
      const l = shell.readShortcutLink(p);
      // 只动 Electron 自动生成的那种：指向本 electron.exe、没有启动参数、带着我们的应用 ID
      if (l.appUserModelId === APP_ID && l.target === process.execPath && !l.args) {
        shell.writeShortcutLink(p, 'update', { appUserModelId: `${APP_ID}.ElectronShim` });
      }
    } catch {
      // 读不了的快捷方式跳过
    }
  }
};
