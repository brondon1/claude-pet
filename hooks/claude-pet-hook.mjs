#!/usr/bin/env node
/**
 * Claude Code hook → claude-pet。
 * 从 stdin 读 hook JSON，转发到本机 POST /hook。无论成败都静默退出 0，绝不阻塞或干扰 Claude Code。
 * 宠物自己调用 claude CLI 时带 CLAUDE_PET_INTERNAL=1，这里直接忽略，避免宠物对自己的对话做出反应。
 */
if (process.env.CLAUDE_PET_INTERNAL) process.exit(0);

// 端口：命令行参数（安装时按配置写入）> 环境变量 > 默认
const port = Number(process.argv[2]) || Number(process.env.CLAUDE_PET_PORT) || 7341;
const chunks = [];
const done = () => process.exit(0);
setTimeout(done, 1500).unref();

process.stdin.on('data', (c) => chunks.push(c));
process.stdin.on('end', async () => {
  try {
    await fetch(`http://127.0.0.1:${port}/hook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: Buffer.concat(chunks).toString('utf8') || '{}',
      signal: AbortSignal.timeout(1000),
    });
  } catch {
    // 宠物没开着就算了
  }
  done();
});
