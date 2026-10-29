/**
 * claude-pet 主进程：管理一只或多只宠物（每只一个 Pet 实例 / 透明小窗），以及它们共用的部分——
 * Claude Code 会话状态、系统通知、定时动作、托盘、设置窗口、HTTP 接口、宠物互撞。
 * @module claude-pet/src/main/main
 */
import { app, BrowserWindow, Menu, Tray, Notification, ipcMain, screen, nativeImage, shell, dialog } from 'electron';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadConfig, saveUserConfig, saveUserValue, USER_CONFIG, PET_DEFAULTS, APP_ARGS } from './config.js';
import { startServer } from './server.js';
import { launchLogin, cleanEnv, onLimitChange } from './brain.js';
import { hooksInstalled, installHooks, uninstallHooks, SETTINGS_FILE } from './hooks-install.js';
import { APP_ID, registerToastIdentity, retagStrayShortcuts } from './identity.js';
import { Pet } from './pet.js';
import { ACTIONS, withVideoActions } from '../shared/behavior.js';
import { SessionTracker } from '../shared/status.js';
import { dueEntries, resolveAction } from '../shared/schedule.js';
import { collide } from '../shared/collision.js';
import { recordObservation, maybeConsolidate, memoryItems, memoryLinks, memoryStats, backfillStats } from './memory.js';
import { routineDigest } from '../shared/memory-chain.js';
import { createVoice } from '../shared/voice.js';
import { DEFAULT_LIMIT_LINES, limitLine, fmtReset } from '../shared/limit.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const TICK_MS = 16;

if (!app.requestSingleInstanceLock()) app.quit();
app.setAppUserModelId(APP_ID);

let { config, warnings } = loadConfig();
/** 当前动作表：内置动作 + 视频素材（渲染端读到视频时长后由 video-meta 合并进来）。 */
let actions = { ...ACTIONS };
/** 视频动作名 → 时长（秒）。 */
let videoMeta = {};
let tracker = new SessionTracker({ texts: config.statusTexts, notifyMinBusyMs: config.notifyMinBusySec * 1000, celebrateChance: () => config.celebrateChance ?? 0.3 });
/** @type {Pet[]} */
let pets = [];
let tray;
/** @type {BrowserWindow | null} */
let settingsWin = null;

const primary = () => pets[0];
registerToastIdentity(config.pets[0].name);

// ===================== 共享服务 =====================
/** 提示登录：气泡附「去登录」按钮。后台调用（碎碎念）触发时 10 分钟内只提示一次。 */
let lastLoginPromptAt = 0;
const promptLogin = (pet, force = false) => {
  if (!force && Date.now() - lastLoginPromptAt < 10 * 60_000) return;
  lastLoginPromptAt = Date.now();
  (pet ?? primary())?.say('Claude Code 还没登录，我的脑子用不了啦～点下面按钮去登录吧', 30_000, { id: 'login', label: '去登录' });
};

/** 托盘 / 通知图标：立绘脸部（scripts/make_sprite.py 生成）。 */
const ICON_FILE = path.join(here, '..', '..', 'assets', 'sprite', 'icon.png');
const trayIcon = (n = 32) => nativeImage.createFromPath(ICON_FILE).resize({ width: n, height: n, quality: 'best' });

const notify = (title, body) => {
  if (!config.notificationsEnabled || !Notification.isSupported()) return;
  new Notification({ title, body, icon: trayIcon(64), silent: false }).show();
  // Electron 可能刚在这次通知时补建了 Electron.lnk，稍后把它的应用 ID 改开，下一条通知就不会挑错
  setTimeout(() => retagStrayShortcuts(config.pets[0].name), 2000);
};

/** @type {import('./pet.js').PetContext} */
const ctx = {
  config: () => config,
  actions: () => actions,
  videoMeta: () => videoMeta,
  tracker: () => tracker,
  promptLogin,
  globalMenu: (pet) => globalMenu(pet),
  observe: (ev) => observe(ev),
  voice: (raw, meta) => voice.line(raw, meta),
};

// 工作状态气泡用她的口吻：所有宠物共用一个改写器，限频调用 Claude Code（src/shared/voice.js）
const voice = createVoice({
  ask: (prompt) => primary().brain.askCli([{ role: 'user', content: prompt }]),
  minIntervalMs: (config.statusVoice?.minIntervalSec ?? 20) * 1000,
});

// ===================== 记忆链 =====================
// 观察主人怎么用 Claude Code、和宠物怎么相处，攒够了就让 Claude Code 整理成「她对主人的了解」（src/main/memory.js）
const consolidate = (force = false) => {
  const pet = primary();
  if (!pet) return Promise.resolve(null);
  return maybeConsolidate(config.memory, pet.brain, {
    name: pet.name,
    force,
    // 学到新东西时，用她自己生成的一句话告诉主人
    onDone: (r) => r.note && pet.st.mode === 'auto' && !pet.chatting && pet.say(r.note, 8000),
  });
};
const observe = (ev) => {
  recordObservation(config.memory, ev);
  consolidate();
};

// ===================== 宠物列表 =====================
/** 按配置增删 / 更新宠物：同 id 原地更新，新增的开窗，删掉的关窗。 */
const reconcilePets = () => {
  const next = [];
  for (const def of config.pets) {
    const old = pets.find((p) => p.id === def.id);
    if (old) {
      old.applyDef(def);
      next.push(old);
    } else {
      const p = new Pet(def, ctx);
      if (app.isReady()) p.createWindow();
      next.push(p);
    }
  }
  for (const p of pets) if (!next.includes(p)) p.destroy();
  pets = next;
  tray?.setToolTip(`claude-pet · ${pets.map((p) => p.name).join('、')}`);
};

/** 把当前宠物列表写回用户配置（改名、设置页保存时用）。 */
const savePets = () => saveUserConfig({ pets: config.pets });

const petOf = (e) => pets.find((p) => p.alive() && p.win.webContents.id === e.sender.id);

/**
 * 改名：写回用户配置；第一只宠物的名字还是通知顶栏 / 开始菜单的名字，一并同步。
 * @param {Pet} pet 宠物
 * @param {string} raw 新名字
 * @returns {boolean} 是否改了
 */
const renamePet = (pet, raw) => {
  const name = String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, 12);
  if (!pet || !name || name === pet.name) return false;
  const old = pet.name;
  const def = config.pets.find((d) => d.id === pet.id);
  def.name = name;
  savePets();
  pet.applyDef(def);
  if (pet === primary()) registerToastIdentity(name, old);
  tray?.setToolTip(`claude-pet · ${pets.map((p) => p.name).join('、')}`);
  pet.whisperNow({ context: `主人刚给你改了名字，从「${old}」改成了「${name}」`, force: true });
  return true;
};

// ===================== Claude Code 事件 =====================
const onHook = (p) => {
  const fx = tracker.apply(p);
  // 记忆链的观察：在哪个项目、什么时候、让 Claude 做了什么（提问只记前 80 字，可在 memory.observePrompts 关掉）
  const project = p.cwd ? path.basename(String(p.cwd)) : undefined;
  const ev = {
    UserPromptSubmit: { t: 'prompt', p: project, s: config.memory?.observePrompts !== false ? String(p.prompt ?? '').slice(0, 80) : undefined },
    SessionStart: { t: 'session', p: project },
    Stop: { t: 'done', p: project },
    StopFailure: { t: 'fail', p: project },
  }[p.hook_event_name];
  if (ev) observe(ev);
  if (fx.notify) notify(fx.notify.title, fx.notify.body);
  // 事件气泡先显示，过几秒随机挑一只宠物顺口评论一句
  const context = {
    SessionStart: '主人刚在 Claude Code 里开了一个新会话',
    Stop: '主人刚让 Claude 完成了一项任务',
    StopFailure: 'Claude 刚刚执行任务时出错了',
    PostToolUseFailure: 'Claude 刚才有一步操作失败了',
  }[p.hook_event_name];
  if (context && pets.length) pets[Math.floor(Math.random() * pets.length)].maybeWhisper(config.whisper.eventChance, context, 6000);
  for (const pet of pets) pet.onHookEffect(fx);
};

// ===================== 随 Claude 自动启动 =====================
// autoStart 开启时：注册开机自启的守望进程（同一个可执行文件带 --watcher，见 index.js / watcher.js，不开窗口），并立刻拉起它；
// 守望进程看到 Claude 桌面端 / Claude Code 打开就启动桌宠。关闭时注销登录项，守望进程读到配置后自行退出。
const WATCHER_ARGS = [...APP_ARGS, '--watcher'];
const syncAutoStart = () => {
  const on = config.autoStart !== false;
  app.setLoginItemSettings({ openAtLogin: on, path: process.execPath, args: WATCHER_ARGS, name: 'ClaudePetWatcher' });
  if (on) spawn(process.execPath, WATCHER_ARGS, { detached: true, stdio: 'ignore', env: cleanEnv(process.env) }).unref();
};

// ===================== 定时动作 =====================
// 到了 config.schedule 里的时刻，所有宠物一起做指定动作；由第一只宠物（经 Claude Code）围绕情境说一句（每条每天一次）
const firedSchedules = new Set();
const checkSchedule = () => {
  for (const { entry, key } of dueEntries(config.schedule, new Date(), firedSchedules)) {
    firedSchedules.add(key);
    const action = resolveAction(entry.action, actions);
    if (action) for (const pet of pets) pet.doAction(action);
    if (entry.context) primary()?.whisperNow({ context: entry.context, force: true });
  }
};

// ===================== 额度用完 / 恢复 =====================
// 所有宠物一起反应：额度用完打瞌睡并说什么时候恢复，到点伸个懒腰报告满血复活
onLimitChange((kind, resetAt) => {
  const cfg = config.limit ?? {};
  if (cfg.enabled === false) return;
  const start = kind === 'start';
  const action = resolveAction(start ? cfg.action : cfg.recoverAction, actions);
  const lines = (start ? cfg.lines : cfg.recoverLines)?.length ? (start ? cfg.lines : cfg.recoverLines) : DEFAULT_LIMIT_LINES[kind];
  const reset = resetAt ? fmtReset(resetAt) : '';
  for (const pet of pets) {
    if (action) pet.doAction(action);
    pet.say(limitLine(lines, { name: pet.def.name, reset }), 10_000);
  }
});

// ===================== 宠物互撞 =====================
// 至少一只在飞（被甩出去）时检测：撞上就按动量守恒弹开；被撞到的、原本在地上的那只也会被撞飞
const collidePets = () => {
  if (!config.physics.petCollision || pets.length < 2) return;
  for (let i = 0; i < pets.length; i++) {
    for (let j = i + 1; j < pets.length; j++) {
      const a = pets[i];
      const b = pets[j];
      if (a.st.mode === 'drag' || b.st.mode === 'drag') continue;
      if (a.st.mode !== 'throw' && b.st.mode !== 'throw') continue;
      const r = collide(
        { box: a.body(), vx: a.st.vx, vy: a.st.vy, m: a.mass() },
        { box: b.body(), vx: b.st.vx, vy: b.st.vy, m: b.mass() },
      );
      if (!r) continue;
      for (const [pet, res] of [
        [a, r.a],
        [b, r.b],
      ]) {
        pet.st.x += res.dx;
        pet.st.y += res.dy;
        if (pet.st.mode === 'throw') {
          pet.st.vx = res.vx;
          pet.st.vy = res.vy;
        } else if (Math.hypot(res.vx, res.vy) > 80) pet.startThrow(res.vx, res.vy - 200);
        pet.commitPos();
      }
    }
  }
};

const tick = () => {
  const now = Date.now();
  for (const pet of pets) {
    pet.tick(now);
    pet.updatePassthrough();
  }
  collidePets();
};

// ===================== 设置窗口 =====================
const settingsSnapshot = () => ({
  pets: config.pets,
  petDefaults: PET_DEFAULTS,
  notificationsEnabled: config.notificationsEnabled,
  autoStart: config.autoStart !== false,
  roam: config.roam,
  walkSpeed: config.walkSpeed,
  idleAnimation: config.idleAnimation,
  celebrateChance: config.celebrateChance,
  memory: config.memory,
  physics: config.physics,
  whisper: { enabled: config.whisper.enabled, minSec: config.whisper.minSec, maxSec: config.whisper.maxSec, cooldownSec: config.whisper.cooldownSec },
  brain: { persona: config.brain.persona, memoryRounds: config.brain.memoryRounds, cliModel: config.brain.cliModel },
  userConfig: USER_CONFIG,
});

const openSettings = () => {
  if (settingsWin && !settingsWin.isDestroyed()) return settingsWin.focus();
  settingsWin = new BrowserWindow({
    width: 760,
    height: 820,
    minWidth: 560,
    title: 'claude-pet 设置',
    icon: trayIcon(64),
    autoHideMenuBar: true,
    backgroundColor: '#fffaf5',
    webPreferences: { preload: path.join(here, '..', 'settings-preload.cjs'), contextIsolation: true, nodeIntegration: false },
  });
  settingsWin.loadFile(path.join(here, '..', 'renderer', 'settings.html'));
  settingsWin.on('closed', () => (settingsWin = null));
};

ipcMain.handle('settings:get', () => settingsSnapshot());
ipcMain.handle('settings:save', (_e, s) => {
  const oldName = config.pets[0].name;
  saveUserConfig({
    pets: s.pets,
    notificationsEnabled: !!s.notificationsEnabled,
    autoStart: !!s.autoStart,
    roam: !!s.roam,
    walkSpeed: Number(s.walkSpeed) || 70,
    idleAnimation: { ...config.idleAnimation, ...s.idleAnimation },
    celebrateChance: Number.isFinite(s.celebrateChance) ? s.celebrateChance : config.celebrateChance,
    memory: { ...config.memory, ...s.memory },
    physics: { ...config.physics, ...s.physics },
    whisper: { ...config.whisper, ...s.whisper },
    brain: { ...config.brain, ...s.brain },
  });
  const r = loadConfig();
  config = r.config;
  registerToastIdentity(config.pets[0].name, oldName);
  reconcilePets();
  syncAutoStart();
  return { ok: true, warnings: r.warnings, snapshot: settingsSnapshot() };
});
ipcMain.handle('settings:open-file', () => shell.openPath(USER_CONFIG));

// ===================== 菜单 =====================
const toggleHooks = async () => {
  const installed = hooksInstalled();
  const { response } = await dialog.showMessageBox({
    type: 'question',
    buttons: [installed ? '卸载' : '安装', '取消'],
    defaultId: 0,
    cancelId: 1,
    title: 'Claude Code 联动',
    message: installed ? '从 Claude Code 卸载桌宠 hooks？' : '把桌宠 hooks 写入 Claude Code 配置？',
    detail: `将修改 ${SETTINGS_FILE}\n（原文件会备份为 settings.json.claude-pet.bak，只增删桌宠自己的条目）\n新开的 Claude Code 会话生效。`,
  });
  if (response !== 0) return;
  try {
    if (installed) uninstallHooks();
    else installHooks(config.port);
    primary()?.say(installed ? '已断开 Claude Code 联动' : '联动好啦！新开个 Claude Code 会话试试~', 6000);
  } catch (e) {
    primary()?.say(`写入失败：${e.message}`, 8000);
  }
};

/** 右键菜单里与具体哪只宠物无关的部分。 */
/**
 * 右键菜单里所有宠物共用的几组（每只宠物的菜单见 pet.js 的 menu()，按组拼起来）：
 * behavior 行为开关、app 应用开关、settings 设置、quit 退出。
 */
const globalMenu = (pet) => ({
  behavior: [
    { label: '到处溜达', type: 'checkbox', checked: config.roam, click: (i) => ((config.roam = i.checked), saveUserValue('roam', i.checked)) },
    {
      label: '拖动后停在原地（不往下掉）',
      type: 'checkbox',
      checked: !!config.physics.stayAfterDrag,
      click: (i) => {
        config.physics = { ...config.physics, stayAfterDrag: i.checked };
        saveUserConfig({ physics: config.physics });
        // 关掉时，悬在半空的宠物自己落回地面
        if (!i.checked) for (const p of pets) if (p.st.mode === 'auto') p.startThrow(0, 0);
      },
    },
  ],
  app: [
    {
      label: '系统通知',
      type: 'checkbox',
      checked: config.notificationsEnabled,
      click: (i) => ((config.notificationsEnabled = i.checked), saveUserValue('notificationsEnabled', i.checked)),
    },
    {
      label: '打开 Claude 时自动启动',
      type: 'checkbox',
      checked: config.autoStart !== false,
      click: (i) => {
        config.autoStart = i.checked;
        saveUserValue('autoStart', i.checked);
        syncAutoStart();
        pet?.say(i.checked ? '好哒，以后打开 Claude 我就自动出来~' : '知道啦，以后要你手动叫我出来', 5000);
      },
    },
    // 只在还没连上时出现（首次启动的提示会让你右键点它）；连上后不再提供断开入口
    ...(hooksInstalled() ? [] : [{ label: '连接 Claude Code（安装 hooks）…', click: toggleHooks }]),
  ],
  settings: [{ label: '设置…', click: openSettings }],
  quit: [{ label: '退出', click: quitWithWave }],
});

// ===================== IPC（按发送窗口找到对应的宠物） =====================
ipcMain.on('video-meta', (_e, meta) => {
  videoMeta = meta || {};
  actions = withVideoActions(videoMeta);
});
ipcMain.on('hit-area', (e, info) => petOf(e)?.setHitArea(info));
ipcMain.on('drag-start', (e) => petOf(e)?.dragStart());
ipcMain.on('drag-end', (e) => petOf(e)?.dragEnd());
ipcMain.on('click', (e, info) => petOf(e)?.click(info));
ipcMain.on('context-menu', (e) => {
  const pet = petOf(e);
  if (pet) pet.menu().popup({ window: pet.win });
});
ipcMain.on('rename', (e, raw) => renamePet(petOf(e), raw));
ipcMain.on('bubble-action', (e, id) => {
  const pet = petOf(e);
  if (!pet) return;
  pet.pinnedUntil = 0;
  if (id === 'login') {
    launchLogin();
    pet.say('在弹出的浏览器里登录，登录完回来找我呀~', 10_000);
  }
});
ipcMain.handle('chat', (e, text) => petOf(e)?.chat(String(text)));
ipcMain.on('chat-closed', (e) => BrowserWindow.fromWebContents(e.sender)?.blur());

// ===================== 启动 =====================
/** HTTP 接口按 ?pet=<id> / body.pet 选宠物，不指定就是第一只。 */
const pick = (id) => (id && pets.find((p) => p.id === id)) || primary();

app.whenReady().then(() => {
  reconcilePets();
  for (const w of warnings) primary()?.say(`配置有问题：${w}`, 8000);
  if (!hooksInstalled()) setTimeout(() => primary()?.say('右键我 →「连接 Claude Code」就能陪你干活啦', 9000), 4000);
  tray = new Tray(trayIcon(32));
  tray.setToolTip(`claude-pet · ${pets.map((p) => p.name).join('、')}`);
  tray.on('click', () => pets.forEach((p) => p.alive() && p.win.showInactive()));
  tray.on('right-click', () => tray.popUpContextMenu(primary().menu()));
  setInterval(tick, TICK_MS);
  setInterval(checkSchedule, 20_000);
  setInterval(() => pets.forEach((p) => p.refreshThought()), 1500);
  syncAutoStart();
  // 第一次用记忆链：从 Claude Code 会话记录补录最近的作息，补到了就马上整理一次，让她立刻知道你的作息
  backfillStats(config.memory)
    .then((n) => n > 0 && consolidate(true))
    .catch((e) => console.warn('[claude-pet] 补录作息失败：', e.message));
  screen.on('display-metrics-changed', () => pets.forEach((p) => p.st.mode === 'auto' && p.startThrow(0, 0)));
  startServer(config.port, {
    hook: onHook,
    say: (t, ttl, id) => pick(id)?.say(t, ttl ?? 6000),
    play: (a, id) => pick(id)?.requestAction(a) ?? false,
    chat: (t, id) => pick(id).chat(t),
    rename: (n, id) => renamePet(pick(id), n),
    openSettings,
    memory: () => ({ items: memoryItems(), links: memoryLinks(), routine: routineDigest(memoryStats()) }),
    consolidate: () => consolidate(true),
    edge: (side, id) => {
      const p = pick(id);
      if (!p) return false;
      if (side === 'left' || side === 'right' || side === 'top') {
        if (p.st.mode === 'drag') return false;
        p.enterEdge(side);
      } else p.leaveEdge();
      return true;
    },
    throw: (vx, vy, id) => {
      const p = pick(id);
      if (!p || p.st.mode !== 'auto') return false;
      p.startThrow(vx, vy);
      return true;
    },
    state: (id) => ({
      ...pick(id)?.state(),
      pets: pets.map((p) => p.state()),
      status: tracker.current(),
      hooksInstalled: hooksInstalled(),
      brain: primary()?.brain.provider(),
    }),
  });
});
app.on('second-instance', () => primary()?.say('我已经在这儿啦~', 3000));
app.on('window-all-closed', () => {
  // 设置窗口关掉不算；宠物窗口都没了才退出
  if (!pets.some((p) => p.alive())) app.quit();
});

/** 退出前大家一起挥手道别：停下手头动作、说声拜拜，挥完手再退出。 */
let quitting = false;
function quitWithWave() {
  if (quitting) return;
  quitting = true;
  for (const pet of pets) {
    if (!pet.alive()) continue;
    pet.st.mode = 'auto';
    pet.st.queue = [];
    pet.say('拜拜，下次见~', 0);
    pet.play('wave', { dur: 60_000 });
  }
  setTimeout(() => app.quit(), Math.min(actions.wave?.dur ?? 2400, 3000));
}
