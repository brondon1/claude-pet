/**
 * 多屏抛掷边界：宠物所在屏的四壁（含地面）里，紧挨着另一块屏的那一侧是「开着的」，可以飞过去 / 掉下去。
 * 往上扔进上方的屏后会穿过地面掉回下方的屏，最终落在最下面那块屏的工作区底边。
 * 纯函数，主进程与测试共用。
 * @module claude-pet/src/shared/displays
 */

/** 判定两块屏「相邻」时允许的边缘缝隙（px）。 */
const EDGE_TOL = 8;

const contains = (r, x, y) => x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height;
const dist2 = (r, x, y) => {
  const dx = Math.max(r.x - x, 0, x - (r.x + r.width));
  const dy = Math.max(r.y - y, 0, y - (r.y + r.height));
  return dx * dx + dy * dy;
};

/**
 * 抛掷时窗口左上角的可活动范围。
 * @param {{bounds:{x:number,y:number,width:number,height:number}, workArea:{x:number,y:number,width:number,height:number}}[]} displays 全部屏幕
 * @param {number} cx 宠物身体中心 x
 * @param {number} cy 宠物身体中心 y
 * @param {{W:number, H:number, S:number, PW:number}} g 窗口宽高、宠物高、宠物包围盒宽
 * @returns {{minX:number,maxX:number,minY:number,maxY:number}} 边界
 */
export const throwBounds = (displays, cx, cy, g) => {
  const cur =
    displays.find((d) => contains(d.bounds, cx, cy)) ??
    displays.reduce((best, d) => (dist2(d.bounds, cx, cy) < dist2(best.bounds, cx, cy) ? d : best));
  const a = cur.workArea;
  const B = cur.bounds;
  const side = (g.W - g.PW) / 2 + g.PW * 0.12;
  const top = g.H - g.S;
  const out = { minX: a.x - side, maxX: a.x + a.width - g.W + side, minY: a.y - top, maxY: a.y + a.height - g.H };
  for (const d of displays) {
    if (d === cur) continue;
    const o = d.bounds;
    const overlapX = cx >= o.x && cx < o.x + o.width;
    const overlapY = cy >= o.y && cy < o.y + o.height;
    // 上方有屏：天花板打开，可以一直飞到那块屏的顶
    if (overlapX && Math.abs(o.y + o.height - B.y) <= EDGE_TOL) out.minY = Math.min(out.minY, d.workArea.y - top);
    // 下方有屏：地面打开，一直掉到那块屏的工作区底边
    if (overlapX && Math.abs(o.y - (B.y + B.height)) <= EDGE_TOL)
      out.maxY = Math.max(out.maxY, d.workArea.y + d.workArea.height - g.H);
    // 左右有屏：侧墙打开
    if (overlapY && Math.abs(o.x + o.width - B.x) <= EDGE_TOL) out.minX = Math.min(out.minX, d.workArea.x - side);
    if (overlapY && Math.abs(o.x - (B.x + B.width)) <= EDGE_TOL)
      out.maxX = Math.max(out.maxX, d.workArea.x + d.workArea.width - g.W + side);
  }
  return out;
};
