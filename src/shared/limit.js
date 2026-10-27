/**
 * 识别 Claude Code 的额度用尽报错（如「You've hit your session limit · resets 9:10pm (Asia/Shanghai)」），
 * 算出恢复时刻。纯函数，主进程与测试共用。
 * @module claude-pet/src/shared/limit
 */

/** 报错信息是不是额度用尽。 */
export const isLimitError = (msg) => /(session|usage|weekly|daily|rate) limit|hit your .*limit|quota|额度/i.test(String(msg ?? ''));

/**
 * 从报错里取出恢复时刻（本地时间），取「现在之后最近的那一次」。解析不出来就按 fallbackMin 分钟后。
 * @param {string} msg 报错信息
 * @param {Date} [now] 当前时间
 * @param {number} [fallbackMin] 解析失败时暂停多少分钟
 * @returns {Date} 恢复时刻
 */
export const parseReset = (msg, now = new Date(), fallbackMin = 30) => {
  const m = /resets?\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*([ap]m)?/i.exec(String(msg ?? ''));
  if (!m) return new Date(now.getTime() + fallbackMin * 60_000);
  let h = Number(m[1]) % 12;
  const min = Number(m[2] ?? 0);
  const ap = m[3]?.toLowerCase();
  if (ap === 'pm') h += 12;
  else if (!ap) h = Number(m[1]) % 24;
  const t = new Date(now);
  t.setHours(h, min, 0, 0);
  if (t <= now) t.setDate(t.getDate() + 1);
  return t;
};

/** 额度用完 / 恢复时的默认台词（这时调不了 Claude Code，只能用现成的）。{name} 名字，{reset} 恢复时刻。 */
export const DEFAULT_LIMIT_LINES = {
  start: [
    '呜…今天的脑力被用光了，{reset} 再来找我玩吧 💤',
    'Claude Code 额度见底啦，{name}先打个盹，{reset} 准时醒~',
    '没电了没电了…{reset} 才能充满，先睡一会儿 zzz',
    '脑袋空空的，想不出话了…等到 {reset} 吧',
  ],
  recover: [
    '额度回来啦！{name}满血复活~',
    '睡饱了！脑子又转起来啦，有什么要我帮忙的吗？',
    '叮——充电完成，又可以陪你聊天啦',
  ],
};

/**
 * 随机挑一句额度台词并填好占位符。
 * @param {string[]} lines 候选台词（空则用默认）
 * @param {{name?: string, reset?: string}} vars
 */
export const limitLine = (lines, vars = {}, rand = Math.random) => {
  const list = lines?.length ? lines : DEFAULT_LIMIT_LINES.start;
  return list[Math.floor(rand() * list.length)].replace(/\{(\w+)\}/g, (m, k) => vars[k] ?? m);
};

/** 恢复时刻的简短中文写法，如「21:10」或「明天 09:00」。 */
export const fmtReset = (t, now = new Date()) => {
  const hm = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
  return t.toDateString() === now.toDateString() ? hm : `明天 ${hm}`;
};
