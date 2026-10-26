import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  throwStep,
  estimateReleaseVelocity,
  squashScale,
  landingSquash,
  springStep,
  DEFAULT_PHYSICS,
} from '../src/shared/physics.js';
import { pickNext, weightedPick, ACTIONS, MENU_GROUPS } from '../src/shared/behavior.js';
import { SessionTracker, toolText } from '../src/shared/status.js';
import { parseJsonc, deepMerge } from '../src/shared/jsonc.js';

const B = { minX: 0, maxX: 1000, minY: 0, maxY: 500 };

test('thrown pet eventually rests on the ground inside bounds', () => {
  let s = { x: 500, y: 100, vx: 2500, vy: -1200 };
  let rested = false;
  for (let i = 0; i < 2000 && !rested; i++) {
    const r = throwStep(s, B, 1 / 60, DEFAULT_PHYSICS);
    s = r.state;
    assert.ok(s.x >= B.minX && s.x <= B.maxX, `x out of bounds: ${s.x}`);
    assert.ok(s.y >= B.minY && s.y <= B.maxY, `y out of bounds: ${s.y}`);
    rested = r.resting;
  }
  assert.ok(rested, 'never came to rest');
  assert.equal(s.y, B.maxY);
});

test('wall hit reverses horizontal velocity', () => {
  const r = throwStep({ x: 995, y: 200, vx: 1000, vy: 0 }, B, 0.02);
  assert.equal(r.state.x, B.maxX);
  assert.ok(r.state.vx < 0);
});

test('release velocity: slow drag is a gentle drop, fast fling throws', () => {
  const now = 1000;
  const slow = [
    { x: 0, y: 0, t: 900 },
    { x: 10, y: 0, t: 1000 },
  ];
  assert.equal(estimateReleaseVelocity(slow, now), null);
  const fast = [
    { x: 0, y: 0, t: 920 },
    { x: 150, y: -50, t: 1000 },
  ];
  const v = estimateReleaseVelocity(fast, now);
  assert.ok(v && v.vx > 0 && v.vy < 0);
  // 停顿过久 → 放下
  assert.equal(estimateReleaseVelocity(fast, 1400), null);
});

test('squash curve starts and ends at 1, dips in between', () => {
  assert.equal(squashScale(0, 0.4), 1);
  assert.equal(squashScale(1, 0.4), 1);
  assert.ok(squashScale(0.3, 0.4) < 0.7);
  assert.equal(landingSquash(100), 0);
  assert.ok(landingSquash(2000) <= 0.5);
});

test('spring converges to target', () => {
  let s = { x: 0, y: 0, vx: 0, vy: 0 };
  for (let i = 0; i < 120; i++) s = springStep(s, { x: 100, y: 50 }, 1 / 60);
  assert.ok(Math.abs(s.x - 100) < 1 && Math.abs(s.y - 50) < 1);
});

test('weightedPick respects zero weights', () => {
  for (let i = 0; i < 50; i++) assert.equal(weightedPick([{ item: 'a', w: 0 }, { item: 'b', w: 1 }]), 'b');
  assert.equal(weightedPick([{ item: 'a', w: 0 }]), undefined);
});

test('pickNext never walks when walking is disabled and never repeats a fun action', () => {
  for (let i = 0; i < 300; i++) {
    const a = pickNext({ prev: 'dance', canWalk: false });
    assert.notEqual(a, 'walk');
    assert.notEqual(a, 'dance');
    assert.ok(ACTIONS[a]);
  }
});

test('menu groups only reference known actions', () => {
  for (const list of Object.values(MENU_GROUPS)) for (const a of list) assert.ok(ACTIONS[a], a);
});

test('tool text summarises common tools', () => {
  assert.equal(toolText('Read', { file_path: 'C:\\x\\foo.ts' }), '读 foo.ts');
  assert.match(toolText('Bash', { command: 'npm test' }), /npm test/);
  assert.match(toolText('mcp__github__create_pr', {}), /github/);
});

test('session tracker: full turn lifecycle', () => {
  const t = new SessionTracker({ notifyMinBusyMs: 1000 });
  t.apply({ hook_event_name: 'UserPromptSubmit', session_id: 'a' }, 0);
  assert.equal(t.current(0).status, 'thinking');
  t.apply({ hook_event_name: 'PreToolUse', session_id: 'a', tool_name: 'Edit', tool_input: { file_path: '/p/a.js' } }, 10);
  assert.deepEqual(t.current(10), { status: 'working', text: '改 a.js', sessionId: 'a', cwd: undefined, transcript: undefined });
  const n = t.apply({ hook_event_name: 'Notification', session_id: 'a', message: 'Claude needs your permission to use Bash' }, 20);
  assert.equal(t.current(20).status, 'waiting');
  assert.ok(n.notify);
  const done = t.apply({ hook_event_name: 'Stop', session_id: 'a' }, 5000);
  assert.equal(done.oneShot, 'success');
  assert.ok(done.notify, 'long turn should notify');
  assert.equal(t.current(5000), null);
});

test('session tracker: short turn does not notify, waiting wins over working', () => {
  const t = new SessionTracker({ notifyMinBusyMs: 1000 });
  t.apply({ hook_event_name: 'UserPromptSubmit', session_id: 'a' }, 0);
  assert.equal(t.apply({ hook_event_name: 'Stop', session_id: 'a' }, 10).notify, undefined);
  t.apply({ hook_event_name: 'PreToolUse', session_id: 'x', tool_name: 'Bash', tool_input: {} }, 100);
  t.apply({ hook_event_name: 'Notification', session_id: 'y', message: 'waiting for input' }, 50);
  assert.equal(t.current(100).sessionId, 'y');
});

test('session tracker drops stale sessions', () => {
  const t = new SessionTracker({ staleMs: 100 });
  t.apply({ hook_event_name: 'UserPromptSubmit', session_id: 'a' }, 0);
  assert.equal(t.current(500), null);
});

test('jsonc: comments, trailing commas, and slashes inside strings', () => {
  const v = parseJsonc('{\n // c\n "a": "http://x", /* b */ "b": [1,2,],\n}');
  assert.deepEqual(v, { a: 'http://x', b: [1, 2] });
  assert.deepEqual(deepMerge({ a: { b: 1, c: 2 }, l: [1] }, { a: { b: 3 }, l: [9] }), { a: { b: 3, c: 2 }, l: [9] });
});


test('blink timing is irregular within 2-6s and talking scales with text length', async () => {
  const { nextBlink, talkDuration } = await import('../src/shared/expression.js');
  assert.deepEqual(nextBlink(() => 0), { delay: 2000, double: true });
  assert.equal(nextBlink(() => 0.999).delay <= 6000, true);
  assert.equal(nextBlink(() => 0.5).double, false);
  assert.equal(talkDuration(''), 600);
  assert.ok(talkDuration('搞定啦！') < talkDuration('这一句话明显更长一些，嘴巴要多动一会儿'));
  assert.equal(talkDuration('长'.repeat(200)), 4000);
});

test('video actions replace built-in visuals and add new fun actions', async () => {
  const { withVideoActions, pickNext: pick } = await import('../src/shared/behavior.js');
  const a = withVideoActions({ eat: 9.5, think: 10, 吃冰淇淋: 10.04 });
  assert.equal(a.eat.dur, 9500);
  assert.equal(a.eat.video, true);
  assert.equal(a.think.dur, 10000, 'looping status plays the whole video before restarting');
  assert.equal(a.think.loop, true);
  assert.deepEqual({ cat: a.吃冰淇淋.cat, dur: a.吃冰淇淋.dur }, { cat: 'fun', dur: 10040 });
  assert.equal(ACTIONS.吃冰淇淋, undefined, 'built-in table untouched');
  const seen = new Set();
  for (let i = 0; i < 400; i++) seen.add(pick({ actions: a, weights: { idle: 0, move: 0, turn: 0, fun: 1 } }));
  assert.ok(seen.has('吃冰淇淋'));
});

test('multi-monitor throw: edges (incl. floor) toward neighbouring screens are open', async () => {
  const { throwBounds } = await import('../src/shared/displays.js');
  const mk = (x, y, w, h, bar = 48) => ({ bounds: { x, y, width: w, height: h }, workArea: { x, y, width: w, height: h - bar } });
  const g = { W: 480, H: 330, S: 200, PW: 124 };
  const main = mk(0, 0, 1600, 900);
  const above = mk(0, -1080, 1920, 1080);
  const right = mk(1600, 0, 1920, 1080);
  // 单屏：顶在屏内
  const single = throwBounds([main], 800, 600, g);
  assert.equal(single.minY, -(g.H - g.S));
  // 上方有屏：顶打开到上屏顶部；地面仍是主屏底
  const up = throwBounds([main, above], 800, 600, g);
  assert.equal(up.minY, -1080 - (g.H - g.S));
  assert.equal(up.maxY, 852 - g.H);
  // 已经飞进上屏：下方有主屏，地面打开，会穿回主屏落在主屏底边
  const inAbove = throwBounds([main, above], 800, -300, g);
  assert.equal(inAbove.maxY, 852 - g.H);
  assert.equal(inAbove.minY, -1080 - (g.H - g.S));
  // 右侧有屏：右墙打开
  const r = throwBounds([main, right], 800, 600, g);
  assert.ok(r.maxX > 1600 + 1000);
  // 不重叠的方向不打开：中心 x 不在上屏范围内
  assert.equal(throwBounds([main, mk(2000, -1080, 1920, 1080)], 800, 600, g).minY, -(g.H - g.S));
});

test('click position maps to body parts, mirrored when facing left', async () => {
  const { hitPart, toSprite, PARTS } = await import('../src/shared/bodyparts.js');
  assert.equal(hitPart(348, 122), 'flower');
  assert.equal(hitPart(232, 265), 'face');
  assert.equal(hitPart(230, 80), 'head');
  assert.equal(hitPart(100, 520), 'hand');
  assert.equal(hitPart(240, 390), 'chest');
  assert.equal(hitPart(250, 600), 'skirt');
  assert.equal(hitPart(240, 740), 'legs');
  assert.equal(hitPart(240, 860), 'feet');
  assert.equal(hitPart(60, 400), 'hair');
  for (const k of Object.keys(PARTS)) assert.ok(PARTS[k].context && PARTS[k].reaction, k);
  // 宠物框 124×200，立绘按 521:900 居中；朝左时同一屏幕点对应镜像的立绘坐标
  const box = { left: 0, top: 0, width: 124, height: 200 };
  const right = toSprite(box, 62 + 25, 27, 1);
  const left = toSprite(box, 62 - 25, 27, -1);
  assert.ok(Math.abs(right.x - left.x) < 1e-9 && Math.abs(right.y - left.y) < 1e-9);
  assert.equal(hitPart(toSprite(box, 62, 199, 1).x, toSprite(box, 62, 199, 1).y), 'feet');
});

test('scheduled actions fire once per day within the grace window', async () => {
  const { dueEntries, resolveAction, parseTime } = await import('../src/shared/schedule.js');
  const entries = [
    { time: '12:00', action: ['煮火锅', 'eat'], context: '午饭' },
    { time: '09:00', action: 'coffee', days: [1, 2, 3, 4, 5] },
    { time: 'bad', action: 'eat' },
  ];
  const fired = new Set();
  const at = (h, m, day = 26) => new Date(2026, 9, day, h, m); // 2026-10-26 是周一
  assert.equal(dueEntries(entries, at(11, 59), fired).length, 0);
  const due = dueEntries(entries, at(12, 2), fired);
  assert.deepEqual(due.map((d) => d.entry.time), ['12:00']);
  fired.add(due[0].key);
  assert.equal(dueEntries(entries, at(12, 3), fired).length, 0, 'once per day');
  assert.equal(dueEntries(entries, at(12, 10), new Set()).length, 0, 'outside grace window');
  assert.equal(dueEntries(entries, at(12, 1, 27), fired).length, 1, 'fires again next day');
  assert.equal(dueEntries(entries, at(9, 0, 26), fired).length, 1, 'weekday');
  assert.equal(dueEntries(entries, at(9, 0, 25), fired).length, 0, 'not on Sunday');
  assert.equal(resolveAction(['煮火锅', 'eat'], { eat: {} }), 'eat');
  assert.equal(resolveAction('nope', { eat: {} }), null);
  assert.equal(parseTime('24:00'), null);
});

test('setJsoncValue edits a top-level flag in place and keeps comments', async () => {
  const { setJsoncValue } = await import('../src/main/config.js');
  const { parseJsonc } = await import('../src/shared/jsonc.js');
  const tpl = '// 注释\n{\n  // "name": "小克",\n  // "size": 160\n}\n';
  const a = setJsoncValue(tpl, 'autoStart', false);
  assert.deepEqual(parseJsonc(a), { autoStart: false });
  assert.ok(a.includes('// 注释'));
  const b = setJsoncValue(a, 'autoStart', true);
  assert.deepEqual(parseJsonc(b), { autoStart: true });
  const c = setJsoncValue('{\n  "size": 200\n}', 'autoStart', true);
  assert.deepEqual(parseJsonc(c), { autoStart: true, size: 200 });
  // 字符串：新增、原地替换（含引号、$ 等特殊字符）
  const d = setJsoncValue(c, 'name', '小橙');
  assert.deepEqual(parseJsonc(d), { name: '小橙', autoStart: true, size: 200 });
  const e = setJsoncValue(d, 'name', '阿"橙"$1');
  assert.deepEqual(parseJsonc(e), { name: '阿"橙"$1', autoStart: true, size: 200 });
});

test('status bubble shows project folder and latest visible thinking from the transcript', async () => {
  const { latestThought, statusBubble, oneLine } = await import('../src/shared/thought.js');
  const t = new SessionTracker();
  t.apply({ hook_event_name: 'UserPromptSubmit', session_id: 's', cwd: 'E:\\work\\my-app', transcript_path: '/x.jsonl' }, 0);
  assert.equal(t.current(0).cwd, 'E:\\work\\my-app');
  assert.equal(t.current(0).transcript, '/x.jsonl');
  const line = (o) => JSON.stringify(o);
  const rows = [
    '{"partial line',
    line({ type: 'assistant', message: { content: [{ type: 'text', text: '**先看看** 配置文件\n第二行' }] } }),
    line({ type: 'user', message: { content: [{ type: 'tool_result' }] } }),
    line({ type: 'assistant', message: { content: [{ type: 'thinking', thinking: '' }, { type: 'tool_use', name: 'Bash', input: { description: 'Run unit tests', command: 'npm test' } }] } }),
    line({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'mcp__ccd_turn__update_plan', input: {} }] } }),
  ];
  assert.equal(latestThought(rows.join('\n')), '跑命令：Run unit tests');
  assert.equal(latestThought(rows.slice(0, 3).join('\n')), '先看看 配置文件');
  assert.equal(latestThought('garbage'), null);
  assert.equal(statusBubble({ text: '让我想想…', cwd: 'E:\\work\\my-app' }, null), '📂 my-app\n让我想想…');
  assert.equal(statusBubble({ text: 'x' }, '读 a.js'), '读 a.js');
  assert.equal([...oneLine('长'.repeat(100))].length, 28);
});

test('normalizePets fills defaults, migrates legacy single-pet config and dedupes ids', async () => {
  const { normalizePets } = await import('../src/main/config.js');
  const w = [];
  const legacy = normalizePets({ name: 'claude娘', size: 260 }, w);
  assert.equal(legacy.length, 1);
  assert.deepEqual([legacy[0].id, legacy[0].name, legacy[0].size, legacy[0].position], ['main', 'claude娘', 260, 'bottom-right']);
  const many = normalizePets({ pets: [{ name: 'A' }, { id: 'main', name: 'B', size: 9999 }, { name: '' }] }, w);
  assert.deepEqual(many.map((p) => p.id), ['main', 'main-2', 'pet-3']);
  assert.equal(many[1].size, 200);
  assert.equal(many[2].name, '小橙');
  assert.ok(w.some((s) => s.includes('9999')));
});

test('pet collision conserves momentum, separates overlap and ignores separating pets', async () => {
  const { collide, bodyBox } = await import('../src/shared/collision.js');
  const box = (x) => ({ x, y: 0, w: 80, h: 200 });
  // A 向右飞撞上静止的 B（同质量）：近似交换速度
  const r = collide({ box: box(0), vx: 1000, vy: 0, m: 1 }, { box: box(70), vx: 0, vy: 0, m: 1 }, 1);
  assert.ok(r);
  assert.equal(r.a.vx, 0);
  assert.equal(r.b.vx, 1000);
  assert.ok(r.a.dx < 0 && r.b.dx > 0, 'pushed apart');
  // 动量守恒（不同质量、非完全弹性）
  const q = collide({ box: box(0), vx: 900, vy: 0, m: 4 }, { box: box(60), vx: -100, vy: 0, m: 1 }, 0.9);
  assert.ok(Math.abs(4 * q.a.vx + 1 * q.b.vx - (4 * 900 + 1 * -100)) < 1e-6);
  // 不重叠 → null；已在分开 → 只推开不改速度
  assert.equal(collide({ box: box(0), vx: 0, vy: 0, m: 1 }, { box: box(200), vx: 0, vy: 0, m: 1 }), null);
  const s = collide({ box: box(0), vx: -50, vy: 0, m: 1 }, { box: box(70), vx: 50, vy: 0, m: 1 });
  assert.deepEqual([s.a.vx, s.b.vx], [-50, 50]);
  const bb = bodyBox(100, 50, { W: 480, H: 330, S: 200 });
  assert.equal(bb.y, 50 + 130);
  assert.equal(bb.x + bb.w / 2, 100 + 240);
});
