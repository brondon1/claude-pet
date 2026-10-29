/**
 * 一只宠物：一个透明置顶小窗 + 它自己的行为状态（动画链 / 漫游 / 拖拽甩抛 / 气泡 / 碎碎念 / 对话）。
 * 多开时每只宠物一个实例；托盘、hook 状态、通知、定时、HTTP 接口、宠物互撞由 main.js 统一调度。
 * 窗口本身就是宠物：漫游与抛掷靠移动窗口实现，透明区域鼠标穿透。
 * @module claude-pet/src/main/pet
 */
import { BrowserWindow, Menu, screen } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listWebm } from './config.js';
import { Brain, limitPausedUntil } from './brain.js';
import { fmtReset } from '../shared/limit.js';
import { ACTIONS, MENU_GROUPS, VIDEO_GROUP, pickNext, pickClick, idleAnimDelay } from '../shared/behavior.js';
import { STATUS_ANIM } from '../shared/status.js';
import { springStep, trimTrail, estimateReleaseVelocity, throwStep, landingSquash } from '../shared/physics.js';
import { throwBounds } from '../shared/displays.js';
import { PARTS } from '../shared/bodyparts.js';
import { latestThought, statusBubble } from '../shared/thought.js';
import { bodyBox } from '../shared/collision.js';

const here = path.dirname(fileURLToPath(import.meta.url));
/** 边框姿势图的显示高度（站姿高度 size 的倍数，按眼距对齐；与 pet.css 的 --pose-h 一致）。 */
const POSE_H = { left: 0.9, right: 0.63, top: 0.7 };

/** 读会话记录末尾 64KB，取 Claude 最新的可见思考过程（说的话 / 正在做的那一步）。 */
const readThought = (file) => {
  if (!file) return null;
  try {
    const fd = fs.openSync(file, 'r');
    try {
      const size = fs.fstatSync(fd).size;
      const len = Math.min(size, 64 * 1024);
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, size - len);
      return latestThought(buf.toString('utf8'));
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return null;
  }
};

/**
 * @typedef {object} PetContext main.js 提供给每只宠物的共享服务
 * @property {() => any} config 当前成品配置
 * @property {() => Record<string, any>} actions 当前动作表（含视频动作）
 * @property {() => Record<string, number>} videoMeta 视频动作名 → 时长
 * @property {() => any} tracker Claude Code 会话状态跟踪器
 * @property {(pet: Pet) => void} promptLogin 提示登录（带「去登录」按钮）
 * @property {(pet: Pet) => Record<'behavior' | 'app' | 'settings' | 'quit', Electron.MenuItemConstructorOptions[]>} globalMenu
 *   右键菜单里所有宠物共用的几组（行为开关、应用开关、设置、退出）
 */

export class Pet {
  /**
   * @param {any} def 宠物配置（config.pets[] 的一项）
   * @param {PetContext} ctx 共享服务
   */
  constructor(def, ctx) {
    this.def = def;
    this.ctx = ctx;
    this.brain = new Brain(ctx.config, { onAuthError: () => ctx.promptLogin(this), getPet: () => this.def });
    /** 行为状态。x/y 为窗口左上角（浮点，提交时取整）。 */
    this.st = {
      mode: 'auto', // auto | drag | throw
      action: 'idle',
      actionEnd: 0,
      facing: 1,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      grab: { dx: 0, dy: 0 },
      trail: [],
      queue: [],
      statusKey: '',
      bubble: '',
      lastTick: Date.now(),
    };
    this.pinnedUntil = 0;
    this.chatting = false;
    this.whispering = false;
    this.lastWhisperAt = 0;
    this.whisperTimer = null;
    this.clickTimes = [];
    this.layout();
  }

  get id() {
    return this.def.id;
  }

  get name() {
    return this.def.name;
  }

  // ===================== 布局与几何 =====================
  /** 宠物包围盒在窗口底部居中，上方留给气泡。S = 形象高度，PW = 包围盒宽（立绘宽高比约 0.58）。 */
  layout() {
    this.S = this.def.size;
    this.PW = Math.round(this.S * 0.62);
    // 动作视频是 16:9 宽画幅（宽约为人物身高的 2.4 倍），窗口要容得下，透明部分鼠标会穿透
    this.W = Math.max(Math.round(this.S * 2.4), 300);
    this.H = this.S + 130;
  }

  geom() {
    return { W: this.W, H: this.H, S: this.S, PW: this.PW };
  }

  center() {
    return { x: this.st.x + this.W / 2, y: this.st.y + this.H - this.S / 2 };
  }

  /** 身体矩形（宠物互撞用）。 */
  body() {
    return bodyBox(this.st.x, this.st.y, this.geom());
  }

  /** 质量 ∝ 尺寸²（宠物互撞用）。 */
  mass() {
    return (this.S / 200) ** 2;
  }

  /** 漫游时窗口左上角可活动范围：身体贴边、脚踩工作区底边。 */
  bounds() {
    const c = this.center();
    const a = screen.getDisplayNearestPoint({ x: Math.round(c.x), y: Math.round(c.y) }).workArea;
    const side = (this.W - this.PW) / 2 + this.PW * 0.12;
    return { minX: a.x - side, maxX: a.x + a.width - this.W + side, minY: a.y - (this.H - this.S), maxY: a.y + a.height - this.H };
  }

  throwBounds() {
    const c = this.center();
    return throwBounds(screen.getAllDisplays(), c.x, c.y, this.geom());
  }

  // setPosition 只收 int32：Math.round(-0.3) 得到 -0 会被拒，`|| 0` 把 -0 和 NaN 都转成 0
  // 位置和大小一起设：窗口在缩放比例不同的两块屏之间穿越时，Windows 会按新屏的比例把窗口放大 / 缩小，
  // 只 setPosition 不会还原大小，来回几趟窗口越变越大，立绘贴着放大后的窗口底边画，人就沉到任务栏下面去了
  commitPos() {
    if (!this.alive()) return;
    const want = { x: Math.round(this.st.x) || 0, y: Math.round(this.st.y) || 0, width: this.W, height: this.H };
    this.win.setBounds(want);
    // 跨屏那一下 Windows 可能又按新比例改了大小，再设一次
    const b = this.win.getBounds();
    // （125% 之类的缩放下换算会差 1px，这种不算）
    if (Math.abs(b.width - this.W) > 2 || Math.abs(b.height - this.H) > 2) this.win.setBounds(want);
  }

  /** 回到出生角落（按 position 与 offsetX / offsetY）。 */
  placeAtCorner() {
    const a = screen.getPrimaryDisplay().workArea;
    const minX = a.x;
    const maxX = a.x + a.width - this.W;
    const floor = a.y + a.height - this.H;
    const pos = this.def.position || 'bottom-right';
    const ox = this.def.offsetX ?? 24;
    const oy = this.def.offsetY ?? 0;
    this.st.x = pos.endsWith('left') ? minX + ox : maxX - ox;
    this.st.y = pos.startsWith('top') ? a.y - (this.H - this.S) + oy : floor - oy;
    this.commitPos();
    // 顶部出生、或抬离地面的，都会自己掉下来
    if (pos.startsWith('top') || oy > 0) this.startThrow(0, 0);
  }

  // ===================== 窗口 =====================
  alive() {
    return this.win && !this.win.isDestroyed();
  }

  createWindow() {
    this.win = new BrowserWindow({
      width: this.W,
      height: this.H,
      useContentSize: true,
      show: false,
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      hasShadow: false,
      enableLargerThanScreen: true,
      backgroundColor: '#00000000',
      webPreferences: {
        preload: path.join(here, '..', 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        spellcheck: false,
        backgroundThrottling: false,
      },
    });
    this.win.setAlwaysOnTop(true, 'screen-saver');
    this.win.setIgnoreMouseEvents(true, { forward: true });
    this.ignoring = true;
    this.hit = null;
    this.win.loadFile(path.join(here, '..', 'renderer', 'index.html'));
    this.win.once('ready-to-show', () => {
      this.placeAtCorner();
      this.win.showInactive();
    });
    this.win.webContents.on('did-finish-load', () => {
      this.sendInit();
      this.next();
      this.st.queue.push('wave');
      this.scheduleWhisper();
    });
    return this.win;
  }

  destroy() {
    clearTimeout(this.whisperTimer);
    if (this.alive()) this.win.destroy();
  }

  send(ch, payload) {
    if (this.alive()) this.win.webContents.send(ch, payload);
  }

  sendInit() {
    this.send('init', { size: this.S, width: this.W, height: this.H, name: this.name, webm: listWebm(), actions: ACTIONS });
  }

  /** 配置变了：更新定义；尺寸变了就按脚底不动重新布局窗口。 */
  applyDef(def) {
    const oldS = this.S;
    this.def = def;
    this.layout();
    if (oldS !== this.S && this.alive()) {
      const bottom = this.st.y + this.H - (this.S - oldS);
      this.win.setContentSize(this.W, this.H);
      this.st.y = bottom - this.H;
      this.commitPos();
    }
    this.sendInit();
    this.scheduleWhisper();
    this.interrupt();
  }

  // ===================== 动作与气泡 =====================
  /**
   * 播放一个动作。
   * @param {string} action 动作名
   * @param {{dur?: number}} [o] 选项
   */
  play(action, o = {}) {
    const actions = this.ctx.actions();
    if (action !== this.st.action && actions[action]?.cat === 'fun') {
      this.maybeWhisper(this.ctx.config().whisper.actionChance, `你正在${actions[action].label}`);
    }
    this.st.action = action;
    this.st.actionEnd = Date.now() + (o.dur ?? actions[action]?.dur ?? 3000);
    this.send('play', { action, facing: this.st.facing });
  }

  /**
   * 头顶气泡。ttl=0 表示常驻直到被替换或清除。
   * 带按钮的气泡（如「去登录」）置顶：显示期间不被工作状态、碎碎念等普通气泡顶掉，点了按钮或到时才放开。
   * @param {string} text 文本（空串 = 清除）
   * @param {number} [ttl] 毫秒
   * @param {{id: string, label: string}} [action] 气泡里附带的按钮
   */
  say(text, ttl = 6000, action) {
    if (!action && Date.now() < this.pinnedUntil) return;
    this.pinnedUntil = action ? Date.now() + (ttl || 30_000) : 0;
    this.st.bubble = text;
    this.send('bubble', { text, ttl, action });
  }

  // ===================== 调度 =====================
  activeStatus() {
    return this.def.workStatusEnabled ? this.ctx.tracker().current() : null;
  }

  statusBubble(s) {
    // 思考 / 干活时，把 Claude 此刻在做的事交给 Claude Code 改写成她自己的话；还没改写好就用兜底文案（也是她的口吻）
    if (s.status !== 'thinking' && s.status !== 'working') return statusBubble(s);
    const voice = this.ctx.config().statusVoice;
    const raw = readThought(s.transcript) || s.text;
    const project = String(s.cwd ?? '').split(/[\\/]/).filter(Boolean).pop();
    const said = voice?.enabled === false ? null : this.ctx.voice(raw, { project, status: s.status === 'thinking' ? '思考中' : '干活中' });
    return statusBubble(s, said);
  }

  /** 当前动作播完 / 被打断后选下一个。 */
  next() {
    const st = this.st;
    if (st.mode === 'edge') return this.nextOnEdge();
    if (st.queue.length) return this.play(st.queue.shift());
    const s = this.activeStatus();
    if (s) {
      const key = `${s.status}|${s.text}`;
      if (key !== st.statusKey) this.say(this.statusBubble(s), 0);
      st.statusKey = key;
      return this.play(STATUS_ANIM[s.status]);
    }
    if (st.statusKey) {
      st.statusKey = '';
      if (st.bubble) this.say('');
    }
    const cfg = this.ctx.config();
    const fixed = this.def.fixed;
    let weights = fixed ? { ...cfg.animationWeights, move: 0, turn: 0 } : cfg.animationWeights;
    // 待机随机动画：开着时小动作只由这个计时器触发（频率 = idleAnimation 的 minSec~maxSec），动画链里只剩待机 / 散步 / 转身
    const ia = cfg.idleAnimation;
    if (ia?.enabled) {
      const now = Date.now();
      st.nextFunAt ||= now + idleAnimDelay(ia);
      if (now >= st.nextFunAt) {
        const actions = this.ctx.actions();
        const fun = pickNext({ prev: st.action, weights: { fun: 1 }, canWalk: false, actions });
        // 从这段小动作播完算起，间隔就是两段小动作之间实际的空档
        st.nextFunAt = now + (actions[fun]?.dur ?? 0) + idleAnimDelay(ia);
        return this.play(fun);
      }
      weights = { ...weights, fun: 0 };
    }
    const a = pickNext({ prev: st.action, weights, canWalk: cfg.roam && !fixed, actions: this.ctx.actions() });
    // 待机快到点时缩短这段待机，让小动作准时出来
    if (a === 'idle' && ia?.enabled) return this.play('idle', { dur: Math.min(this.ctx.actions().idle.dur, Math.max(1000, st.nextFunAt - Date.now())) });
    if (a === 'turn') st.facing = -st.facing;
    if (a === 'walk') {
      // 前方空间不足就先转身
      const b = this.bounds();
      const room = st.facing > 0 ? b.maxX - st.x : st.x - b.minX;
      if (room < 40) st.facing = -st.facing;
      return this.play('walk', { dur: 2500 + Math.random() * 4000 });
    }
    this.play(a);
  }

  /** 立即打断当前动作（拖拽 / 抛掷中不打断）。 */
  interrupt() {
    if (this.st.mode === 'auto' || this.st.mode === 'edge') this.next();
  }

  /** 排一个动作并立刻开始（拖拽 / 抛掷中只排队）。 */
  doAction(a) {
    // 趴在边上时先下来，落地后再做
    if (this.st.mode === 'edge') this.leaveEdge();
    this.st.queue = [a];
    if (this.st.mode !== 'auto') return;
    if (a === 'walk') return this.play('walk', { dur: 4000 });
    this.next();
  }

  startThrow(vx, vy) {
    this.st.mode = 'throw';
    this.st.vx = vx;
    this.st.vy = vy;
    this.play('fall');
  }

  // ===================== 趴在屏幕边上 =====================
  /** 身体贴着工作区左 / 右边时返回 'left' / 'right'，否则 null。 */
  /**
   * 离哪条边框最近（左 / 右 / 上，在 margin 以内才算），拖出边框外的也算贴着那条边。
   * 站姿下：身体左右贴边时窗口 x = bounds.minX / maxX，头顶贴工作区上沿时窗口 y = bounds.minY。
   */
  edgeSide(margin = 60) {
    const b = this.bounds();
    const d = { left: this.st.x - b.minX, right: b.maxX - this.st.x, top: this.st.y - b.minY };
    const [side, dist] = Object.entries(d).sort((x, y) => x[1] - y[1])[0];
    return dist <= margin ? side : null;
  }

  /**
   * 扒到屏幕边框上：左 / 右边换成扒着屏幕边探头的姿势图，上边换成趴在上边框往下看的姿势图
   * （渲染端 #pet.edge-left / edge-right / edge-top）。贴到离放手位置最近的那一点：左右边保留高度，上边保留左右位置。
   * 待一会儿（edge.minStaySec~maxStaySec）自己下来，拖她也会下来。
   */
  enterEdge(side) {
    const st = this.st;
    const cfg = this.ctx.config().edge ?? {};
    const a = screen.getDisplayNearestPoint({ x: Math.round(this.center().x), y: Math.round(this.center().y) }).workArea;
    const b = this.bounds();
    st.mode = 'edge';
    st.edge = side;
    st.vx = st.vy = 0;
    if (side === 'top') {
      // 窗口顶贴着工作区上沿，姿势图画在窗口顶部（气泡在她下面）
      st.x = Math.max(b.minX, Math.min(b.maxX, st.x));
      st.y = a.y;
    } else {
      // 窗口贴着屏幕边，高度就用放手的高度；姿势图（贴窗口底）整张都得在工作区里
      const ph = this.S * POSE_H[side];
      st.x = side === 'right' ? a.x + a.width - this.W : a.x;
      st.y = Math.max(a.y - (this.H - ph), Math.min(a.y + a.height - this.H, st.y));
    }
    const min = (cfg.minStaySec ?? 60) * 1000;
    const max = Math.max(min, (cfg.maxStaySec ?? 240) * 1000);
    st.edgeUntil = Date.now() + min + Math.random() * (max - min);
    st.queue = [];
    this.commitPos();
    this.send('edge', side);
    this.play('idle');
  }

  /** 从边上下来：恢复站姿，轻轻跳回屏幕里落地。 */
  leaveEdge() {
    const st = this.st;
    if (st.mode !== 'edge') return;
    const side = st.edge;
    st.edge = null;
    this.send('edge', null);
    const b = this.bounds();
    if (side === 'top') st.y = b.minY;
    else {
      st.x = side === 'right' ? b.maxX : b.minX;
      st.facing = side === 'right' ? -1 : 1;
    }
    this.commitPos();
    // 「放哪停哪」开着就在原处站着；否则左右边轻轻跳回屏幕里，上边直接掉下来
    if (this.ctx.config().physics.stayAfterDrag) return this.stayHere();
    if (side === 'top') this.startThrow(0, 0);
    else this.startThrow(side === 'right' ? -160 : 160, -260);
  }

  /** 趴在边上时的「下一个动作」：一直趴着（只眨眼呼吸），工作状态照样更新气泡，到点就下来。 */
  nextOnEdge() {
    const st = this.st;
    st.queue = [];
    if (Date.now() >= st.edgeUntil) return this.leaveEdge();
    const s = this.activeStatus();
    if (s) {
      const key = `${s.status}|${s.text}`;
      if (key !== st.statusKey) this.say(this.statusBubble(s), 0);
      st.statusKey = key;
    } else if (st.statusKey) {
      st.statusKey = '';
      if (st.bubble) this.say('');
    }
    this.play('idle');
  }

  /** 渲染端报来的可点区域（窗口内坐标）；all = 整窗接收鼠标（拖拽中 / 对话框开着）。 */
  setHitArea(info) {
    this.hit = info;
  }

  /**
   * 每帧按光标位置决定窗口是否穿透：光标在身体 / 气泡 / 对话框上就接收鼠标，否则点穿到下面。
   * 在主进程做而不是等渲染端的 mousemove：她自己移动到静止的光标下也能立刻点到。
   */
  updatePassthrough() {
    if (!this.alive()) return;
    let ignore = true;
    if (this.st.mode === 'drag' || this.hit?.all) ignore = false;
    else if (this.hit?.rects?.length) {
      const c = screen.getCursorScreenPoint();
      const b = this.win.getBounds();
      const x = c.x - b.x;
      const y = c.y - b.y;
      ignore = !this.hit.rects.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
    }
    if (ignore === this.ignoring) return;
    this.ignoring = ignore;
    this.win.setIgnoreMouseEvents(ignore, { forward: true });
  }

  /** 每帧推进。 */
  tick(now) {
    const st = this.st;
    const dt = Math.min((now - st.lastTick) / 1000, 0.05);
    st.lastTick = now;
    if (!this.alive()) return;
    const cfg = this.ctx.config();

    if (st.mode === 'drag') {
      const c = screen.getCursorScreenPoint();
      st.trail = trimTrail([...st.trail, { x: c.x, y: c.y, t: now }], now);
      Object.assign(st, springStep({ x: st.x, y: st.y, vx: st.vx, vy: st.vy }, { x: c.x - st.grab.dx, y: c.y - st.grab.dy }, dt));
      this.commitPos();
      return;
    }

    if (st.mode === 'edge') {
      if (now >= st.actionEnd) this.next();
      return;
    }

    if (st.mode === 'throw') {
      // 多屏：紧挨另一块屏的那一侧不反弹，直接飞过去；落地在当前所在屏的底边
      const r = throwStep({ x: st.x, y: st.y, vx: st.vx, vy: st.vy }, this.throwBounds(), dt, cfg.physics);
      Object.assign(st, r.state);
      if (Math.abs(st.vx) > 30) st.facing = st.vx > 0 ? 1 : -1;
      if (r.landed) {
        const q = landingSquash(r.landed);
        if (q > 0) this.send('squash', { amount: q });
      }
      this.commitPos();
      if (r.resting) {
        st.mode = 'auto';
        st.queue.unshift(r.landed > 1600 ? 'click-dizzy' : 'idle');
        this.next();
      }
      return;
    }

    // auto
    if (st.action === 'walk') {
      const b = this.bounds();
      st.x += st.facing * cfg.walkSpeed * dt;
      if (st.x <= b.minX || st.x >= b.maxX) {
        st.x = Math.max(b.minX, Math.min(b.maxX, st.x));
        const edge = cfg.edge ?? {};
        if (edge.enabled !== false && st.y >= b.maxY - 2 && Math.random() < (edge.walkChance ?? 0.3)) {
          this.enterEdge(st.x <= b.minX ? 'left' : 'right');
          this.maybeWhisper(this.ctx.config().whisper.actionChance, '你走到屏幕边上，干脆趴在边上探出头来看主人', 800);
          return;
        }
        st.facing = -st.facing;
        this.play('turn');
      }
      this.commitPos();
    } else {
      // 不在地面上（比如分辨率变了 / 被系统挪了 / 放在了下方还有屏的屏上）就掉下去；「放哪停哪」开着时悬空也不掉，
      // 只有跑到地面以下（任务栏后面）才回到地面
      const b = this.throwBounds();
      const stay = cfg.physics.stayAfterDrag;
      if (stay ? st.y > b.maxY + 2 : st.y < b.maxY - 2 || st.y > b.maxY + 2) {
        st.y = Math.min(st.y, b.maxY);
        return this.startThrow(0, 0);
      }
    }
    if (now >= st.actionEnd) this.next();
  }

  /** 跟随工作状态时刷新气泡里的思考过程（hook 只在工具前后触发，中间说的话靠它跟上）。 */
  refreshThought() {
    const s = this.activeStatus();
    if (!s || (this.st.mode !== 'auto' && this.st.mode !== 'edge') || this.chatting) return;
    const text = this.statusBubble(s);
    if (text !== this.st.bubble) this.say(text, 0);
  }

  /**
   * Claude Code 事件：main.js 已经把事件喂给共享的 tracker，这里只处理这只宠物的反应。
   * @param {{oneShot?: string, bubble?: string}} fx 本次事件的一次性效果
   */
  onHookEffect(fx) {
    if (!this.def.workStatusEnabled) return;
    const st = this.st;
    if (fx.oneShot) st.queue.push(fx.oneShot);
    if (fx.bubble) this.say(fx.bubble, 5000);
    const s = this.ctx.tracker().current();
    const key = s ? `${s.status}|${s.text}` : '';
    if (fx.oneShot || key !== st.statusKey) {
      // 文案变了但动画不变时只换气泡，不重播
      if (!fx.oneShot && s && st.statusKey && STATUS_ANIM[s.status] === st.action) {
        st.statusKey = key;
        this.say(this.statusBubble(s), 0);
      } else this.interrupt();
    }
  }

  // ===================== 对话 / 碎碎念 =====================
  async chat(text) {
    const paused = limitPausedUntil();
    if (paused) {
      // 额度暂停中：不打断她（多半正在打瞌睡），直接告诉你什么时候恢复
      const e = new Error(`Claude Code 额度用完啦，${fmtReset(paused)} 恢复`);
      e.code = 'LIMIT';
      this.say(`${e.message}~`, 8000);
      throw e;
    }
    this.chatting = true;
    this.say('嗯…让我想想', 0);
    this.play('think', { dur: 120_000 });
    try {
      const reply = await this.brain.chat(text);
      this.ctx.observe({ t: 'chat', s: `主人对${this.name}说「${text.slice(0, 80)}」，${this.name}回「${reply.slice(0, 50)}」` });
      this.say(reply, Math.min(20_000, 5000 + reply.length * 180));
      this.st.queue.push('click-happy');
      return reply;
    } catch (e) {
      if (e.code === 'AUTH') this.ctx.promptLogin(this, true);
      else if (e.code === 'LIMIT') { if (!e.fresh) this.say(`${e.message}~`, 8000); }
      else this.say(`呜，脑子卡住了：${String(e.message).slice(0, 60)}`, 8000);
      if (e.code !== 'LIMIT') this.st.queue.push('error'); // 额度用完由 limit.action 接管（默认打瞌睡）
      throw e;
    } finally {
      this.chatting = false;
      // 只结束「思考」动画；期间被换成别的动作（如额度用完打瞌睡）就让它播完
      if (this.st.action === 'think') this.st.actionEnd = 0;
    }
  }

  // 碎碎念：随机时间 / 做小动作时 / Claude Code 事件后 / 被点击 / 主人点播动作时自动冒出来，
  // 每句都由 Claude Code 现场生成。任意两句之间至少隔 cooldownSec；聊天中、跟随工作状态中、被拎着时不说。
  scheduleWhisper() {
    clearTimeout(this.whisperTimer);
    const w = this.ctx.config().whisper;
    if (!w.enabled || !this.def.whisperEnabled) return;
    const lo = Math.max(30, w.minSec ?? 180);
    const hi = Math.max(lo, w.maxSec ?? 600);
    this.whisperTimer = setTimeout(async () => {
      await this.whisperNow({ dance: true });
      this.scheduleWhisper();
    }, (lo + Math.random() * (hi - lo)) * 1000);
  }

  /**
   * 说一句碎碎念。
   * @param {{context?: string, dance?: boolean, force?: boolean}} [o] context：此刻发生了什么；dance：说完哼个小曲；force：不受冷却限制
   */
  async whisperNow(o = {}) {
    const w = this.ctx.config().whisper;
    if (!w.enabled || this.whispering || this.chatting || this.activeStatus() || this.st.mode !== 'auto') return;
    if (!o.force && Date.now() - this.lastWhisperAt < (w.cooldownSec ?? 60) * 1000) return;
    this.whispering = true;
    this.lastWhisperAt = Date.now();
    try {
      const line = await this.brain.whisper(o.context);
      if (!line || this.chatting || this.activeStatus()) return;
      this.say(line, 7000);
      if (o.dance && this.st.mode === 'auto' && !['walk', 'sleep'].includes(this.st.action)) {
        this.st.queue.push('sing');
        this.interrupt();
      }
    } catch (e) {
      console.error('[claude-pet] 碎碎念失败：', e.message);
    } finally {
      this.whispering = false;
    }
  }

  /** 按概率触发一句和某件事相关的碎碎念。 */
  maybeWhisper(chance, context, delayMs = 0) {
    if (!this.def.whisperEnabled || Math.random() >= (chance ?? 0)) return;
    setTimeout(() => this.whisperNow({ context }), delayMs);
  }

  // ===================== 交互 =====================
  dragStart() {
    if (this.st.mode === 'edge') {
      this.st.edge = null;
      this.send('edge', null);
    }
    const c = screen.getCursorScreenPoint();
    this.st.grab = { dx: c.x - this.st.x, dy: c.y - this.st.y };
    this.st.vx = this.st.vy = 0;
    this.st.trail = [];
    this.st.mode = 'drag';
    this.play('drag');
  }

  dragEnd() {
    if (this.st.mode !== 'drag') return;
    const cfg = this.ctx.config();
    const v = estimateReleaseVelocity(this.st.trail, Date.now(), cfg.physics.throwPower);
    const stay = cfg.physics.stayAfterDrag;
    // 拖到左 / 右 / 上边框附近松手（不是用力甩出去）就扒到最近的那条边框上
    const gentle = stay || Math.hypot(v?.vx ?? 0, v?.vy ?? 0) < 900;
    const side = cfg.edge?.enabled !== false && gentle ? this.edgeSide() : null;
    if (side) return this.enterEdge(side);
    if (stay) return this.stayHere();
    this.startThrow(v?.vx ?? 0, v?.vy ?? 0);
  }

  /** 「放哪停哪」：不甩也不掉，就停在松手的位置（收进当前屏幕的工作区里，免得半个身子在屏幕外）。 */
  stayHere() {
    const st = this.st;
    const b = this.bounds();
    st.x = Math.max(b.minX, Math.min(b.maxX, st.x));
    st.y = Math.max(b.minY, Math.min(b.maxY, st.y));
    st.vx = st.vy = 0;
    st.mode = 'auto';
    this.commitPos();
    st.queue.unshift('idle');
    this.next();
  }

  /** 点哪里说哪里：每个部位有自己的情境和小反应；连续点击会告诉 Claude 碰了几下。 */
  click(info) {
    if (this.st.mode !== 'auto' && this.st.mode !== 'edge') return;
    this.send('squash', { amount: 0.25 });
    const part = PARTS[info?.part];
    const now = Date.now();
    const win = (this.ctx.config().whisper.clickWindowSec ?? 6) * 1000;
    this.clickTimes = [...this.clickTimes.filter((t) => now - t < win), now];
    const n = this.clickTimes.length;
    const ctx = part ? part.context : '主人戳了你一下';
    this.ctx.observe({ t: 'click', s: part?.label ?? '身体' });
    const where = this.st.mode === 'edge' ? '（你正趴在屏幕边上探头）' : '';
    this.whisperNow({ context: (n > 1 ? `${ctx}（已经连续碰了你 ${n} 下）` : ctx) + where, force: true });
    if (this.st.mode === 'edge') return;
    this.st.queue = [part?.reaction ?? pickClick()];
    this.next();
  }

  /** 主人点播动作：必定通过 Claude Code 说一句和它有关的话。 */
  requestAction(a) {
    const actions = this.ctx.actions();
    if (!actions[a]) return false;
    this.ctx.observe({ t: 'play', s: actions[a].label });
    if (this.st.mode === 'auto') this.whisperNow({ context: `主人让你${actions[a].label}`, force: true });
    this.doAction(a);
    return true;
  }

  openInput(o) {
    if (!this.alive()) return;
    this.win.focus();
    this.send('chat-open', o);
  }

  menu() {
    const actions = this.ctx.actions();
    const videoMeta = this.ctx.videoMeta();
    const extra = Object.keys(videoMeta).filter((k) => !ACTIONS[k]);
    const g = this.ctx.globalMenu(this);
    const sep = { type: 'separator' };
    return Menu.buildFromTemplate([
      // 和她互动
      { label: '和我聊天…', click: () => this.openInput() },
      {
        label: '动作',
        submenu: Object.entries({ ...MENU_GROUPS, ...(extra.length ? { [VIDEO_GROUP]: extra } : {}) }).map(([group, list]) => ({
          label: group,
          submenu: list.map((a) => ({ label: actions[a].label, click: () => this.requestAction(a) })),
        })),
      },
      {
        label: `给我改名字…（现在叫「${this.name}」）`,
        click: () => this.openInput({ mode: 'rename', placeholder: '给我起个新名字，回车确定（Esc 取消）', value: this.name }),
      },
      sep,
      // 她怎么动
      ...g.behavior,
      { label: '回到初始位置', click: () => this.placeAtCorner() },
      sep,
      // 应用
      ...g.app,
      sep,
      ...g.settings,
      sep,
      ...g.quit,
    ]);
  }

  state() {
    const st = this.st;
    return {
      id: this.id,
      name: this.name,
      mode: st.mode,
      edge: st.edge ?? null,
      action: st.action,
      facing: st.facing,
      bounds: { x: Math.round(st.x), y: Math.round(st.y), width: this.W, height: this.H },
      // 窗口实际的位置大小（应与 bounds 一致；不一致说明跨屏缩放把窗口改了）
      window: this.alive() ? this.win.getBounds() : null,
      bubble: st.bubble,
      // 当前是否鼠标穿透（光标不在她身上时为 true），以及身体的可点区域（窗口内坐标）
      passthrough: this.ignoring,
      hitArea: this.hit?.rects?.[0] ?? null,
    };
  }
}

