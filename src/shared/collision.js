/**
 * 宠物互撞：飞行中的宠物撞到另一只宠物时弹开。两只宠物的身体看作矩形，按重叠较小的那条轴分开，
 * 沿该轴做一维弹性碰撞（动量守恒，恢复系数 e，质量 ∝ 尺寸²）。纯函数，主进程与测试共用。
 * @module claude-pet/src/shared/collision
 */

/** 身体宽度占形象高度的比例（立绘里人物本身比画布窄）。 */
export const BODY_W_RATIO = 0.42;
/** 碰撞恢复系数：接近完全弹性。 */
export const PET_RESTITUTION = 0.9;

/**
 * 由窗口左上角和布局算出身体矩形（屏幕坐标）。
 * @param {number} x 窗口左上角 x
 * @param {number} y 窗口左上角 y
 * @param {{W:number, H:number, S:number}} g 窗口宽高与形象高度
 * @returns {{x:number, y:number, w:number, h:number}} 身体矩形
 */
export const bodyBox = (x, y, g) => {
  const w = g.S * BODY_W_RATIO;
  return { x: x + (g.W - w) / 2, y: y + g.H - g.S, w, h: g.S };
};

/**
 * 两只宠物的碰撞。
 * @param {{box:{x:number,y:number,w:number,h:number}, vx:number, vy:number, m:number}} a 宠物 A
 * @param {{box:{x:number,y:number,w:number,h:number}, vx:number, vy:number, m:number}} b 宠物 B
 * @param {number} [e] 恢复系数
 * @returns {null | {a:{dx:number,dy:number,vx:number,vy:number}, b:{dx:number,dy:number,vx:number,vy:number}}}
 *   没撞上（或已在分开）返回 null；否则给出各自的位置修正与碰后速度
 */
export const collide = (a, b, e = PET_RESTITUTION) => {
  const A = a.box;
  const B = b.box;
  const ox = Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x);
  const oy = Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y);
  if (ox <= 0 || oy <= 0) return null;
  const axis = ox < oy ? 'x' : 'y';
  const v = axis === 'x' ? 'vx' : 'vy';
  // B 相对 A 在该轴上的方向
  const dir = axis === 'x' ? Math.sign(B.x + B.w / 2 - (A.x + A.w / 2)) || 1 : Math.sign(B.y + B.h / 2 - (A.y + A.h / 2)) || 1;
  const approaching = (a[v] - b[v]) * dir > 0;
  const mt = a.m + b.m;
  // 按质量反比把重叠推开
  const overlap = axis === 'x' ? ox : oy;
  const pa = (-dir * overlap * b.m) / mt;
  const pb = (dir * overlap * a.m) / mt;
  let va = a[v];
  let vb = b[v];
  if (approaching) {
    va = (a.m * a[v] + b.m * b[v] - b.m * e * (a[v] - b[v])) / mt;
    vb = (a.m * a[v] + b.m * b[v] + a.m * e * (a[v] - b[v])) / mt;
  }
  const out = {
    a: { dx: 0, dy: 0, vx: a.vx, vy: a.vy },
    b: { dx: 0, dy: 0, vx: b.vx, vy: b.vy },
  };
  out.a[axis === 'x' ? 'dx' : 'dy'] = pa;
  out.b[axis === 'x' ? 'dx' : 'dy'] = pb;
  out.a[v] = va;
  out.b[v] = vb;
  return out;
};
