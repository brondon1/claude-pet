/**
 * 定时动作：到了配置里的时刻（如 12:00）就做指定动作并说一句应景的话，每条每天最多触发一次。
 * 纯函数，主进程与测试共用。
 * @module claude-pet/src/shared/schedule
 */

/**
 * @typedef {object} ScheduleEntry
 * @property {string} time 触发时刻 "HH:MM"（24 小时制）
 * @property {string|string[]} action 动作名；数组表示按顺序取第一个可用的（如视频动作缺失时回落到内置动作）
 * @property {string} [context] 交给 Claude Code 的情境，她会围绕它说一句；不填只做动作
 * @property {number[]} [days] 星期几生效（0=周日 … 6=周六）；不填每天都生效
 */

const pad = (n) => String(n).padStart(2, '0');

/** 某天的日期键，如 2026-10-26。 */
export const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * 解析 "HH:MM" 为当天的分钟数；格式不对返回 null。
 * @param {string} t 时刻
 * @returns {number|null} 分钟数
 */
export const parseTime = (t) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  return h < 24 && mi < 60 ? h * 60 + mi : null;
};

/**
 * 从候选里挑第一个存在的动作。
 * @param {string|string[]} action 动作名或候选列表
 * @param {Record<string, unknown>} actions 当前可用动作表
 * @returns {string|null} 动作名
 */
export const resolveAction = (action, actions) =>
  [].concat(action ?? []).find((a) => a in actions) ?? null;

/**
 * 此刻应触发的条目：到点后 graceMin 分钟内都算（桌宠刚好在睡眠 / 卡顿也不会错过），已触发过的跳过。
 * @param {ScheduleEntry[]} entries 定时表
 * @param {Date} now 当前时间
 * @param {Set<string>} fired 已触发记录（`日期|时刻`）
 * @param {number} [graceMin] 宽限分钟数
 * @returns {{entry: ScheduleEntry, key: string}[]} 待触发条目及其记录键
 */
export const dueEntries = (entries, now, fired, graceMin = 5) => {
  const minutes = now.getHours() * 60 + now.getMinutes();
  const day = dayKey(now);
  const out = [];
  for (const entry of entries || []) {
    const t = parseTime(entry.time);
    if (t === null) continue;
    if (entry.days?.length && !entry.days.includes(now.getDay())) continue;
    if (minutes < t || minutes >= t + graceMin) continue;
    const key = `${day}|${entry.time}`;
    if (!fired.has(key)) out.push({ entry, key });
  }
  return out;
};
