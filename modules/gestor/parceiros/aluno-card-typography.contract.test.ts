import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const cardSource = await readFile(
  new URL('./components/cards/AlunoCard.tsx', import.meta.url),
  'utf8',
);

test('nome do aluno usa tipografia compacta sem perder peso ou truncamento', () => {
  const headingStart = cardSource.indexOf('<h3 className=');
  const headingEnd = cardSource.indexOf('</h3>', headingStart);
  const heading = cardSource.slice(headingStart, headingEnd);

  assert.ok(headingStart >= 0, 'título do aluno ausente no card');
  assert.match(heading, /line-clamp-1/);
  assert.match(heading, /text-\[11px\]/);
  assert.match(heading, /font-extrabold/);
  assert.match(heading, /text-slate-950/);
  assert.match(heading, /antialiased/);
  assert.doesNotMatch(heading, /text-\[13px\]/);
});
