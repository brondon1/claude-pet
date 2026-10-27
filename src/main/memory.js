/**
 * 记忆链的读写与整理（主进程）。所有宠物共用一份——她们了解的是同一个主人。
 * 文件：~/.claude-pet/memory-chain.json（纯逻辑见 src/shared/memory-chain.js）。
 * @module claude-pet/src/main/memory
 */
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './config.js';
import { emptyChain, observe, shouldConsolidate, activityDigest, consolidatePrompt, applyConsolidation, memoryBlock } from '../shared/memory-chain.js';

export const CHAIN_FILE = path.join(DATA_DIR, 'memory-chain.json');

let chain = null;
let busy = false;

const load = () => {
  if (chain) return chain;
  try {
    chain = { ...emptyChain(), ...JSON.parse(fs.readFileSync(CHAIN_FILE, 'utf8')) };
  } catch {
    chain = emptyChain();
  }
  return chain;
};

const save = () => {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CHAIN_FILE, JSON.stringify(chain, null, 2));
};

/** 当前记忆条目。 */
export const memoryItems = () => load().items;

/** 记忆链（整理历史）。 */
export const memoryLinks = () => load().links;

/** 拼进系统提示词的记忆段落；关掉记忆时为空。 */
export const memoryPrompt = (cfg) => (cfg?.enabled === false ? '' : memoryBlock(load().items, cfg?.promptItems ?? 20));

/**
 * 记一条观察。
 * @param {any} cfg config.memory
 * @param {{t: string, p?: string, s?: string}} ev
 */
export const recordObservation = (cfg, ev) => {
  if (cfg?.enabled === false) return;
  chain = observe(load(), ev, new Date(), cfg?.maxLog ?? 400);
  save();
};

/** 忘掉一切（记忆条目、链、观察记录）。 */
export const forgetAll = () => {
  chain = emptyChain();
  fs.rmSync(CHAIN_FILE, { force: true });
};

/**
 * 攒够了就让 Claude Code 整理一次记忆；同一时间只跑一次。
 * @param {any} cfg config.memory
 * @param {{askCli: (messages: any[], system?: string) => Promise<string>}} brain 用谁的脑子整理
 * @param {{name: string, force?: boolean, onDone?: (r: {added: string[], removed: string[], note: string}) => void}} o
 * @returns {Promise<{added: string[], removed: string[], note: string} | null>}
 */
export const maybeConsolidate = async (cfg, brain, { name, force = false, onDone } = {}) => {
  if (cfg?.enabled === false || busy) return null;
  const c = load();
  if (!force && !shouldConsolidate(c, new Date(), cfg)) return null;
  if (!c.log.length) return null;
  busy = true;
  try {
    const maxItems = cfg?.maxItems ?? 30;
    const prompt = consolidatePrompt(c, activityDigest(c.log), { name, maxItems });
    const system = '你是一个细心的记忆整理助手，只输出要求的 JSON。';
    const raw = await brain.askCli([{ role: 'user', content: prompt }], system);
    // 整理期间可能又记了新观察：只清掉参与这次整理的那些
    const r = applyConsolidation(c, raw, new Date(), { maxItems });
    const fresh = load().log.slice(c.log.length);
    chain = { ...r.chain, log: fresh, pending: fresh.length };
    save();
    console.log(`[claude-pet] 记忆链 +1：新增 ${r.added.length}、忘掉 ${r.removed.length}、共 ${chain.items.length} 条`);
    onDone?.(r);
    return r;
  } catch (e) {
    if (e.code !== 'LIMIT') console.warn('[claude-pet] 整理记忆失败：', e.message);
    return null;
  } finally {
    busy = false;
  }
};
