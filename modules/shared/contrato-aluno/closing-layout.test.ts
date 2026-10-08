import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseContratoAlunoClosingLayout } from './closing-layout.ts';

const closing = (witnesses: string) => [
  'Cidade de teste, 7 de outubro de 2026.',
  'CONTRATANTE: Responsável de teste',
  'CONTRATADA: Instituição de teste',
  witnesses,
].join('\n');

test('numbered witness placeholders produce empty signature lines', () => {
  for (const lines of [
    'TESTEMUNHAS:\n1: __________________\n2: __________________',
    'TESTEMUNHAS: 1: __________________\n2: __________________',
    'TESTEMUNHAS:\n1: ------------------\n2: —————————',
    'TESTEMUNHAS:\n1:\n2:',
  ]) {
    assert.deepEqual(parseContratoAlunoClosingLayout(closing(lines)).witnesses, [
      { label: 'TESTEMUNHA 1', value: '' },
      { label: 'TESTEMUNHA 2', value: '' },
    ]);
  }
});

test('witness names and formatted documents are preserved after the ordinal', () => {
  const layout = parseContratoAlunoClosingLayout(closing([
    'TESTEMUNHAS:',
    '1: Ana-Clara de Teste — CPF: 000.000.000-00',
    '2: João de Teste – CPF: 111.111.111-11',
  ].join('\n')));
  assert.deepEqual(layout.witnesses, [
    { label: 'TESTEMUNHA 1', value: 'Ana-Clara de Teste — CPF: 000.000.000-00' },
    { label: 'TESTEMUNHA 2', value: 'João de Teste – CPF: 111.111.111-11' },
  ]);
});

test('unnumbered witnesses and custom free text retain their content', () => {
  const content = 'Maria-de-Teste, CPF: 000.000.000-00';
  assert.equal(parseContratoAlunoClosingLayout(closing(`TESTEMUNHAS:\n${content}`)).witnesses[0].value, content);
  const freeText = 'Encerramento personalizado\n1: texto livre\n2: outro texto';
  assert.equal(parseContratoAlunoClosingLayout(freeText).fallbackText, freeText);
});

test('location and contracting parties are unaffected by witness normalization', () => {
  const layout = parseContratoAlunoClosingLayout(closing('TESTEMUNHAS:\n1: ____\n2: ____'));
  assert.equal(layout.location, 'Cidade de teste, 7 de outubro de 2026.');
  assert.deepEqual(layout.parties, [
    { label: 'CONTRATANTE', value: 'Responsável de teste' },
    { label: 'CONTRATADA', value: 'Instituição de teste' },
  ]);
});
