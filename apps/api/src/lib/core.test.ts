import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOutput, outputMatches, checkRules, fillTemplate, normalizeToken, stripCommentsAndStrings, choiceOrder, grade, publicExercise } from './grading.js';
import { sm2 } from './srs.js';
import { levelFromXp, weekKey, previousDay } from './levels.js';
import { parseDiagnostics, explainError } from './diagnostics.js';
import { computeLevel, nextLevel, startLevels } from '../routes/placement.js';

test('normalisation des sorties', () => {
  assert.equal(normalizeOutput('a  \r\nb\n\n'), 'a\nb');
  assert.ok(outputMatches('42\n', '42'));
  assert.ok(!outputMatches('42', '43'));
  assert.ok(outputMatches('Total', 'Le Total est 3', 'contains'));
  assert.ok(outputMatches('^\\d+$', '123', 'regex'));
});

test('règles de code ignorent commentaires et chaînes', () => {
  const code = 'fn main() { // for x in\n let s = "while"; loop { break; } }';
  assert.equal(stripCommentsAndStrings(code).includes('while'), false);
  const r = checkRules(code, [{ pattern: '\\bloop\\b', message: 'utiliser loop' }], [{ pattern: '\\bwhile\\b', message: 'pas de while' }]);
  assert.deepEqual(r.map((x) => x.passed), [true, true]);
});

test('remplissage des trous', () => {
  assert.equal(fillTemplate('let {{?}} x = {{?}};', ['mut', '5']), 'let mut x = 5;');
  assert.equal(normalizeToken(' Vec < i32 > '), 'Vec<i32>');
});

test('SM-2', () => {
  let s = { ease: 2.5, interval: 0, repetitions: 0, lapses: 0 };
  s = sm2(s, 5);
  assert.equal(s.interval, 1);
  s = sm2(s, 5);
  assert.equal(s.interval, 3);
  s = sm2(s, 4);
  assert.ok(s.interval >= 7);
  const f = sm2(s, 1);
  assert.equal(f.interval, 1);
  assert.equal(f.repetitions, 0);
  assert.equal(f.lapses, 1);
});

test('niveaux XP et dates', () => {
  assert.equal(levelFromXp(0).level, 1);
  assert.equal(levelFromXp(50).level, 2);
  assert.equal(levelFromXp(199).level, 2);
  assert.equal(levelFromXp(200).level, 3);
  assert.equal(previousDay('2026-03-01'), '2026-02-28');
  assert.match(weekKey(new Date('2026-11-20T10:00:00Z')), /^2026-W47$/);
});

test('placement adaptatif', () => {
  assert.equal(nextLevel(2, [{ correct: true }, { correct: true }, { correct: false }]), 3);
  assert.equal(computeLevel([]), 1);
  assert.equal(
    computeLevel([
      { level: 2, correct: true },
      { level: 3, correct: true },
      { level: 4, correct: false },
      { level: 3, correct: true },
      { level: 4, correct: false },
    ]),
    3,
  );
  const s = startLevels({ programmed: 2, languages: [1], duration: 3, variables: true, conditions: true, loops: true, functions: true, oop: true });
  assert.ok(s.cpp > s.rust);
});

test('diagnostics compilateur', () => {
  const rust = 'error[E0382]: borrow of moved value: `s`\n --> main.rs:5:20\n  |';
  const d = parseDiagnostics('rust', rust);
  assert.equal(d[0].line, 5);
  assert.equal(d[0].code, 'E0382');
  assert.equal(explainError('rust', rust)[0].title, 'Valeur déplacée (move)');
  assert.equal(parseDiagnostics('cpp', "main.cpp:3:5: error: 'x' was not declared in this scope")[0].line, 3);
  assert.equal(parseDiagnostics('java', "Main.java:4: error: ';' expected")[0].line, 4);
  assert.equal(explainError('java', '', 137)[0].title, 'Délai dépassé');
});

test('QCM : choix mélangés et correction cohérente', async () => {
  const ex = {
    id: 'demo-qcm', kind: 'practice', type: 'mcq', language: 'rust', title: null, prompt: '?', difficulty: 1, level: 1, concepts: [], xp: 10, hints: [],
    content: { choices: ['bonne', 'b', 'c', 'd'], multiple: false },
    solution: { answer: 0, explanation: '' },
  } as any;
  const perm = choiceOrder(ex);
  assert.deepEqual([...perm].sort(), [0, 1, 2, 3]);
  const affiches = (publicExercise(ex) as any).choices as string[];
  const position = affiches.indexOf('bonne');
  assert.notEqual(position, 0, 'la bonne réponse ne reste pas en tête');
  assert.equal((await grade(ex, { choice: position }, 'rust')).correct, true);
  assert.equal((await grade(ex, { choice: (position + 1) % 4 }, 'rust')).correct, false);
  assert.equal((await grade(ex, { choice: position }, 'rust')).reveal?.answer, position);
});
