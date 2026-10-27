/**
 * 配置加载：内置 config.jsonc 为默认值，~/.claude-pet/config.jsonc 覆盖（深合并）。
 * 用户配置写错不致命：告警并回落到默认值。
 * @module claude-pet/src/main/config
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseJsonc, deepMerge } from '../shared/jsonc.js';

const here = path.dirname(fileURLToPath(import.meta.url));
/** 项目根目录。 */
export const ROOT = path.resolve(here, '..', '..');
/**
 * 重新启动本应用时传给可执行文件的参数：开发时是 electron.exe + 项目根，打包成 exe 后 exe 自己就是应用，不用参数。
 * （process.defaultApp 只在用 electron.exe 跑项目目录时为 true）
 */
export const APP_ARGS = process.defaultApp ? [ROOT] : [];
/**
 * 打包后项目文件在 app.asar 里，只有 Electron 自己读得到；要交给外部程序（node 跑 hook、Windows 读图标）的文件
 * 打包时解到了 app.asar.unpacked（见 package.json 的 build.asarUnpack），路径换过去。开发时原样返回。
 */
export const unpacked = (p) => p.replace(/app\.asar(?=[\\/])/, 'app.asar.unpacked');
/** 用户数据目录：配置、对话记忆、自定义素材。 */
export const DATA_DIR = process.env.CLAUDE_PET_HOME || path.join(os.homedir(), '.claude-pet');
/** 用户配置文件路径。 */
export const USER_CONFIG = path.join(DATA_DIR, 'config.jsonc');

const USER_TEMPLATE = `// claude-pet 用户配置：只写想改的字段，其余沿用内置默认（见项目根 config.jsonc）
// 改完右键宠物 →「重载配置」
{
  // "name": "小橙",
  // "size": 200
}
`;

/**
 * 读取成品配置。
 * @returns {{config: any, warnings: string[]}} 合并后的配置与告警
 */
export const loadConfig = () => {
  const warnings = [];
  const defaults = parseJsonc(fs.readFileSync(path.join(ROOT, 'config.jsonc'), 'utf8'));
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(USER_CONFIG)) fs.writeFileSync(USER_CONFIG, USER_TEMPLATE);
  let user = {};
  try {
    user = parseJsonc(fs.readFileSync(USER_CONFIG, 'utf8')) ?? {};
  } catch (e) {
    warnings.push(`用户配置解析失败，已使用默认值：${e.message}`);
  }
  const config = deepMerge(defaults, user);
  config.pets = normalizePets(config, warnings);
  return { config, warnings };
};

/** 单只宠物的默认值。 */
export const PET_DEFAULTS = {
  name: '小橙',
  size: 200,
  position: 'bottom-right',
  offsetX: 24,
  offsetY: 0,
  workStatusEnabled: true,
  whisperEnabled: true,
  fixed: false,
  persona: '',
};
const POSITIONS = ['bottom-right', 'bottom-left', 'top-right', 'top-left'];

/**
 * 把配置里的 pets[] 整理成完整、合法的列表。纯函数（只往 warnings 里记问题）。
 * 兼容旧版单宠物配置：顶层 name / size / position / workStatusEnabled 并入第一只。
 * @param {any} config 合并后的配置
 * @param {string[]} [warnings] 告警收集
 * @returns {typeof PET_DEFAULTS & {id: string}[]} 宠物列表（至少一只）
 */
export const normalizePets = (config, warnings = []) => {
  const list = Array.isArray(config.pets) && config.pets.length ? config.pets : [{}];
  const legacy = {};
  for (const k of ['name', 'size', 'position', 'workStatusEnabled']) if (config[k] !== undefined) legacy[k] = config[k];
  const used = new Set();
  return list.map((raw, i) => {
    const p = { ...PET_DEFAULTS, ...(i === 0 ? legacy : {}), ...raw };
    let id = String(p.id || (i === 0 ? 'main' : `pet-${i + 1}`)).replace(/[^\w-]/g, '') || `pet-${i + 1}`;
    while (used.has(id)) id = `${id}-${i + 1}`;
    used.add(id);
    p.id = id;
    p.name = String(p.name || PET_DEFAULTS.name).trim().slice(0, 12) || PET_DEFAULTS.name;
    if (!(p.size >= 60 && p.size <= 600)) {
      warnings.push(`宠物「${p.name}」size=${p.size} 超出 60~600，已回落为 ${PET_DEFAULTS.size}`);
      p.size = PET_DEFAULTS.size;
    }
    if (!POSITIONS.includes(p.position)) p.position = PET_DEFAULTS.position;
    p.offsetX = Number(p.offsetX) || 0;
    p.offsetY = Number(p.offsetY) || 0;
    return p;
  });
};

/**
 * 设置页保存：把若干顶层字段写进用户配置（整段替换这些键，其余键保留）。
 * 写回的是 JSON（用户配置里原有的注释会丢，文件头保留一段说明）。写了 pets 就去掉旧版的顶层单宠物字段。
 * @param {Record<string, any>} patch 要写的顶层字段
 */
export const saveUserConfig = (patch) => {
  let user = {};
  try {
    user = parseJsonc(fs.readFileSync(USER_CONFIG, 'utf8')) ?? {};
  } catch {
    // 读不了就从空配置开始
  }
  const next = { ...user, ...patch };
  if (patch.pets) for (const k of ['name', 'size', 'position', 'workStatusEnabled']) delete next[k];
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(
    USER_CONFIG,
    `// claude-pet 用户配置（右键「设置…」保存时自动生成）：只放与默认值（见项目根 config.jsonc）不同的字段\n${JSON.stringify(next, null, 2)}\n`,
  );
};

/**
 * 在用户配置文本里设置一个顶层布尔 / 数字 / 字符串字段：已有就原地替换，没有就插到第一个 { 后面。
 * 只做文本替换，保留文件里的注释。纯函数。
 * @param {string} text 用户配置原文
 * @param {string} key 字段名
 * @param {boolean|number|string} value 值
 * @returns {string} 新文本
 */
export const setJsoncValue = (text, key, value) => {
  const v = JSON.stringify(value);
  const re = new RegExp(String.raw`^(\s*)"${key}"\s*:\s*("(?:[^"\\]|\\.)*"|true|false|-?\d+(?:\.\d+)?)`, 'm');
  if (re.test(text)) return text.replace(re, (_m, indent) => `${indent}"${key}": ${v}`);
  const i = text.indexOf('{');
  if (i < 0) return `{\n  "${key}": ${v}\n}\n`;
  // 后面还有别的字段时补逗号（注释掉的不算）
  const rest = text.slice(i + 1);
  const hasMore = /"[^"]+"\s*:/.test(rest.replace(/\/\/.*$/gm, ''));
  return `${text.slice(0, i + 1)}\n  "${key}": ${v}${hasMore ? ',' : ''}${rest}`;
};

/**
 * 把一个开关写回 ~/.claude-pet/config.jsonc（右键菜单里的勾选项用）。
 * @param {string} key 字段名
 * @param {boolean|number} value 值
 */
export const saveUserValue = (key, value) => {
  const text = fs.existsSync(USER_CONFIG) ? fs.readFileSync(USER_CONFIG, 'utf8') : USER_TEMPLATE;
  fs.writeFileSync(USER_CONFIG, setJsoncValue(text, key, value));
};

/**
 * 可用的自定义 webm 动画：用户目录优先于项目 assets/webm。
 * @returns {Record<string, string>} 动作名 → file:// URL
 */
export const listWebm = () => {
  const out = {};
  for (const dir of [path.join(ROOT, 'assets', 'webm'), path.join(DATA_DIR, 'webm')]) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (f.toLowerCase().endsWith('.webm')) out[f.slice(0, -5)] = pathToFileURL(path.join(dir, f)).href;
    }
  }
  return out;
};
