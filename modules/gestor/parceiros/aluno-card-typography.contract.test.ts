import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const cardSource = await readFile(
  new URL('./components/cards/AlunoCard.tsx', import.meta.url),
  'utf8',
);

test('nome do aluno preserva identidade e permite quebra sem ocultar conteúdo', () => {
  const headingStart = cardSource.indexOf('<h3 className=');
  const headingEnd = cardSource.indexOf('</h3>', headingStart);
  const heading = cardSource.slice(headingStart, headingEnd);

  assert.ok(headingStart >= 0, 'título do aluno ausente no card');
  assert.match(heading, /\{displayName\}/);
  assert.match(heading, /title=\{displayName\}/);
  assert.match(heading, /break-words/);
  assert.doesNotMatch(heading, /line-clamp|truncate/);
});
