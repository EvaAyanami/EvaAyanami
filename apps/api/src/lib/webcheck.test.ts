import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCss, runWebChecks } from './webcheck.js';

test('analyse CSS avec @media', () => {
  const r = parseCss('h1{color:red} /* c */ @media (max-width: 600px) { .a, p { margin: 0 } }');
  assert.equal(r.length, 2);
  assert.deepEqual(r[1].selectors, ['.a', 'p']);
});

test('vérifications HTML/CSS', () => {
  const html = `<!doctype html><html lang="fr"><head><style>
    .titre { color: #FF0000; font-size: 2rem }
    ul li { list-style: none }
  </style></head><body><h1 class="titre">Bonjour  Kiri</h1><img src="a.png" alt="Kiri"><ul><li>a</li><li>b</li><li>c</li></ul>
  <p style="text-align: center">x</p></body></html>`;
  const r = runWebChecks(html, [
    { type: 'doctype', message: 'doctype' },
    { type: 'lang', value: 'fr', message: 'lang' },
    { type: 'text', selector: 'h1', contains: 'bonjour kiri', message: 'texte' },
    { type: 'count', selector: 'li', min: 3, message: '3 li' },
    { type: 'attr', selector: 'img', name: 'alt', value: '*', message: 'alt' },
    { type: 'css', selector: 'h1', property: 'color', value: '#ff0000', message: 'couleur via classe' },
    { type: 'css', selector: 'li', property: 'list-style', value: 'none', message: 'descendant' },
    { type: 'css', selector: 'p', property: 'text-align', value: 'center', message: 'inline' },
    { type: 'absent', selector: 'table', message: 'pas de table' },
    { type: 'css', selector: 'h1', property: 'font-size', value: '/rem$/', message: 'regex' },
  ]);
  assert.deepEqual(r.filter((x) => !x.passed).map((x) => x.message), []);
  const bad = runWebChecks('<h1>Salut</h1>', [{ type: 'css', selector: 'h1', property: 'color', message: 'couleur' }, { type: 'doctype', message: 'doctype' }]);
  assert.equal(bad.filter((x) => x.passed).length, 0);
});
