import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { resolveClaudeCli, windowsCmdLine, spawnClaude } from '../src/main/claude-cli.js';

const winEnv = (pathVar, extra = {}) => ({
  PATH: pathVar,
  USERPROFILE: 'C:\\Users\\me',
  APPDATA: 'C:\\Users\\me\\AppData\\Roaming',
  ...extra,
});

const at = (...parts) => path.join(...parts);

test('非 Windows 直接用 PATH 里的 claude', () => {
  assert.equal(resolveClaudeCli({ platform: 'linux', env: {} }), 'claude');
});

test('CLAUDE_PET_CLAUDE 指定的路径优先', () => {
  const cli = at('D:', 'tools', 'claude.exe');
  const got = resolveClaudeCli({ platform: 'win32', env: winEnv('C:\\bin', { CLAUDE_PET_CLAUDE: cli }), exists: (p) => p === cli });
  assert.equal(got, cli);
});

test('Windows 上 PATH 里的 claude.exe 可用', () => {
  const cli = at('C:\\bin', 'claude.exe');
  const got = resolveClaudeCli({ platform: 'win32', env: winEnv('C:\\bin'), exists: (p) => p === cli });
  assert.equal(got, cli);
});

test('没有 claude.exe 时回退到 npm 的 claude.cmd', () => {
  const cli = at('C:\\Users\\me\\AppData\\Roaming\\npm', 'claude.cmd');
  const got = resolveClaudeCli({
    platform: 'win32',
    env: winEnv('C:\\Windows'),
    exists: (p) => p === cli,
  });
  assert.equal(got, cli);
});

test('同一个目录同时存在时优先 claude.exe', () => {
  const dir = 'C:\\bin';
  const got = resolveClaudeCli({
    platform: 'win32',
    env: winEnv(dir),
    exists: (p) => p === at(dir, 'claude.exe') || p === at(dir, 'claude.cmd'),
  });
  assert.equal(got, at(dir, 'claude.exe'));
});

test('PATH 里没有时搜索常见安装目录', () => {
  const cli = at('C:\\Users\\me', '.local', 'bin', 'claude.exe');
  const got = resolveClaudeCli({ platform: 'win32', env: winEnv('C:\\Windows'), exists: (p) => p === cli });
  assert.equal(got, cli);
});

test('哪里都找不到时返回 null', () => {
  assert.equal(resolveClaudeCli({ platform: 'win32', env: winEnv('C:\\Windows'), exists: () => false }), null);
});

test('cmd 命令行给带空格和空的参数正确加引号', () => {
  const line = windowsCmdLine('C:\\Program Files\\claude.cmd', [
    '-p',
    '--system-prompt-file',
    'C:\\tmp\\a b.txt',
    '--tools',
    '',
  ]);
  assert.equal(
    line,
    '"' + '"C:\\Program Files\\claude.cmd"' + ' "-p" "--system-prompt-file" "C:\\tmp\\a b.txt" "--tools" ""' + '"',
  );
});

test('启动 claude.cmd 时经 cmd.exe 且保留 verbatim 参数', () => {
  const calls = [];
  const spawnFn = (file, args, opts) => {
    calls.push({ file, args, opts });
    return {};
  };
  spawnClaude(['-p', 'x y'], {
    platform: 'win32',
    cli: 'C:\\tools\\claude.cmd',
    env: { ComSpec: 'cmd.exe' },
    spawnFn,
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].file, 'cmd.exe');
  assert.deepEqual(calls[0].args.slice(0, 3), ['/d', '/s', '/c']);
  assert.match(calls[0].args[3], /^""C:\\tools\\claude\.cmd" "-p" "x y""$/);
  assert.equal(calls[0].opts.windowsVerbatimArguments, true);
});

test('启动 claude.exe 时直接 spawn', () => {
  const calls = [];
  const spawnFn = (file, args) => {
    calls.push({ file, args });
    return {};
  };
  spawnClaude(['-p'], { platform: 'win32', cli: 'C:\\tools\\claude.exe', spawnFn });
  assert.equal(calls[0].file, 'C:\\tools\\claude.exe');
  assert.deepEqual(calls[0].args, ['-p']);
});

test('找不到 CLI 时抛出可读错误', () => {
  assert.throws(
    () =>
      spawnClaude(['-p'], {
        platform: 'win32',
        env: winEnv('C:\\Windows'),
        spawnFn: () => ({}),
      }),
    (e) => e.code === 'ENOCLI' && /找不到 Claude Code CLI/.test(e.message),
  );
});
