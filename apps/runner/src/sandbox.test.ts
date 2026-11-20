import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseProtocol, dockerArgs } from './sandbox.js';
import { LANGUAGES } from './languages.js';

const b64 = (s: string) => Buffer.from(s).toString('base64');

test('parseProtocol décode compilation et tests', () => {
  const out = [
    '@@CM COMPILE 0 120', b64(''), b64('warning'),
    '@@CM TEST 2 0 5', b64('b\n'), b64(''),
    '@@CM TEST 1 137 5000', b64(''), b64(''),
    '@@CM END', '',
  ].join('\n');
  const r = parseProtocol(out);
  assert.equal(r.compile.ok, true);
  assert.equal(r.compile.stderr, 'warning');
  assert.equal(r.tests.length, 2);
  assert.equal(r.tests[0].index, 0);
  assert.equal(r.tests[0].timedOut, true);
  assert.equal(r.tests[1].stdout, 'b\n');
});

test('parseProtocol signale une réponse invalide', () => {
  assert.ok(parseProtocol('garbage').error);
});

test('dockerArgs impose isolation réseau et limites', () => {
  const a = dockerArgs(LANGUAGES.rust, 'x');
  for (const flag of ['--network', '--read-only', '--cap-drop', '--memory', '--pids-limit', '--security-opt']) {
    assert.ok(a.includes(flag), flag);
  }
  assert.equal(a[a.indexOf('--network') + 1], 'none');
  assert.ok(!a.includes('--privileged'));
});
