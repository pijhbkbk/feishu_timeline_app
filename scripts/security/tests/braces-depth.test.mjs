import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const projectRequire = createRequire(new URL('../../../package.json', import.meta.url));
const nextRequire = createRequire(projectRequire.resolve('@next/eslint-plugin-next'));
const globRequire = createRequire(nextRequire.resolve('fast-glob'));
const matchRequire = createRequire(globRequire.resolve('micromatch'));
const braces = matchRequire('braces');
const maximumDepth = error => error instanceof SyntaxError && /maximum depth \(128\)/.test(error.message);

test('patched braces preserves normal alternatives, ranges, escaping and parentheses', () => {
  assert.deepEqual(braces.expand('src/{api,web}/{a,b}.ts'), ['src/api/a.ts', 'src/api/b.ts', 'src/web/a.ts', 'src/web/b.ts']);
  assert.deepEqual(braces.expand('{1..3}'), ['1', '2', '3']);
  assert.equal(braces.compile('src/{a,b}.ts'), 'src/(a|b).ts');
  assert.equal(braces.stringify(braces.parse('a/{b,c}/d')), 'a/{b,c}/d');
  assert.deepEqual(braces.expand('\\{a,b\\}'), ['{a,b}']);
  assert.equal(braces.compile('(' + '{a,b}' + ')'), '((a|b))');
  assert.doesNotThrow(() => braces.compile('{'.repeat(32) + 'a,b' + '}'.repeat(32)));
  // Escaped and quoted delimiters do not create recursive AST nodes.
  assert.doesNotThrow(() => braces.compile('\\{'.repeat(1024)));
  assert.doesNotThrow(() => braces.compile('"' + '{'.repeat(1024) + '"'));
});

test('deep balanced and unterminated input fails with bounded syntax error instead of stack exhaustion', () => {
  for (const depth of [256, 2048, 4096, 4999]) {
    for (const [open, close] of [['{', '}'], ['(', ')']]) {
      for (const pattern of [open.repeat(depth) + 'a' + close.repeat(depth), open.repeat(depth)]) {
        for (const operation of ['parse', 'compile', 'expand', 'stringify']) {
          assert.throws(() => braces[operation](pattern), maximumDepth);
        }
      }
    }
  }
});

test('direct AST callers cannot bypass the recursive consumer depth bound', () => {
  const makeAst = () => {
    const ast = { type: 'root', nodes: [] };
    let parent = ast;
    for (let index = 0; index < 4096; index++) {
      const child = { type: 'paren', nodes: [], parent };
      parent.nodes.push(child);
      parent = child;
    }
    parent.nodes.push({ type: 'text', value: 'a', parent });
    return ast;
  };
  for (const operation of ['compile', 'expand', 'stringify']) {
    assert.throws(() => braces[operation](makeAst()), maximumDepth);
  }
});
