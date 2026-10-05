import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getAlunoViewportHeight } from './aluno-viewport-height.ts';

test('pinch zoom preserva altura de layout e não simula teclado', () => {
  const baseline = getAlunoViewportHeight(800, 1, 800);
  for (const scale of [1.25, 1.5, 2, 3]) {
    assert.equal(getAlunoViewportHeight(800 / scale, scale, 800), baseline);
  }
});

test('abertura do teclado reduz altura mesmo quando o aluno ampliou a página', () => {
  assert.equal(getAlunoViewportHeight(250, 2, 800), 500);
  assert.equal(getAlunoViewportHeight(500, 1, 800), 500);
});

test('rotação usa a nova altura e dispositivos sem visualViewport usam innerHeight', () => {
  assert.equal(getAlunoViewportHeight(390, 1, 390), 390);
  assert.equal(getAlunoViewportHeight(undefined, undefined, 700), 700);
  assert.equal(getAlunoViewportHeight(0, 1, 700), 700);
  assert.equal(getAlunoViewportHeight(NaN, 1, 700), 700);
  assert.equal(getAlunoViewportHeight(700, undefined, 700), 700);
});
