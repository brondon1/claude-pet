/**
 * 动画表与动画链：每个动画播完按权重选下一个，首尾相接。
 * 纯逻辑，主进程调度与测试共用；渲染端只按名字播放。
 * @module claude-pet/src/shared/behavior
 */

/**
 * 动画表。cat 决定所属权重桶；dur 为单次时长（ms）；loop 表示状态动画会一直循环直到状态解除。
 * label 用于右键菜单点播。
 */
export const ACTIONS = {
  // 待机
  idle: { cat: 'idle', dur: 4200, label: '待机呼吸' },
  // 移动 / 转向
  walk: { cat: 'move', dur: 4000, label: '散步' },
  turn: { cat: 'turn', dur: 500, label: '转身' },
  // 休闲动作
  sleep: { cat: 'fun', dur: 9000, label: '打瞌睡' },
  jump: { cat: 'fun', dur: 1800, label: '蹦一蹦' },
  wave: { cat: 'fun', dur: 2400, label: '挥挥手' },
  dance: { cat: 'fun', dur: 4800, label: '跳舞' },
  look: { cat: 'fun', dur: 3600, label: '东张西望' },
  eat: { cat: 'fun', dur: 5200, label: '吃饼干' },
  read: { cat: 'fun', dur: 6500, label: '看书' },
  sing: { cat: 'fun', dur: 4800, label: '哼小曲' },
  spin: { cat: 'fun', dur: 1600, label: '转圈圈' },
  stretch: { cat: 'fun', dur: 3200, label: '伸懒腰' },
  coffee: { cat: 'fun', dur: 5000, label: '喝咖啡' },
  // 点击回应
  'click-happy': { cat: 'click', dur: 1500, label: '开心' },
  'click-shy': { cat: 'click', dur: 1800, label: '害羞' },
  'click-dizzy': { cat: 'click', dur: 2000, label: '晕乎乎' },
  // 工作状态（跟随 Claude Code 会话）
  think: { cat: 'status', dur: 3000, loop: true, label: '思考' },
  work: { cat: 'status', dur: 3000, loop: true, label: '敲代码' },
  wait: { cat: 'status', dur: 3000, loop: true, label: '等你批准' },
  organize: { cat: 'status', dur: 3000, loop: true, label: '整理记忆' },
  success: { cat: 'status', dur: 3200, label: '庆祝' },
  error: { cat: 'status', dur: 2600, label: '出错了' },
  // 物理
  drag: { cat: 'physics', dur: 1000, loop: true, label: '被拎起' },
  fall: { cat: 'physics', dur: 1000, loop: true, label: '飞行' },
};

/** 右键菜单「动作」分组：分类名 → 动作名列表。 */
export const MENU_GROUPS = {
  日常: ['idle', 'walk', 'turn', 'stretch', 'look', 'sleep'],
  玩耍: ['jump', 'wave', 'dance', 'spin', 'sing'],
  吃喝: ['eat', 'coffee', 'read'],
  回应: ['click-happy', 'click-shy', 'click-dizzy'],
  工作: ['think', 'work', 'wait', 'organize', 'success', 'error'],
};

/** 默认分类权重。 */
export const DEFAULT_WEIGHTS = { idle: 10, move: 5, turn: 3, fun: 6 };

/**
 * 按权重随机选一项。
 * @template T
 * @param {{item:T, w:number}[]} entries 候选与权重
 * @param {() => number} [rand] 随机源
 * @returns {T|undefined} 选中项
 */
export const weightedPick = (entries, rand = Math.random) => {
  const total = entries.reduce((s, e) => s + Math.max(0, e.w), 0);
  if (total <= 0) return undefined;
  let r = rand() * total;
  for (const e of entries) {
    r -= Math.max(0, e.w);
    if (r < 0) return e.item;
  }
  return entries[entries.length - 1].item;
};

/**
 * 动画链：选下一个自动动画。fun 桶内均分；不连续两次播同一个 fun 动作。
 * @param {{prev?:string, weights?:Record<string,number>, canWalk?:boolean, rand?:() => number,
 *   actions?: Record<string, {cat:string}>}} o 选项；actions 默认内置表，可传入合并了视频动作的表
 * @returns {string} 动作名
 */
export const pickNext = ({ prev, weights = DEFAULT_WEIGHTS, canWalk = true, rand = Math.random, actions = ACTIONS } = {}) => {
  const fun = Object.keys(actions).filter((k) => actions[k].cat === 'fun' && k !== prev);
  const cat = weightedPick(
    [
      { item: 'idle', w: weights.idle ?? 0 },
      { item: 'move', w: canWalk ? (weights.move ?? 0) : 0 },
      { item: 'turn', w: weights.turn ?? 0 },
      { item: 'fun', w: fun.length ? (weights.fun ?? 0) : 0 },
    ],
    rand,
  );
  if (cat === 'move') return 'walk';
  if (cat === 'turn') return 'turn';
  if (cat === 'fun') return fun[Math.floor(rand() * fun.length)];
  return 'idle';
};

/**
 * 待机时多久随机来一段小动作（毫秒）：在 [minSec, maxSec] 里均匀取，maxSec 小于 minSec 时按 minSec。
 * @param {{minSec?: number, maxSec?: number}} o 配置 idleAnimation
 * @param {() => number} [rand] 随机源
 */
export const idleAnimDelay = ({ minSec = 15, maxSec = 45 } = {}, rand = Math.random) => {
  const lo = Math.max(3, Number(minSec) || 15);
  const hi = Math.max(lo, Number(maxSec) || lo);
  return Math.round((lo + rand() * (hi - lo)) * 1000);
};

/** 点击回应随机选一个。 */
export const pickClick = (rand = Math.random) => {
  const list = Object.keys(ACTIONS).filter((k) => ACTIONS[k].cat === 'click');
  return list[Math.floor(rand() * list.length)];
};

/** 视频动作在右键菜单里的分组名。 */
export const VIDEO_GROUP = '视频动作';

/**
 * 把视频素材并入动作表：同名视频替换该动作的画面，并改用视频时长（循环的工作状态动作也一样）；
 * 不在内置表里的视频（如「吃冰淇淋」「煮火锅」）作为新的休闲动作加入动画链。
 * @param {Record<string, number>} videos 动作名 → 视频时长（秒）
 * @param {typeof ACTIONS} [base] 内置动作表
 * @returns {Record<string, {cat:string, dur:number, label:string, loop?:boolean, video?:boolean}>} 合并后的表
 */
export const withVideoActions = (videos, base = ACTIONS) => {
  const out = { ...base };
  for (const [name, sec] of Object.entries(videos || {})) {
    const dur = sec > 0 ? Math.round(sec * 1000) : 10_000;
    // 工作状态这类循环动作也按视频时长计：播完一整遍再重新开始，不在中途切断
    out[name] = base[name]
      ? { ...base[name], dur, video: true }
      : { cat: 'fun', dur, label: name, video: true };
  }
  return out;
};
