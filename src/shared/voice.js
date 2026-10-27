/**
 * 工作状态气泡的「她的口吻」：把 Claude 此刻在做的事（它说的最后一句话 / 正在用的工具）交给 Claude Code，
 * 改写成宠物自己说的一句话，比如「我在帮你翻 README 找位置呢～」。限频：同一时间只问一次，两次之间至少隔
 * minIntervalMs；还没改写好时返回 null，由调用方显示兜底文案。不依赖 Electron，主进程与测试共用。
 * @module claude-pet/src/shared/voice
 */

/**
 * @param {{ask: (prompt: string) => Promise<string>, minIntervalMs?: number, maxAgeMs?: number, now?: () => number}} o
 *   ask：问 Claude 一句、返回原始回复；maxAgeMs：改写好的话多久内还能接着显示（步骤换了也先顶着，免得气泡闪回兜底文案）
 */
export const createVoice = ({ ask, minIntervalMs = 20_000, maxAgeMs = 90_000, now = Date.now }) => {
  let last = null; // { raw, line, at }
  let lastAskAt = -Infinity;
  let inflight = false;

  const clean = (s) =>
    String(s ?? '')
      .split('\n')[0]
      .replace(/^["“「『]|["”」』]$/g, '')
      .trim()
      .slice(0, 30);

  /**
   * 取这一步该显示的话；需要时在后台去问。
   * @param {string} raw Claude 此刻在做的事（原样）
   * @param {{project?: string, status?: string}} [meta]
   * @returns {string|null} 改写好的话；还没有就是 null
   */
  const line = (raw, meta = {}) => {
    if (!raw) return null;
    const t = now();
    if (last?.raw === raw) return last.line;
    if (!inflight && t - lastAskAt >= minIntervalMs) {
      inflight = true;
      lastAskAt = t;
      const prompt =
        `主人正在用 Claude Code${meta.project ? `做「${meta.project}」项目` : ''}，Claude 此刻：${raw}` +
        `${meta.status ? `（状态：${meta.status}）` : ''}。\n` +
        '你是 Claude 的小分身，用你自己的口吻、第一人称，说一句你正在帮主人做什么，像边干活边自言自语。' +
        '15 字以内，口语、可爱、自然；不要出现命令、代码、英文路径或工具名；只输出这句话本身。';
      ask(prompt)
        .then((r) => {
          const l = clean(r);
          if (l) last = { raw, line: l, at: now() };
        })
        .catch(() => {})
        .finally(() => {
          inflight = false;
        });
    }
    return last && t - last.at < maxAgeMs ? last.line : null;
  };

  return { line, reset: () => (last = null) };
};
