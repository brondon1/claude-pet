/**
 * 宠物的「脑子」：碎碎念与对话。
 * 两种通道：有 API 凭据走 Anthropic SDK；否则调本机 `claude -p`（用户的 Claude Code 登录，无需 key）。
 * 对话记忆持久化到 ~/.claude-pet/memory.json。
 * @module claude-pet/src/main/brain
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import Anthropic from '@anthropic-ai/sdk';
import { DATA_DIR } from './config.js';
import { spawnClaude } from './claude-cli.js';

const MEMORY_FILE = path.join(DATA_DIR, 'memory.json');

/**
 * 去掉从宿主 Claude Code 会话继承来的环境变量：桌宠若是在某个 Claude Code 会话里启动的，
 * 会带上该会话专用的临时凭证与代理地址，子进程 claude 会用它们鉴权，会话一结束就过期。
 * 去掉后 claude 使用本机自己的登录。
 * @param {NodeJS.ProcessEnv} env 原环境
 * @returns {NodeJS.ProcessEnv} 清理后的环境
 */
export const cleanEnv = (env) =>
  Object.fromEntries(
    Object.entries(env).filter(
      ([k]) => !/^(CLAUDECODE$|CLAUDE_CODE_|CLAUDE_AGENT_SDK_|CLAUDE_PID$|CLAUDE_PREVIEW_)/.test(k) &&
        !(k === 'ANTHROPIC_BASE_URL' && env.CLAUDE_CODE_HOST_SESSION_ID),
    ),
  );
/** 碎碎念话题池：每次随机抽一个，让 Claude 想出来的话不千篇一律。 */
const WHISPER_TOPICS = [
  '此刻的时间段（早上 / 午后 / 深夜）',
  '主人正在写的代码',
  '想吃的零食或饮料',
  '发间的向日葵',
  '窗外的天气（凭感觉猜）',
  '提醒主人休息、喝水、活动一下',
  '对 bug 的吐槽',
  '一个突然冒出来的奇怪小念头',
  '自己是 Claude 的小分身这件事',
  '桌面上的其他窗口',
  '最近学到的小知识',
  '给主人打气',
];

/** 支持服务端 refusal fallback 的模型（其余模型不带该参数）。 */
const FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-1', 'claude-sonnet-5-5']);

/** 当前时间背景，拼进系统提示词。 */
const timeContext = (d = new Date()) => {
  const h = d.getHours();
  const part = h < 6 ? '深夜' : h < 11 ? '上午' : h < 13 ? '中午' : h < 18 ? '下午' : h < 23 ? '晚上' : '深夜';
  const wd = '日一二三四五六'[d.getDay()];
  return `现在是 ${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 星期${wd} ${String(h).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}（${part}）。`;
};

/**
 * 某只宠物的对话记忆文件：第一只（id = main）沿用 memory.json，其他宠物各自一份。
 * @param {string} [petId] 宠物 id
 * @returns {string} 文件路径
 */
export const memoryFile = (petId = 'main') => (petId === 'main' ? MEMORY_FILE : path.join(DATA_DIR, `memory-${petId}.json`));

const readMemory = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return [];
  }
};

const appendMemory = (file, user, assistant) => {
  const mem = readMemory(file);
  mem.push({ user, assistant, at: new Date().toISOString() });
  fs.writeFileSync(file, JSON.stringify(mem, null, 2));
};

/** 清空某只宠物的对话记忆。 */
export const clearMemory = (petId) => fs.rmSync(memoryFile(petId), { force: true });

export class Brain {
  /**
   * @param {() => any} getConfig 读取当前成品配置
   * @param {{onAuthError?: () => void, getPet?: () => {id: string, name: string, persona?: string}}} [hooks]
   *   onAuthError：Claude Code 未登录 / 登录过期时回调（碎碎念等后台调用用它提示登录）；
   *   getPet：这个脑子属于哪只宠物（名字、人设、记忆文件按它取）
   */
  constructor(getConfig, hooks = {}) {
    this.getConfig = getConfig;
    this.onAuthError = hooks.onAuthError;
    this.getPet = hooks.getPet ?? (() => ({ id: 'main', name: getConfig().pets?.[0]?.name ?? '小橙' }));
    this.client = null;
    /** 最近几句碎碎念，提示 Claude 别重复。 */
    this.recentWhispers = [];
  }

  /** 实际使用的通道。 */
  provider() {
    const p = this.getConfig().brain.provider;
    if (p === 'api' || p === 'cli') return p;
    return process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN ? 'api' : 'cli';
  }

  system() {
    const c = this.getConfig();
    const pet = this.getPet();
    return `${pet.persona || c.brain.persona}\n你的名字是「${pet.name}」。${timeContext()}`;
  }

  /**
   * 碎碎念一句：调用本机 Claude Code 现场随机生成，没有固定台词；调用失败返回 null（这一句不说）。
   * @param {string} [context] 此刻发生的事（做某个动作、Claude Code 事件）；不传则随机抽话题
   * @returns {Promise<string|null>} 一句话；失败时 null
   */
  async whisper(context) {
    const w = this.getConfig().whisper;
    const topic = context
      ? `此刻：${context}，围绕这件事说`
      : WHISPER_TOPICS[Math.floor(Math.random() * WHISPER_TOPICS.length)];
    const recent = this.recentWhispers.length ? `\n最近说过（别重复、别太像）：${this.recentWhispers.join(' / ')}` : '';
    const prompt =
      `随口碎碎念一句，像自言自语，可以俏皮、发呆、关心主人或者冒出个小想法。` +
      `这次的话题方向：${topic}。20 字以内，只输出这句话本身，不加引号。${recent}`;
    try {
      // 碎碎念固定走本机 Claude Code（claude -p），用你的 Claude Code 登录现想一句
      const line = (await this.askCli([{ role: 'user', content: prompt }])).split('\n')[0].replace(/^["“「]|["”」]$/g, '').trim();
      if (!line) return null;
      this.recentWhispers = [...this.recentWhispers, line].slice(-6);
      return line;
    } catch (e) {
      console.warn('[claude-pet] 碎碎念调用 Claude Code 失败，这一句不说了：', e.message);
      if (e.code === 'AUTH') this.onAuthError?.();
      return null;
    }
  }

  /**
   * 和宠物聊一句，带最近若干轮记忆。
   * @param {string} text 主人说的话
   * @returns {Promise<string>} 回复
   */
  async chat(text) {
    const rounds = Math.max(0, this.getConfig().brain.memoryRounds | 0);
    const file = memoryFile(this.getPet().id);
    const history = rounds ? readMemory(file).slice(-rounds) : [];
    const messages = history.flatMap((m) => [
      { role: 'user', content: m.user },
      { role: 'assistant', content: m.assistant },
    ]);
    messages.push({ role: 'user', content: text });
    const reply = await this.ask(messages);
    appendMemory(file, text, reply);
    return reply;
  }

  /** @param {{role:'user'|'assistant', content:string}[]} messages 对话 */
  async ask(messages) {
    return this.provider() === 'api' ? this.askApi(messages) : this.askCli(messages);
  }

  async askApi(messages) {
    this.client ??= new Anthropic();
    const model = this.getConfig().brain.apiModel;
    const params = {
      model,
      max_tokens: 2048,
      system: this.system(),
      output_config: { effort: 'low' },
      messages,
    };
    const res = FALLBACK_MODELS.has(model)
      ? await this.client.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
      : await this.client.messages.create(params);
    if (res.stop_reason === 'refusal') return '这个我不太方便说呢~';
    const text = res.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
    return text || '……';
  }

  /** 走本机 claude CLI：禁用工具、不落会话，设 CLAUDE_PET_INTERNAL 让自家 hook 忽略这次调用。 */
  askCli(messages) {
    const c = this.getConfig();
    const last = messages[messages.length - 1].content;
    const past = messages
      .slice(0, -1)
      .map((m) => `${m.role === 'user' ? '主人' : '你'}：${m.content}`)
      .join('\n');
    const prompt = past ? `之前的对话：\n${past}\n\n主人现在说：${last}\n\n直接回复主人。` : last;
    // 系统提示词写进临时文件用 --system-prompt-file 传入：避免多行参数在 Windows 的 cmd.exe
    // （npm 版 claude.cmd）里被当成命令分隔符。
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-pet-'));
    const sysFile = path.join(dir, 'system-prompt.txt');
    fs.writeFileSync(sysFile, this.system(), 'utf8');
    const args = ['-p', '--system-prompt-file', sysFile, '--tools', '', '--no-session-persistence', '--output-format', 'text'];
    if (c.brain.cliModel) args.push('--model', c.brain.cliModel);
    return new Promise((resolve, reject) => {
      let child;
      let timer;
      const cleanup = () => {
        clearTimeout(timer);
        fs.rmSync(dir, { recursive: true, force: true });
      };
      const fail = (e) => {
        cleanup();
        reject(e);
      };
      try {
        child = spawnClaude(args, {
          cwd: DATA_DIR,
          env: { ...cleanEnv(process.env), CLAUDE_PET_INTERNAL: '1' },
        });
      } catch (e) {
        fail(e);
        return;
      }
      let out = '';
      let err = '';
      timer = setTimeout(() => {
        child.kill();
        fail(new Error('claude CLI 超时（120s）'));
      }, 120_000);
      child.stdout.on('data', (d) => (out += d));
      child.stderr.on('data', (d) => (err += d));
      child.on('error', (e) => {
        fail(new Error(`启动 claude 失败（${e.message}）；可设置 ANTHROPIC_API_KEY 改走 API`));
      });
      child.on('close', (code) => {
        if (code === 0 && out.trim()) {
          cleanup();
          return resolve(out.trim());
        }
        const msg = err.trim() || out.trim() || `claude 退出码 ${code}`;
        if (/authenticat|log ?in|OAuth/i.test(msg)) {
          const e = new Error('Claude Code 没登录或登录过期了');
          e.code = 'AUTH';
          return fail(e);
        }
        fail(new Error(msg));
      });
      child.stdin.end(prompt);
    });
  }
}

/**
 * 打开 Claude Code 登录：在一个新终端窗口里运行 `claude auth login`，它会自动打开浏览器登录页，
 * 登录完成后凭证存进本机，终端窗口可以关掉。环境变量先去掉宿主会话的临时凭证（见 cleanEnv）。
 */
export const launchLogin = () => {
  const opts = { env: cleanEnv(process.env), detached: true, stdio: 'ignore', windowsHide: false };
  const child =
    process.platform === 'win32'
      ? spawn('cmd.exe', ['/c', 'start', 'Claude Code 登录', 'cmd', '/k', 'claude auth login'], opts)
      : spawn('claude', ['auth', 'login'], opts);
  child.on('error', (e) => console.error('[claude-pet] 打开登录失败：', e.message));
  child.unref();
};
