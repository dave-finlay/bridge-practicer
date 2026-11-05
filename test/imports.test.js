// js/app.js needs a browser, so the tests can't load it, and a wrong name
// in one of its imports only shows up as a blank page on the phone. Here
// every named import in js/ and scripts/ is read as text and looked up in
// the module it comes from.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const sources = ['js', 'scripts'].flatMap((dir) =>
  readdirSync(new URL(dir, root)).filter((f) => /\.m?js$/.test(f)).map((f) => `${dir}/${f}`));

// `import { a, b as c } from './x.js'`: the module path and the names it
// must export (a and b).
function namedImports(text) {
  return [...text.matchAll(/^import\s*\{([^}]*)\}\s*from\s*'(\.{1,2}\/[^']+)'/gm)].map(([, names, from]) => ({
    from,
    names: names.split(',').map((name) => name.trim().split(/\s+as\s+/)[0]).filter(Boolean),
  }));
}

test('every named import exists in the module it comes from', async () => {
  let checked = 0;
  for (const source of sources) {
    for (const { from, names } of namedImports(readFileSync(new URL(source, root), 'utf8'))) {
      const module = await import(new URL(from, new URL(source, root)));
      for (const name of names) {
        assert.ok(name in module, `${source} imports ${name}, but ${from} doesn't export it`);
        checked++;
      }
    }
  }
  assert.ok(checked > 50, `only ${checked} imports found: is the pattern still matching?`);
});
