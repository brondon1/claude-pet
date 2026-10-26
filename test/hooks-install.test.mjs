import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withPetHooks, withoutPetHooks, EVENTS } from '../src/main/hooks-install.js';

const CMD = 'node "/x/hooks/claude-pet-hook.mjs"';
const userHook = { matcher: 'Bash', hooks: [{ type: 'command', command: 'echo mine' }] };

test('install adds every event once and keeps user hooks and other settings', () => {
  const before = { model: 'opus', hooks: { PreToolUse: [userHook] } };
  const once = withPetHooks(before, CMD);
  const twice = withPetHooks(once, CMD);
  assert.deepEqual(twice, once, 'install must be idempotent');
  assert.equal(once.model, 'opus');
  for (const ev of EVENTS) assert.ok(once.hooks[ev].some((g) => g.hooks.some((h) => h.command === CMD)), ev);
  assert.deepEqual(once.hooks.PreToolUse[0], userHook);
  assert.equal(once.hooks.PreToolUse[1].matcher, '*');
  assert.equal(once.hooks.Stop[0].matcher, undefined);
  assert.deepEqual(before.hooks.PreToolUse, [userHook], 'input not mutated');
});

test('uninstall restores the original settings', () => {
  const before = { model: 'opus', hooks: { PreToolUse: [userHook] } };
  assert.deepEqual(withoutPetHooks(withPetHooks(before, CMD)), before);
  assert.deepEqual(withoutPetHooks(withPetHooks({ a: 1 }, CMD)), { a: 1 });
});
