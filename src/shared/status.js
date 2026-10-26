/**
 * Claude Code hook 事件 → 桌宠工作状态。
 * 每个会话（session_id）独立记状态，多会话并行时取最需要注意的那个显示。
 * 纯逻辑，主进程与测试共用。
 * @module claude-pet/src/shared/status
 */

/** 工作状态 → 循环动画。 */
export const STATUS_ANIM = { thinking: 'think', working: 'work', waiting: 'wait', organizing: 'organize' };

/** 状态优先级：多会话时显示数值最大的那个；同级取最近更新的。 */
const PRIORITY = { waiting: 4, organizing: 3, working: 2, thinking: 2 };

/** 默认文案（config.statusTexts 可逐项覆盖）。 */
export const DEFAULT_TEXTS = {
  thinking: '让我想想…',
  afterTool: '琢磨一下结果…',
  waitingPermission: '需要你批准一下！',
  waitingInput: '等你回复~',
  organizing: '整理记忆中…',
  done: '搞定啦！',
  toolError: '出了点岔子，再试试',
  stopError: '呜，出错了',
  greet: '新会话开始啦，冲！',
  bye: '下次见~',
};

const short = (s, n = 22) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
const base = (p) => String(p ?? '').split(/[\\/]/).pop();

/**
 * 工具调用 → 一句气泡文案。
 * @param {string} tool 工具名
 * @param {Record<string, any>} [input] 工具参数
 * @returns {string} 文案
 */
export const toolText = (tool, input = {}) => {
  switch (tool) {
    case 'Bash':
    case 'PowerShell':
      return `跑命令：${short(input.description || input.command)}`;
    case 'Edit':
    case 'MultiEdit':
    case 'Write':
    case 'NotebookEdit':
      return `改 ${short(base(input.file_path || input.notebook_path))}`;
    case 'Read':
      return `读 ${short(base(input.file_path))}`;
    case 'Grep':
    case 'Glob':
      return `翻找 ${short(input.pattern, 16)}`;
    case 'WebFetch':
    case 'WebSearch':
      return '上网查资料～';
    case 'Task':
    case 'Agent':
      return `派出小分队：${short(input.description, 14)}`;
    case 'TodoWrite':
      return '排一下计划';
    default:
      if (tool?.startsWith('mcp__')) return `调用 ${short(tool.split('__')[1], 14)}`;
      return `用 ${short(tool, 16)}`;
  }
};

/**
 * 多会话状态跟踪器。apply() 吃一条 hook 负载，返回本次要做的一次性效果；current() 给出当前应显示的常驻状态。
 */
export class SessionTracker {
  /**
   * @param {{texts?: Partial<typeof DEFAULT_TEXTS>, staleMs?: number, notifyMinBusyMs?: number}} [o] 选项
   */
  constructor(o = {}) {
    this.texts = { ...DEFAULT_TEXTS, ...(o.texts || {}) };
    this.staleMs = o.staleMs ?? 10 * 60_000;
    this.notifyMinBusyMs = o.notifyMinBusyMs ?? 20_000;
    /** @type {Map<string, {status:string, text:string, at:number, busySince:number}>} */
    this.sessions = new Map();
  }

  /**
   * 处理一条 hook 负载。
   * @param {Record<string, any>} p Claude Code 通过 stdin 传给 hook 的 JSON
   * @param {number} [now] 当前时间
   * @returns {{oneShot?: string, bubble?: string, notify?: {title:string, body:string}}} 一次性效果
   */
  apply(p, now = Date.now()) {
    const id = p.session_id || 'default';
    const T = this.texts;
    const s = this.sessions.get(id);
    // 记下会话的工作目录与记录文件：气泡显示项目名，并从记录里读 Claude 最新的思考过程
    const where = { cwd: p.cwd ?? s?.cwd, transcript: p.transcript_path ?? s?.transcript };
    const set = (status, text) => {
      this.sessions.set(id, { status, text, at: now, busySince: s?.busySince || now, ...where });
    };
    switch (p.hook_event_name) {
      case 'SessionStart':
        return { oneShot: 'wave', bubble: T.greet };
      case 'UserPromptSubmit':
        this.sessions.set(id, { status: 'thinking', text: T.thinking, at: now, busySince: now, ...where });
        return {};
      case 'PreToolUse':
        set('working', toolText(p.tool_name, p.tool_input));
        return {};
      case 'PostToolUse':
        set('thinking', T.afterTool);
        return {};
      case 'PostToolUseFailure':
        set('thinking', T.afterTool);
        return { oneShot: 'error', bubble: T.toolError };
      case 'PreCompact':
        set('organizing', T.organizing);
        return {};
      case 'Notification': {
        const msg = String(p.message || '');
        const isPerm = p.notification_type === 'permission_prompt' || /permission|approv|批准|权限/i.test(msg);
        const text = isPerm ? T.waitingPermission : T.waitingInput;
        set('waiting', text);
        return { notify: { title: isPerm ? 'Claude 需要你批准' : 'Claude 在等你', body: msg || text } };
      }
      case 'Stop': {
        const busy = s ? now - s.busySince : 0;
        this.sessions.delete(id);
        const out = { oneShot: 'success', bubble: T.done };
        if (busy >= this.notifyMinBusyMs) {
          out.notify = { title: 'Claude 完成了', body: `${T.done}（用时 ${Math.round(busy / 1000)} 秒）` };
        }
        return out;
      }
      case 'StopFailure':
        this.sessions.delete(id);
        return { oneShot: 'error', bubble: T.stopError, notify: { title: 'Claude 出错了', body: String(p.error || T.stopError) } };
      case 'SessionEnd':
        this.sessions.delete(id);
        return { bubble: T.bye };
      default:
        return {};
    }
  }

  /**
   * 当前应显示的常驻状态；没有活跃会话时返回 null。
   * @param {number} [now] 当前时间
   * @returns {{status:string, text:string, sessionId:string}|null} 状态
   */
  current(now = Date.now()) {
    let best = null;
    for (const [id, s] of this.sessions) {
      if (now - s.at > this.staleMs) {
        this.sessions.delete(id);
        continue;
      }
      const pr = PRIORITY[s.status] ?? 0;
      if (!best || pr > best.pr || (pr === best.pr && s.at > best.at)) best = { pr, at: s.at, id, s };
    }
    return best
      ? { status: best.s.status, text: best.s.text, sessionId: best.id, cwd: best.s.cwd, transcript: best.s.transcript }
      : null;
  }
}
