/**
 * 表情节奏：眨眼间隔、说话口型时长。纯函数，渲染端与测试共用。
 * @module claude-pet/src/shared/expression
 */

/** 单次眨眼闭眼时长（ms）。 */
export const BLINK_MS = 130;
/** 连眨两下时，两次之间睁眼的间隔（ms）。 */
export const DOUBLE_BLINK_GAP_MS = 140;

/**
 * 下一次眨眼前等待多久，以及这次是否连眨两下。人眨眼间隔大致 2~6 秒且不规律，偶尔连眨。
 * @param {() => number} [rand] 随机源
 * @returns {{delay: number, double: boolean}} 等待毫秒数与是否连眨
 */
export const nextBlink = (rand = Math.random) => ({
  delay: Math.round(2000 + rand() * 4000),
  double: rand() < 0.2,
});

/**
 * 说一句话时嘴巴开合多久：按字数估算朗读时长（约 9 字/秒），限制在 0.6~4 秒。
 * @param {string} text 气泡文本
 * @returns {number} 毫秒
 */
export const talkDuration = (text) => {
  const n = [...String(text ?? '').replace(/\s+/g, '')].length;
  return Math.max(600, Math.min(4000, Math.round(n * 110)));
};
