/**
 * 拖拽抛掷物理：弹簧跟手、甩抛初速估算、重力与反弹、Q 弹挤压。
 * 纯计算，无 DOM / Electron 依赖，主进程与测试共用。
 * 坐标为窗口左上角的屏幕像素（DIP）。
 * @module claude-pet/src/shared/physics
 */

/** 拖拽弹簧刚度：越大跟手越紧。 */
export const SPRING_K = 200;
/** 拖拽弹簧阻尼：ζ ≈ 1.06，过阻尼不 overshoot。 */
export const SPRING_C = 30;
/** 拖拽轨迹保留窗口（ms）。 */
export const TRAIL_KEEP_MS = 200;
/** 初速估算窗口（ms）。 */
export const RELEASE_WINDOW_MS = 120;
/** 松手前停顿超过它即温柔放下。 */
export const RELEASE_STALE_MS = 150;
/** 低于此速度即不抛（原地放下），px/s。 */
export const DEAD_ZONE_SPEED = 450;
/** 甩出速度软上限（px/s）。 */
export const MAX_THROW_SPEED = 3600;
/** 落地时 |vy| 小于它直接停竖直。 */
export const REST_VY = 40;
/** 地面上 |vx| 小于它认为已静止。 */
export const REST_VX = 15;
/** 单步最大 dt（s），防止卡顿后穿墙。 */
export const MAX_STEP_DT = 0.05;

/** 默认物理参数（配置缺失时的兜底）。 */
export const DEFAULT_PHYSICS = {
  gravity: 1400,
  restitution: 0.72,
  groundFriction: 2.5,
  ceilingBounce: true,
  throwPower: 1,
};

/** 挤压动画时长（ms）。 */
export const SQ_DURATION_MS = 240;

/**
 * 落地冲击 → 挤压幅度（0..0.5）。
 * @param {number} impactSpeed 落地瞬间竖直速度（px/s）
 * @returns {number} 挤压量
 */
export const landingSquash = (impactSpeed) => {
  const s = Math.abs(impactSpeed);
  if (s < 250) return 0;
  return Math.min(0.5, 0.12 + ((s - 250) / 1500) * 0.38);
};

/**
 * 挤压曲线：u∈[0,1] → 竖直缩放。先压扁再回弹过冲，最后归 1。
 * @param {number} u 归一化进度
 * @param {number} squash 挤压量
 * @returns {number} scaleY（scaleX 取 1/√scaleY 保体积近似）
 */
export const squashScale = (u, squash) => {
  if (u <= 0 || u >= 1 || squash <= 0) return 1;
  if (u < 0.3) return 1 - squash * Math.sin((u / 0.3) * (Math.PI / 2));
  const t = (u - 0.3) / 0.7;
  return 1 - squash * Math.cos(t * Math.PI * 1.5) * Math.exp(-4 * t);
};

/**
 * 弹簧跟手一步。
 * @param {{x:number,y:number,vx:number,vy:number}} s 当前状态
 * @param {{x:number,y:number}} target 目标位置
 * @param {number} dt 秒
 * @returns {{x:number,y:number,vx:number,vy:number}} 新状态
 */
export const springStep = (s, target, dt) => {
  const ax = SPRING_K * (target.x - s.x) - SPRING_C * s.vx;
  const ay = SPRING_K * (target.y - s.y) - SPRING_C * s.vy;
  const vx = s.vx + ax * dt;
  const vy = s.vy + ay * dt;
  return { x: s.x + vx * dt, y: s.y + vy * dt, vx, vy };
};

/**
 * 只留最近 TRAIL_KEEP_MS 的轨迹点。
 * @param {{x:number,y:number,t:number}[]} trail 轨迹
 * @param {number} now 当前时间 ms
 * @returns {{x:number,y:number,t:number}[]} 裁剪后的轨迹
 */
export const trimTrail = (trail, now) => trail.filter((p) => now - p.t <= TRAIL_KEEP_MS);

/**
 * 软上限：cap×(1-e^(-s/cap))，单调且渐近不超过 cap。
 * @param {number} speed 原速度
 * @returns {number} 限制后的速度
 */
export const softClampSpeed = (speed) => MAX_THROW_SPEED * (1 - Math.exp(-speed / MAX_THROW_SPEED));

/**
 * 由松手前的指针轨迹估算甩出初速；太慢或停顿过久返回 null（温柔放下）。
 * @param {{x:number,y:number,t:number}[]} trail 指针轨迹（屏幕坐标）
 * @param {number} now 松手时间 ms
 * @param {number} [power] 力度倍率
 * @returns {{vx:number,vy:number}|null} 初速
 */
export const estimateReleaseVelocity = (trail, now, power = 1) => {
  if (trail.length < 2) return null;
  const last = trail[trail.length - 1];
  if (now - last.t > RELEASE_STALE_MS) return null;
  const win = trail.filter((p) => last.t - p.t <= RELEASE_WINDOW_MS);
  const first = win[0];
  const span = (last.t - first.t) / 1000;
  if (span < 0.016) return null;
  const vx = (last.x - first.x) / span;
  const vy = (last.y - first.y) / span;
  const speed = Math.hypot(vx, vy);
  if (speed < DEAD_ZONE_SPEED) return null;
  const k = (softClampSpeed(speed) * power) / speed;
  return { vx: vx * k, vy: vy * k };
};

/**
 * 抛掷一步：重力、四壁反弹、地面摩擦。
 * @param {{x:number,y:number,vx:number,vy:number}} s 状态
 * @param {{minX:number,maxX:number,minY:number,maxY:number}} b 可活动范围（窗口左上角）
 * @param {number} dt 秒
 * @param {typeof DEFAULT_PHYSICS} p 物理参数
 * @returns {{state:{x:number,y:number,vx:number,vy:number}, landed:number, resting:boolean}}
 *   landed = 本步落地冲击速度（0 表示未落地）
 */
export const throwStep = (s, b, dt, p = DEFAULT_PHYSICS) => {
  dt = Math.min(dt, MAX_STEP_DT);
  let { x, y, vx, vy } = s;
  vy += p.gravity * dt;
  x += vx * dt;
  y += vy * dt;
  let landed = 0;
  if (x < b.minX) {
    x = b.minX;
    vx = Math.abs(vx) * p.restitution;
  } else if (x > b.maxX) {
    x = b.maxX;
    vx = -Math.abs(vx) * p.restitution;
  }
  if (y < b.minY && p.ceilingBounce) {
    y = b.minY;
    vy = Math.abs(vy) * p.restitution;
  }
  const onGround = y >= b.maxY;
  if (onGround) {
    y = b.maxY;
    if (vy > 0) {
      landed = vy;
      vy = vy < REST_VY * 4 ? 0 : -vy * p.restitution;
    }
    vx *= Math.exp(-p.groundFriction * dt);
  }
  const resting = onGround && vy === 0 && Math.abs(vx) < REST_VX;
  if (resting) vx = 0;
  return { state: { x, y, vx, vy }, landed, resting };
};
