/**
 * 记忆链：从使用记录里慢慢长出来的「她对主人的了解」。纯逻辑，主进程与测试共用。
 *
 * - log：观察记录（在哪个项目里提问、什么时候、聊了什么、点了哪里、让她做了什么），只留最近一段
 * - items：整理出来的记忆条目（偏好 / 习惯 / 项目 / 事实 / 关系），注入聊天与碎碎念的系统提示词
 * - links：每次整理是链上的一环，记下这次学到了什么、忘掉了什么、她当时的一句感想——越用越懂的过程
 * @module claude-pet/src/shared/memory-chain
 */

/** 记忆条目的种类及中文名。 */
export const KINDS = { preference: '偏好', habit: '习惯', project: '项目', fact: '事实', relation: '相处' };

/** 空的记忆链。 */
export const emptyChain = () => ({ version: 1, items: [], links: [], log: [], pending: 0, lastAt: null });

/** 整理一次至少要攒够多少「分」：一条观察 1 分，一次聊天 3 分。 */
const WEIGHT = { chat: 3 };

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
  const lines = [`观察时间：${log[0].at.slice(0, 16).replace('T', ' ')} ~ ${log.at(-1).at.slice(0, 16).replace('T', ' ')}，共 ${log.length} 条`];
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
    `\n## 要求`,
    `- 输出更新后的完整记忆列表：保留仍然成立的，合并重复的，修正被新观察推翻的，加入新发现；不确定的不要写`,
    `- 每条一句话、具体（比如「常在晚上 9~11 点写 claude-pet 的代码」，而不是「喜欢写代码」），以「主人」为主语`,
    `- 种类 kind 只能是：${Object.keys(KINDS).join(' / ')}（${Object.values(KINDS).join(' / ')}）`,
    `- 最多 ${maxItems} 条，越重要越靠前；不要记密码、密钥、隐私数据`,
    `- note：用你的口吻对主人说一句这次更懂他的哪一点（20 字以内，可爱自然）；没什么新发现就写空字符串`,
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
