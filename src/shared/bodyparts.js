/**
 * 点击部位判定：把点在立绘上的坐标（立绘像素坐标，521×900，未翻转）映射到身体部位。
 * 每个部位有自己的对话情境与小反应动作。纯函数，渲染端与测试共用。
 * 坐标对应 assets/sprite/pet.png；换立绘后需要重新量。
 * @module claude-pet/src/shared/bodyparts
 */

/** 立绘尺寸。 */
export const SPRITE_W = 521;
export const SPRITE_H = 900;

/** 部位 → 对话情境（交给 Claude Code 现想一句）与点击时的小反应动作。 */
export const PARTS = {
  flower: { label: '发间向日葵', context: '主人碰了碰你发间的向日葵', reaction: 'click-happy' },
  bow: { label: '蝴蝶结', context: '主人拉了拉你头发上的黑色蝴蝶结', reaction: 'click-shy' },
  head: { label: '头', context: '主人摸了摸你的头', reaction: 'click-happy' },
  face: { label: '脸蛋', context: '主人戳了戳你的脸蛋', reaction: 'click-shy' },
  hair: { label: '长发', context: '主人拨弄了一下你的长头发', reaction: 'click-happy' },
  hand: { label: '手', context: '主人牵了牵你的手', reaction: 'click-shy' },
  chest: { label: '领结和衣服', context: '主人戳了戳你胸前的领结和衣服', reaction: 'click-shy' },
  waist: { label: '腰', context: '主人戳了戳你的腰，有点痒', reaction: 'click-happy' },
  skirt: { label: '裙摆', context: '主人碰了碰你的蓬蓬裙', reaction: 'click-shy' },
  legs: { label: '腿', context: '主人戳了戳你的腿', reaction: 'click-dizzy' },
  feet: { label: '小皮鞋', context: '主人碰了碰你的黑色小皮鞋', reaction: 'click-happy' },
};

const inRect = (x, y, x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
const inEllipse = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;

/**
 * 立绘坐标 → 部位。按从小到大、从具体到笼统的顺序判定。
 * @param {number} x 立绘内 x（0~521，按朝右的原图算）
 * @param {number} y 立绘内 y（0~900）
 * @returns {keyof typeof PARTS} 部位
 */
export const hitPart = (x, y) => {
  if (inEllipse(x, y, 348, 122, 44, 44)) return 'flower';
  if (inRect(x, y, 360, 140, 445, 300)) return 'bow';
  if (inRect(x, y, 65, 485, 145, 565) || inRect(x, y, 360, 485, 445, 565)) return 'hand';
  if (inEllipse(x, y, 232, 265, 100, 72)) return 'face';
  if (y < 200) return 'head';
  if (y >= 795) return 'feet';
  if (y >= 690) return 'legs';
  if (inRect(x, y, 150, 320, 335, 445)) return 'chest';
  if (inRect(x, y, 160, 445, 340, 505)) return 'waist';
  if (inRect(x, y, 100, 505, 430, 690)) return 'skirt';
  return 'hair';
};

/**
 * 屏幕点击位置 → 立绘坐标。立绘高 = 宠物框高，宽按 521:900 居中；朝左时左右镜像。
 * @param {{left:number, top:number, width:number, height:number}} box 宠物框（#pet）的位置尺寸
 * @param {number} clientX 点击 x
 * @param {number} clientY 点击 y
 * @param {number} facing 1 朝右 / -1 朝左
 * @returns {{x:number, y:number}} 立绘坐标
 */
export const toSprite = (box, clientX, clientY, facing) => {
  const h = box.height;
  const w = (h * SPRITE_W) / SPRITE_H;
  const left = box.left + (box.width - w) / 2;
  let u = (clientX - left) / w;
  if (facing < 0) u = 1 - u;
  return { x: u * SPRITE_W, y: ((clientY - box.top) / h) * SPRITE_H };
};
