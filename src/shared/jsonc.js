/**
 * JSONC 解析：去掉 // 与 /* *\/ 注释、尾逗号后交给 JSON.parse；字符串内的内容原样保留。
 * @module claude-pet/src/shared/jsonc
 */

/**
 * @param {string} text JSONC 文本
 * @returns {any} 解析结果
 */
export const parseJsonc = (text) => {
  let out = '';
  let i = 0;
  let inStr = false;
  while (i < text.length) {
    const c = text[i];
    const n = text[i + 1];
    if (inStr) {
      out += c;
      if (c === '\\') {
        out += n ?? '';
        i += 2;
        continue;
      }
      if (c === '"') inStr = false;
      i++;
    } else if (c === '"') {
      inStr = true;
      out += c;
      i++;
    } else if (c === '/' && n === '/') {
      while (i < text.length && text[i] !== '\n') i++;
    } else if (c === '/' && n === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i += 2;
    } else {
      out += c;
      i++;
    }
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'));
};

/**
 * 深合并：对象逐键合并，数组与标量整段替换。
 * @param {any} base 默认值
 * @param {any} over 覆盖值
 * @returns {any} 合并结果
 */
export const deepMerge = (base, over) => {
  if (over === undefined) return base;
  if (!base || typeof base !== 'object' || Array.isArray(base) || !over || typeof over !== 'object' || Array.isArray(over)) {
    return over;
  }
  const out = { ...base };
  for (const k of Object.keys(over)) out[k] = deepMerge(base[k], over[k]);
  return out;
};
