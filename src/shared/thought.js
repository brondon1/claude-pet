/**
 * 从 Claude Code 会话记录（transcript JSONL）的末尾，取出 Claude 最新的「思考过程」：
 * 它说的最后一句话，或正在调用的那一步工具的说明。原始 thinking 正文不会写进记录，这里取的是可见部分。
 * 纯函数，主进程与测试共用。
 * @module claude-pet/src/shared/thought
 */

/**
 * 工具调用的原始描述（给「她的口吻」改写当素材，不直接显示）：工具名 + 说明 / 文件 / 搜索词。
 * @param {string} name 工具名
 * @param {Record<string, any>} input 参数
 */
export const toolRaw = (name, input = {}) => {
  const what = input.description || input.file_path || input.notebook_path || input.pattern || input.query || input.url || input.command;
  return what ? `${name}：${what}` : name;
};

/** 只是会话 UI 的内部工具（任务列表、收尾卡片等），不算「在干什么」。 */
const IGNORED_TOOL = /^(mcp__ccd_|TodoWrite$|ToolSearch$)/;

/**
 * 把一段文字压成气泡里的一行：去掉 markdown 记号，取第一句非空行，截断。
 * @param {string} s 原文
 * @param {number} [max] 最长字数
 * @returns {string} 一行
 */
export const oneLine = (s, max = 28) => {
  const line =
    String(s ?? '')
      .split('\n')
      .map((l) => l.replace(/[*_`#>]+/g, '').replace(/^\s*[-|]\s*/, '').trim())
      .find((l) => l.length > 0) ?? '';
  const chars = [...line];
  return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : line;
};

/**
 * 从记录末尾一段文本里找最新的思考过程。
 * @param {string} tail 记录文件末尾若干字节（第一行可能被截断，会被忽略）
 * @returns {string|null} 一行描述；找不到返回 null
 */
export const latestThought = (tail) => {
  const lines = String(tail ?? '').split('\n');
  for (let i = lines.length - 1; i >= 1; i--) {
    let o;
    try {
      o = JSON.parse(lines[i]);
    } catch {
      continue;
    }
    if (o?.type !== 'assistant') continue;
    const content = o.message?.content;
    if (!Array.isArray(content)) continue;
    for (let j = content.length - 1; j >= 0; j--) {
      const c = content[j];
      if (c.type === 'text' && c.text?.trim()) return oneLine(c.text);
      if (c.type === 'thinking' && c.thinking?.trim()) return oneLine(c.thinking);
      if (c.type === 'tool_use' && !IGNORED_TOOL.test(c.name ?? '')) return oneLine(toolRaw(c.name, c.input ?? {}), 60);
    }
  }
  return null;
};

/**
 * 工作状态气泡：只放她说的一句话（改写好的口吻，没有就用状态文案），不带项目目录。
 * @param {{text: string}} s 当前状态
 * @param {string|null} [said] 她此刻说的话
 * @returns {string} 气泡文本
 */
export const statusBubble = (s, said) => said || s.text;
