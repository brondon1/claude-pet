/**
 * 本机 HTTP 接口（只监听 127.0.0.1，无鉴权）：Claude Code hooks 与第三方脚本都从这里驱动宠物。
 * 动作类接口只回 {ok}，数据统一从 GET /state 读。
 * @module claude-pet/src/main/server
 */
import http from 'node:http';

const MAX_BODY = 256 * 1024;

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('body too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('invalid JSON'));
      }
    });
    req.on('error', reject);
  });

/**
 * 启动接口服务。
 * @param {number} port 端口
 * @param {{
 *   hook: (p: any) => void,
 *   say: (text: string, ttl?: number, pet?: string) => void,
 *   play: (action: string, pet?: string) => boolean,
 *   chat: (text: string, pet?: string) => Promise<string>,
 *   rename: (name: string, pet?: string) => boolean,
 *   throw: (vx: number, vy: number, pet?: string) => boolean,
 *   openSettings: () => void,
 *   state: (pet?: string) => any,
 * }} h 处理函数
 * @returns {http.Server} 服务实例
 */
export const startServer = (port, h) => {
  const server = http.createServer(async (req, res) => {
    const send = (code, obj) => {
      res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(obj));
    };
    try {
      const url = new URL(req.url, 'http://localhost');
      const route = `${req.method} ${url.pathname}`;
      if (route === 'GET /health') return send(200, { ok: true, app: 'claude-pet' });
      // 多开时用 ?pet=<id>（或 body.pet）指定哪只宠物，不指定就是第一只
      const qpet = url.searchParams.get('pet') || undefined;
      if (route === 'GET /state') return send(200, h.state(qpet));
      if (route === 'GET /memory') return send(200, h.memory());
      if (req.method !== 'POST') return send(404, { ok: false, error: 'not found' });
      const body = await readBody(req);
      const pet = body.pet || qpet;
      switch (url.pathname) {
        case '/hook':
          h.hook(body);
          return send(200, { ok: true });
        case '/say':
          if (!body.text) return send(400, { ok: false, error: 'text required' });
          h.say(String(body.text), body.ttl, pet);
          return send(200, { ok: true });
        case '/play':
          return h.play(String(body.action), pet) ? send(200, { ok: true }) : send(400, { ok: false, error: 'unknown action' });
        case '/chat':
          if (!body.text) return send(400, { ok: false, error: 'text required' });
          return send(200, { ok: true, reply: await h.chat(String(body.text), pet) });
        case '/settings':
          h.openSettings();
          return send(200, { ok: true });
        case '/throw':
          return send(200, { ok: h.throw(Number(body.vx) || 0, Number(body.vy) || 0, pet) });
        case '/edge':
          return send(200, { ok: h.edge(body.side ?? null, pet) });
        case '/memory/consolidate':
          return send(200, { ok: true, result: await h.consolidate() });
        case '/rename':
          if (!body.name) return send(400, { ok: false, error: 'name required' });
          return send(200, { ok: h.rename(String(body.name), pet) });
        default:
          return send(404, { ok: false, error: 'not found' });
      }
    } catch (e) {
      send(500, { ok: false, error: e.message });
    }
  });
  server.on('error', (e) => console.error(`[claude-pet] HTTP 接口启动失败（端口 ${port}）：${e.message}`));
  server.listen(port, '127.0.0.1');
  return server;
};
