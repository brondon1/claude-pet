/**
 * 渲染端：按主进程指令切换动作 / 朝向 / 气泡 / 挤压；把指针交互（点击、拖拽、右键、悬停穿透）报回主进程。
 * 位置移动全在主进程（移动窗口），这里只管画。
 */
import { squashScale, SQ_DURATION_MS } from '../shared/physics.js';
import { nextBlink, talkDuration, BLINK_MS, DOUBLE_BLINK_GAP_MS } from '../shared/expression.js';
import { hitPart, toSprite } from '../shared/bodyparts.js';

const $ = (id) => document.getElementById(id);
const pet = $('pet');
const flip = $('flip');
const squashEl = $('squash');
const video = $('video');
const bubble = $('bubble');
const bubbleText = $('bubbleText');
const bubbleBtn = $('bubbleBtn');
const chat = $('chat');
const chatInput = $('chatInput');
const hit = $('hit');

let webm = {};
let facing = 1;

// ===================== 主进程 → 渲染 =====================
window.pet.on('init', (c) => {
  document.documentElement.style.setProperty('--size', `${c.size}px`);
  webm = c.webm || {};
  probeVideos(webm).then((meta) => window.pet.videoMeta(meta));
});

/**
 * 预读每段动作视频的时长，回报主进程：动作时长跟随视频，避免播一半被切或循环到第二遍。
 * @param {Record<string, string>} map 动作名 → 视频 URL
 * @returns {Promise<Record<string, number>>} 动作名 → 秒
 */
const probeVideos = async (map) => {
  const entries = await Promise.all(
    Object.entries(map).map(
      ([name, src]) =>
        new Promise((resolve) => {
          const v = document.createElement('video');
          v.preload = 'metadata';
          v.muted = true;
          const done = (sec) => resolve([name, sec]);
          v.onloadedmetadata = () => done(Number.isFinite(v.duration) ? v.duration : 0);
          v.onerror = () => done(0);
          v.src = src;
        }),
    ),
  );
  return Object.fromEntries(entries);
};

window.pet.on('play', ({ action, facing: f }) => {
  if (f !== facing) {
    facing = f;
    flip.style.transform = `scaleX(${facing})`;
  }
  // 先清空再设置，保证同一动作连播时 CSS 动画能重新开始
  pet.dataset.action = '';
  void pet.offsetWidth;
  pet.dataset.action = action;
  const src = webm[action];
  if (src) {
    // 视频真正出画后才把立绘换下去，避免加载那一下闪空白
    const show = () => pet.dataset.action === action && pet.classList.add('has-video');
    if (video.dataset.src !== src) {
      pet.classList.remove('has-video');
      video.src = src;
      video.dataset.src = src;
      video.addEventListener('playing', show, { once: true });
    } else show();
    video.loop = true;
    video.currentTime = 0;
    video.play().catch(() => {});
  } else {
    pet.classList.remove('has-video');
    video.pause();
  }
});

let bubbleTimer;
let talkTimer;
window.pet.on('bubble', ({ text, ttl, action }) => {
  clearTimeout(bubbleTimer);
  if (!text) return bubble.classList.remove('show');
  // 气泡按钮（如「去登录」）：有 action 才显示
  bubbleBtn.hidden = !action;
  if (action) {
    bubbleBtn.textContent = action.label;
    bubbleBtn.onclick = () => {
      window.pet.bubbleAction(action.id);
      bubbleBtn.hidden = true;
    };
  }
  const changed = bubbleText.textContent !== text || !bubble.classList.contains('show');
  bubbleText.textContent = text;
  bubble.classList.add('show');
  bubbleText.scrollTop = 0;
  if (ttl > 0) bubbleTimer = setTimeout(() => bubble.classList.remove('show'), ttl);
  // 新的一句话：嘴巴按字数一张一合
  if (changed) {
    clearTimeout(talkTimer);
    pet.classList.add('talking');
    talkTimer = setTimeout(() => pet.classList.remove('talking'), talkDuration(text));
  }
});

// ===================== 眨眼：随机间隔，偶尔连眨两下 =====================
const blinkOnce = (then) => {
  pet.classList.add('blink');
  setTimeout(() => {
    pet.classList.remove('blink');
    then?.();
  }, BLINK_MS);
};
const scheduleBlink = () => {
  const { delay, double } = nextBlink();
  setTimeout(() => {
    blinkOnce(() => (double ? setTimeout(() => blinkOnce(scheduleBlink), DOUBLE_BLINK_GAP_MS) : scheduleBlink()));
  }, delay);
};
scheduleBlink();

let squashRaf = 0;
window.pet.on('squash', ({ amount }) => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  cancelAnimationFrame(squashRaf);
  const t0 = performance.now();
  const step = (now) => {
    const u = (now - t0) / SQ_DURATION_MS;
    const sy = squashScale(u, amount);
    squashEl.style.transform = u >= 1 ? '' : `scale(${1 / Math.sqrt(sy)}, ${sy})`;
    if (u < 1) squashRaf = requestAnimationFrame(step);
  };
  squashRaf = requestAnimationFrame(step);
});

// 输入框两用：聊天（默认）和改名字（mode = 'rename'，预填当前名字）
let inputMode = 'chat';
const CHAT_PLACEHOLDER = chatInput.placeholder;
window.pet.on('chat-open', (o = {}) => {
  inputMode = o.mode || 'chat';
  chatInput.placeholder = o.placeholder || CHAT_PLACEHOLDER;
  chatInput.maxLength = inputMode === 'rename' ? 12 : 500;
  chatInput.value = o.value || '';
  chat.classList.add('show');
  chatInput.focus();
  chatInput.select();
  setHover(true);
});

// ===================== 鼠标穿透：只有身体 / 气泡 / 对话框接收鼠标 =====================
let hovering = false;
let pointerDown = false;
const setHover = (over) => {
  if (over === hovering) return;
  hovering = over;
  window.pet.hover(over);
};
document.addEventListener('mousemove', (e) => {
  if (pointerDown) return;
  const el = document.elementFromPoint(e.clientX, e.clientY);
  setHover(!!el?.closest('#hit, #bubble.show, #chat.show'));
});
document.addEventListener('mouseleave', () => !pointerDown && !chat.classList.contains('show') && setHover(false));

// ===================== 点击 / 拖拽 / 右键 =====================
const DRAG_THRESHOLD = 4;
let down = null;
let dragging = false;

hit.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  hit.setPointerCapture(e.pointerId);
  pointerDown = true;
  down = { x: e.screenX, y: e.screenY, cx: e.clientX, cy: e.clientY };
  dragging = false;
});
hit.addEventListener('pointermove', (e) => {
  if (!down || dragging) return;
  if (Math.hypot(e.screenX - down.x, e.screenY - down.y) > DRAG_THRESHOLD) {
    dragging = true;
    window.pet.dragStart();
  }
});
const release = () => {
  if (!down) return;
  if (dragging) window.pet.dragEnd();
  else {
    // 点在哪个部位：按点下时的位置换算到立绘坐标
    const p = toSprite(pet.getBoundingClientRect(), down.cx, down.cy, facing);
    window.pet.click({ part: hitPart(p.x, p.y) });
  }
  down = null;
  dragging = false;
  pointerDown = false;
};
hit.addEventListener('pointerup', release);
hit.addEventListener('pointercancel', release);
hit.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  window.pet.contextMenu();
});

// ===================== 对话框 =====================
const closeChat = () => {
  chat.classList.remove('show');
  chatInput.value = '';
  window.pet.chatClosed();
};
chat.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;
  const mode = inputMode;
  closeChat();
  if (mode === 'rename') return window.pet.rename(text);
  try {
    await window.pet.chat(text);
  } catch {
    // 主进程已在气泡里报错
  }
});
chatInput.addEventListener('keydown', (e) => e.key === 'Escape' && closeChat());
// 点到屏幕上别的地方（窗口失去焦点）就收起输入框，和按 Esc 一样
window.addEventListener('blur', () => chat.classList.contains('show') && closeChat());
