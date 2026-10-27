/**
 * 记忆链：从使用记录里慢慢长出来的「她对主人的了解」。纯逻辑，主进程与测试共用。
 *
 * - log：观察记录（在哪个项目里提问、什么时候、聊了什么、点了哪里、让她做了什么），只留最近一段
 * - items：整理出来的记忆条目（偏好 / 习惯 / 项目 / 事实 / 关系），注入聊天与碎碎念的系统提示词
 * - links：每次整理是链上的一环，记下这次学到了什么、忘掉了什么、她当时的一句感想——越用越懂的过程
 * @module claude-pet/src/shared/memory-chain
 */

/** 记忆条目的种类及中文名。 */
export const KINDS = { schedule: '作息', habit: '习惯', preference: '偏好', project: '项目', fact: '事实', relation: '相处' };

/** 长期作息统计（整理后不清空，越攒越准）。 */
export const emptyStats = () => ({ days: {}, hours: Array(24).fill(0), weekdays: Array(7).fill(0) });

/** 空的记忆链。 */
export const emptyChain = () => ({ version: 1, items: [], links: [], log: [], pending: 0, lastAt: null, stats: emptyStats() });

/** 整理一次至少要攒够多少「分」：一条观察 1 分，一次聊天 3 分。 */
const WEIGHT = { chat: 3 };

/** 一天从凌晨 5 点算起：凌晨 1 点还在用算前一天熬夜，而不是新的一天很早开工。 */
const DAY_START_H = 5;
const pad = (n) => String(n).padStart(2, '0');
/** 本地时间 → 所属的「工作日」日期键与当天的分钟数（凌晨 5 点前记为前一天的 24:xx 之后）。 */
const dayOf = (d) => {
  const shifted = new Date(d.getTime() - DAY_START_H * 3600_000);
  const key = `${shifted.getFullYear()}-${pad(shifted.getMonth() + 1)}-${pad(shifted.getDate())}`;
  const min = d.getHours() * 60 + d.getMinutes() + (d.getHours() < DAY_START_H ? 1440 : 0);
  return { key, min };
};
/** 分钟数 → 「21:05」/「次日 01:30」。 */
export const fmtMin = (m) => {
  const r = Math.round(m);
  return `${r >= 1440 ? '次日 ' : ''}${pad(Math.floor((r % 1440) / 60))}:${pad(r % 60)}`;
};
/** 本地时间的简短写法（给 Claude 看的时间都用本地时间，别用 UTC）。 */
const fmtLocal = (iso) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/**
 * 把一条观察计进长期作息统计（返回新对象）：每天最早 / 最晚活动、各时段与星期的活跃度、在哪些项目。
 * @param {ReturnType<typeof emptyStats>} stats
 * @param {{t: string, p?: string}} ev
 * @param {Date} now
 * @param {number} [keepDays] 保留最近多少天的逐日记录
 */
export const addToStats = (stats = emptyStats(), ev, now, keepDays = 60) => {
  const { key, min } = dayOf(now);
  const old = stats.days?.[key];
  const day = old
    ? { ...old, first: Math.min(old.first, min), last: Math.max(old.last, min), n: old.n + 1, projects: { ...old.projects } }
    : { first: min, last: min, n: 1, prompts: 0, projects: {} };
  if (ev.t === 'prompt') day.prompts = (day.prompts || 0) + 1;
  if (ev.p) day.projects[ev.p] = (day.projects[ev.p] || 0) + 1;
  const days = { ...stats.days, [key]: day };
  const keys = Object.keys(days).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - keepDays))) delete days[k];
  const hours = [...(stats.hours ?? Array(24).fill(0))];
  hours[now.getHours()]++;
  const weekdays = [...(stats.weekdays ?? Array(7).fill(0))];
  weekdays[new Date(now.getTime() - DAY_START_H * 3600_000).getDay()]++;
  return { days, hours, weekdays };
};

/** 合并两份作息统计（补录历史时用）：同一天取更早的开始、更晚的收工，次数相加。 */
export const mergeStats = (a = emptyStats(), b = emptyStats()) => {
  const days = { ...a.days };
  for (const [k, d] of Object.entries(b.days ?? {})) {
    const o = days[k];
    if (!o) {
      days[k] = d;
      continue;
    }
    const projects = { ...o.projects };
    for (const [p, n] of Object.entries(d.projects ?? {})) projects[p] = (projects[p] || 0) + n;
    days[k] = { first: Math.min(o.first, d.first), last: Math.max(o.last, d.last), n: o.n + d.n, prompts: (o.prompts || 0) + (d.prompts || 0), projects };
  }
  const sum = (x = [], y = []) => x.map((v, i) => v + (y[i] || 0));
  return { ...a, ...b, days, hours: sum(a.hours, b.hours), weekdays: sum(a.weekdays, b.weekdays) };
};

const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * 长期作息统计 → 给 Claude 看的文字：平均几点开工 / 收工（工作日、周末分开）、是否熬夜、午休、高峰时段、周末是否也在忙。
 * 只用活跃度够的日子（当天 ≥ minEvents 条记录）算开工收工，免得偶尔点一下宠物被当成上班。
 * @param {ReturnType<typeof emptyStats>} stats
 * @param {{minEvents?: number}} [o]
 * @returns {string}
 */
export const routineDigest = (stats, { minEvents = 3 } = {}) => {
  const all = Object.entries(stats?.days ?? {}).sort(([a], [b]) => a.localeCompare(b));
  if (!all.length) return '（还没有作息记录）';
  const lines = [`有记录的日子：${all.length} 天（${all[0][0]} ~ ${all.at(-1)[0]}）`];
  const busy = all.filter(([, d]) => d.n >= minEvents);
  const isWeekend = (k) => [0, 6].includes(new Date(`${k}T12:00:00`).getDay());
  const describe = (label, ds) => {
    if (!ds.length) return;
    const first = ds.map(([, d]) => d.first);
    const last = ds.map(([, d]) => d.last);
    lines.push(
      `${label}（${ds.length} 天）：平均 ${fmtMin(avg(first))} 开始干活、${fmtMin(avg(last))} 收工；` +
        `最早 ${fmtMin(Math.min(...first))}，最晚 ${fmtMin(Math.max(...last))}；平均每天让 Claude 做 ${Math.round(avg(ds.map(([, d]) => d.prompts || 0)))} 件事`,
    );
  };
  describe('工作日', busy.filter(([k]) => !isWeekend(k)));
  describe('周末', busy.filter(([k]) => isWeekend(k)));
  if (busy.length) {
    const late = busy.filter(([, d]) => d.last >= 23 * 60);
    lines.push(late.length ? `熬夜（23 点后还在忙）：${late.length} / ${busy.length} 天` : '基本不熬夜（23 点前就收工）');
  }
  const h = stats.hours ?? [];
  const total = h.reduce((a, b) => a + b, 0);
  if (total >= 10) {
    const peaks = h
      .map((v, i) => [i, v])
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([i]) => `${i}~${i + 1} 点`);
    lines.push(`最活跃的时段：${peaks.join('、')}`);
    const around = (h[10] + h[11] + h[14] + h[15]) / 4;
    const noon = (h[12] + h[13]) / 2;
    if (around >= 2 && noon < around * 0.4) lines.push('中午 12~14 点明显很少用 Claude（像是在午休 / 吃饭）');
  }
  const w = stats.weekdays ?? [];
  if (w.reduce((a, b) => a + b, 0) >= 10) {
    const names = '日一二三四五六';
    const ranked = w.map((v, i) => [i, v]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    lines.push(`最常在：${ranked.slice(0, 3).map(([i]) => `周${names[i]}`).join('、')}${w[0] + w[6] === 0 ? '；周末基本不用' : ''}`);
  }
  return lines.join('\n');
};

/**
 * 记一条观察（返回新对象）。
 * @param {ReturnType<typeof emptyChain>} chain
 * @param {{t: string, p?: string, s?: string}} ev t 类型：prompt / session / done / fail / chat / click / play；p 项目名；s 摘要
 * @param {Date} [now]
 * @param {number} [maxLog] 最多保留多少条
 */
export const observe = (chain, ev, now = new Date(), maxLog = 400) => {
  const entry = { at: now.toISOString(), t: ev.t };
  if (ev.p) entry.p = String(ev.p).slice(0, 60);
  if (ev.s) entry.s = String(ev.s).replace(/\s+/g, ' ').trim().slice(0, 160);
  return {
    ...chain,
    log: [...chain.log, entry].slice(-maxLog),
    pending: (chain.pending || 0) + (WEIGHT[ev.t] ?? 1),
    stats: addToStats(chain.stats, ev, now),
  };
};

/** 是否该整理了：攒够分数，且离上次整理够久。 */
export const shouldConsolidate = (chain, now = new Date(), { consolidateEvery = 12, minIntervalMin = 20 } = {}) =>
  (chain.pending || 0) >= consolidateEvery && (!chain.lastAt || now - new Date(chain.lastAt) >= minIntervalMin * 60_000);

const top = (counts, n) =>
  Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);

/**
 * 把观察记录压成一段给 Claude 看的摘要：常去的项目、活跃时段、最近的提问与聊天、爱点哪里。
 * @param {{at: string, t: string, p?: string, s?: string}[]} log
 * @returns {string}
 */
export const activityDigest = (log) => {
  if (!log.length) return '（还没有新的观察记录）';
  const projects = {};
  const hours = {};
  const days = {};
  const clicks = {};
  const plays = {};
  let done = 0;
  let fail = 0;
  for (const e of log) {
    const d = new Date(e.at);
    if (e.t === 'prompt' || e.t === 'session') {
      if (e.p) projects[e.p] = (projects[e.p] || 0) + 1;
      hours[d.getHours()] = (hours[d.getHours()] || 0) + 1;
      const wd = `周${'日一二三四五六'[d.getDay()]}`;
      days[wd] = (days[wd] || 0) + 1;
    }
    if (e.t === 'click' && e.s) clicks[e.s] = (clicks[e.s] || 0) + 1;
    if (e.t === 'play' && e.s) plays[e.s] = (plays[e.s] || 0) + 1;
    if (e.t === 'done') done++;
    if (e.t === 'fail') fail++;
  }
  const lines = [`观察时间（本地时间）：${fmtLocal(log[0].at)} ~ ${fmtLocal(log.at(-1).at)}，共 ${log.length} 条`];
  const fmt = (pairs, unit = '次') => pairs.map(([k, v]) => `${k}（${v}${unit}）`).join('、');
  if (Object.keys(projects).length) lines.push(`常在这些项目里用 Claude Code：${fmt(top(projects, 6))}`);
  if (Object.keys(hours).length) lines.push(`活跃时段：${fmt(top(hours, 5).map(([h, v]) => [`${h}点`, v]))}`);
  if (Object.keys(days).length) lines.push(`活跃的日子：${fmt(top(days, 7))}`);
  if (done || fail) lines.push(`Claude 完成任务 ${done} 次，出错 ${fail} 次`);
  const prompts = log.filter((e) => e.t === 'prompt' && e.s).slice(-12);
  if (prompts.length) lines.push(`最近让 Claude 做的事：\n${prompts.map((e) => `- [${e.p ?? '?'}] ${e.s}`).join('\n')}`);
  const chats = log.filter((e) => e.t === 'chat' && e.s).slice(-10);
  if (chats.length) lines.push(`最近和你的聊天：\n${chats.map((e) => `- ${e.s}`).join('\n')}`);
  if (Object.keys(clicks).length) lines.push(`爱点你的：${fmt(top(clicks, 5))}`);
  if (Object.keys(plays).length) lines.push(`常让你做的动作：${fmt(top(plays, 5))}`);
  return lines.join('\n');
};

/**
 * 让 Claude 整理记忆的提示词：已有记忆 + 新观察 → 新的记忆列表（JSON）。
 * @param {{items: {text: string, kind: string}[]}} chain
 * @param {string} digest activityDigest 的结果
 * @param {{name: string, maxItems?: number}} o
 */
export const consolidatePrompt = (chain, digest, { name, maxItems = 30 }) => {
  const old = chain.items.length
    ? chain.items.map((m) => `- [${m.kind}] ${m.text}`).join('\n')
    : '（还没有，这是第一次整理）';
  return [
    `你是桌宠「${name}」，在整理自己对主人的了解。下面是你已有的记忆和最近的观察记录。`,
    `\n## 已有记忆\n${old}`,
    `\n## 最近的观察\n${digest}`,
    `\n## 长期作息统计（一直累计，比最近的观察更能说明规律；时间都是本地时间）\n${routineDigest(chain.stats)}`,
    `\n## 要求`,
    `- 输出更新后的完整记忆列表：保留仍然成立的，合并重复的，修正被新观察推翻的，加入新发现；不确定的不要写`,
    `- 一定要根据「长期作息统计」写出主人的作息（kind=schedule）：一般几点开始工作、几点收工、会不会熬夜、中午休不休息、周末忙不忙；` +
      `以及工作习惯（kind=habit）：高峰时段、常在哪些项目、怎么用 Claude。统计的日子少于 3 天时，作息写成「最近…」，别说得太笃定`,
    `- 统计更新了就改写旧的作息条目，不要留下互相矛盾的说法`,
    `- 每条一句话、具体（比如「工作日一般 9:40 开工、20:30 收工」，而不是「作息规律」），以「主人」为主语`,
    `- 种类 kind 只能是：${Object.keys(KINDS).join(' / ')}（${Object.values(KINDS).join(' / ')}）`,
    `- 最多 ${maxItems} 条，作息和习惯放在最前面；不要记密码、密钥、隐私数据`,
    `- note：用你的口吻对主人说一句这次更懂主人的哪一点（20 字以内，可爱自然）；没什么新发现就写空字符串`,
    `\n只输出 JSON，不要任何解释或代码块：{"items":[{"kind":"habit","text":"..."}],"note":"..."}`,
  ].join('\n');
};

/** 从 Claude 的回复里抠出 JSON 对象（容忍前后多余文字或 ``` 代码块）。 */
export const extractJson = (raw) => {
  const s = String(raw ?? '');
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('整理结果里没有 JSON');
  return JSON.parse(s.slice(start, end + 1));
};

const norm = (t) => String(t).replace(/\s+/g, '').toLowerCase();

/**
 * 把整理结果并进记忆链：新条目替换旧列表（没变的条目保留原来的 since），链上加一环，清空待整理分数。
 * @param {ReturnType<typeof emptyChain>} chain
 * @param {string} raw Claude 的原始回复
 * @param {Date} [now]
 * @param {{maxItems?: number, maxLinks?: number}} [o]
 * @returns {{chain: ReturnType<typeof emptyChain>, added: string[], removed: string[], note: string}}
 */
export const applyConsolidation = (chain, raw, now = new Date(), { maxItems = 30, maxLinks = 60 } = {}) => {
  const data = extractJson(raw);
  if (!Array.isArray(data.items)) throw new Error('整理结果缺少 items');
  const at = now.toISOString();
  const oldByText = new Map(chain.items.map((m) => [norm(m.text), m]));
  const seen = new Set();
  const items = [];
  for (const it of data.items) {
    const text = String(it?.text ?? '').trim().slice(0, 120);
    if (!text || seen.has(norm(text))) continue;
    seen.add(norm(text));
    const kind = KINDS[it.kind] ? it.kind : 'fact';
    const old = oldByText.get(norm(text));
    items.push({ kind, text, since: old?.since ?? at, updated: at });
    if (items.length >= maxItems) break;
  }
  const added = items.filter((m) => !oldByText.has(norm(m.text))).map((m) => m.text);
  const removed = chain.items.filter((m) => !seen.has(norm(m.text))).map((m) => m.text);
  const note = String(data.note ?? '').trim().slice(0, 60);
  const link = { at, observed: chain.log.length, added, removed, kept: items.length - added.length, note };
  return {
    chain: { ...chain, items, links: [...chain.links, link].slice(-maxLinks), log: [], pending: 0, lastAt: at },
    added,
    removed,
    note,
  };
};

/**
 * 拼进系统提示词的「你对主人的了解」。
 * @param {{kind: string, text: string}[]} items
 * @param {number} [limit]
 */
export const memoryBlock = (items, limit = 20) =>
  items.length
    ? `\n你对主人的了解（来自你们相处的记忆，自然地用上，别生硬复述）：\n${items
        .slice(0, limit)
        .map((m) => `- ${m.text}`)
        .join('\n')}`
    : '';
