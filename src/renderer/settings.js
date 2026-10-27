/**
 * 设置窗口：编辑宠物列表（增删、逐只配置）、全局开关、物理参数；保存后桌宠即时生效。
 */
const $ = (id) => document.getElementById(id);

/** @type {any} */
let model = null;
let current = 0;

const PET_FIELDS = ['name', 'size', 'position', 'offsetX', 'offsetY', 'workStatusEnabled', 'whisperEnabled', 'fixed', 'persona'];
const NUM = new Set(['size', 'offsetX', 'offsetY']);

const setVal = (el, v) => (el.type === 'checkbox' ? (el.checked = !!v) : (el.value = v ?? ''));
const getVal = (el, num) => (el.type === 'checkbox' ? el.checked : num ? Number(el.value) : el.value);

const renderTabs = () => {
  const tabs = $('tabs');
  tabs.textContent = '';
  model.pets.forEach((p, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = `${p.name || '未命名'} (${p.size}px)`;
    b.className = i === current ? 'active' : '';
    b.onclick = () => {
      readPet();
      current = i;
      render();
    };
    tabs.append(b);
  });
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'add';
  add.textContent = '+ 添加宠物';
  add.onclick = () => {
    readPet();
    const n = model.pets.length;
    const used = new Set(model.pets.map((p) => p.id));
    let k = n + 1;
    while (used.has(`pet-${k}`)) k++;
    // 新宠物错开一点出生位置，免得叠在一起
    model.pets.push({ ...model.petDefaults, id: `pet-${k}`, name: `小橙${k}`, offsetX: 24 + n * 160 });
    current = model.pets.length - 1;
    render();
  };
  tabs.append(add);
  $('removePet').disabled = model.pets.length <= 1;
};

const renderPet = () => {
  const p = model.pets[current];
  for (const f of PET_FIELDS) setVal($(`p-${f}`), p[f]);
  $('p-persona').placeholder = model.brain.persona;
};

/** 把表单里当前宠物的值收回 model。 */
const readPet = () => {
  const p = model.pets[current];
  for (const f of PET_FIELDS) p[f] = getVal($(`p-${f}`), NUM.has(f));
};

const renderGlobal = () => {
  setVal($('g-notificationsEnabled'), model.notificationsEnabled);
  setVal($('g-autoStart'), model.autoStart);
  setVal($('g-roam'), model.roam);
  setVal($('g-walkSpeed'), model.walkSpeed);
  setVal($('g-celebrate'), Math.round((model.celebrateChance ?? 0.3) * 100));
  setVal($('g-idleAnim'), model.idleAnimation?.enabled);
  setVal($('g-idleMin'), model.idleAnimation?.minSec);
  setVal($('g-idleMax'), model.idleAnimation?.maxSec);
  setVal($('g-whisperEnabled'), model.whisper.enabled);
  setVal($('g-minSec'), model.whisper.minSec);
  setVal($('g-maxSec'), model.whisper.maxSec);
  setVal($('g-cooldownSec'), model.whisper.cooldownSec);
  setVal($('g-memoryRounds'), model.brain.memoryRounds);
  setVal($('g-memEnabled'), model.memory?.enabled !== false);
  setVal($('g-memPrompts'), model.memory?.observePrompts !== false);
  setVal($('g-memEvery'), model.memory?.consolidateEvery);
  setVal($('g-memMax'), model.memory?.maxItems);
  setVal($('g-cliModel'), model.brain.cliModel);
  setVal($('g-persona'), model.brain.persona);
  for (const k of ['gravity', 'restitution', 'groundFriction', 'throwPower', 'ceilingBounce', 'petCollision']) setVal($(`ph-${k}`), model.physics[k]);
};

const readGlobal = () => ({
  pets: model.pets,
  notificationsEnabled: getVal($('g-notificationsEnabled')),
  autoStart: getVal($('g-autoStart')),
  roam: getVal($('g-roam')),
  walkSpeed: getVal($('g-walkSpeed'), true),
  celebrateChance: Math.min(100, Math.max(0, getVal($('g-celebrate'), true))) / 100,
  idleAnimation: { enabled: getVal($('g-idleAnim')), minSec: getVal($('g-idleMin'), true), maxSec: getVal($('g-idleMax'), true) },
  whisper: {
    enabled: getVal($('g-whisperEnabled')),
    minSec: getVal($('g-minSec'), true),
    maxSec: getVal($('g-maxSec'), true),
    cooldownSec: getVal($('g-cooldownSec'), true),
  },
  brain: { persona: getVal($('g-persona')), memoryRounds: getVal($('g-memoryRounds'), true), cliModel: getVal($('g-cliModel')) },
  memory: {
    enabled: getVal($('g-memEnabled')),
    observePrompts: getVal($('g-memPrompts')),
    consolidateEvery: getVal($('g-memEvery'), true),
    maxItems: getVal($('g-memMax'), true),
  },
  physics: Object.fromEntries(
    ['gravity', 'restitution', 'groundFriction', 'throwPower', 'ceilingBounce', 'petCollision'].map((k) => [
      k,
      getVal($(`ph-${k}`), !['ceilingBounce', 'petCollision'].includes(k)),
    ]),
  ),
});

const render = () => {
  renderTabs();
  renderPet();
};

const status = (text, cls) => {
  const s = $('status');
  s.textContent = text;
  s.className = cls || '';
};

$('removePet').onclick = () => {
  if (model.pets.length <= 1) return;
  model.pets.splice(current, 1);
  current = Math.max(0, current - 1);
  render();
  status('已删除，点「保存」后生效');
};

// 名字 / 大小改了，标签上的文字跟着变
for (const f of ['name', 'size']) $(`p-${f}`).addEventListener('input', () => (readPet(), renderTabs()));

$('save').onclick = async () => {
  readPet();
  try {
    const r = await window.settings.save(readGlobal());
    model = r.snapshot;
    current = Math.min(current, model.pets.length - 1);
    render();
    renderGlobal();
    status(r.warnings?.length ? `已保存，但有问题：${r.warnings[0]}` : '已保存，桌宠即时生效。', r.warnings?.length ? 'err' : 'ok');
  } catch (e) {
    status(`保存失败：${e.message}`, 'err');
  }
};

$('openFile').onclick = () => window.settings.openFile();

window.settings.get().then((m) => {
  model = m;
  render();
  renderGlobal();
});
