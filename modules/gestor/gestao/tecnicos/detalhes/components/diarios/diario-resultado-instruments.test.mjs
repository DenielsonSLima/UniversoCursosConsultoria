import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const directory = path.dirname(fileURLToPath(import.meta.url));
const temporary = await mkdtemp(path.join(tmpdir(), 'diario-resultados-ui-'));
const output = path.join(temporary, 'render.cjs');
after(() => rm(temporary, { recursive: true, force: true }));

await build({
  stdin: {
    resolveDir: directory,
    contents: `
      import React from 'react';
      import { renderToStaticMarkup } from 'react-dom/server';
      import Resultado from './DiarioResultadoTab.tsx';
      import { DiarioDocumentaryProvider } from './historico/DiarioDocumentaryContext.tsx';
      export function render(activeInstruments, categories) {
        const student = { id: 'synthetic', nome: 'Aluno de teste' };
        const element = React.createElement(Resultado, {
          students: [student], localGrades: { synthetic: { p: 8, cq: 1 } },
          isReadOnly: false, activeInstruments,
          onToggleInstrument() {}, onGradeChange() {}, onSaveGrade() {},
          getStats: () => ({ mediaParcial: 9, mediaFinal: 9, faltas: 0,
            frequencia: 100, resultado: 'APROVADO' }),
        });
        if (!categories) return renderToStaticMarkup(element);
        const history = { lessons: [], students: [{ ...student, attendance: [],
          gradeRows: [{ sourceKey: 'synthetic-row', grades: categories.map((label, index) => ({
            columnOrdinal: index + 1, category: { raw: label, value: label },
            value: { raw: String(index + 1), value: index + 1 },
          })) }],
        }] };
        return renderToStaticMarkup(React.createElement(DiarioDocumentaryProvider, { history }, element));
      }
    `,
  },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  jsx: 'automatic',
  outfile: output,
});

const { render } = createRequire(import.meta.url)(output);
const onlyP = { p: true, ti: false, tg: false, s: false, cq: false, o: false };
const headers = (markup) => [...markup.matchAll(/<th\b([^>]*)>([\s\S]*?)<\/th>/g)].map((match) => ({
  attributes: match[1], text: match[2].replace(/<[^>]+>/g, '').replace(/[✓✕]/g, '').trim(),
}));
const table = (markup) => markup.match(/<table\b[\s\S]*?<\/table>/)?.[0] ?? '';

test('seleção de somente P gera uma subcoluna sob INSTRUMENTOS AVALIATIVOS', () => {
  const markup = render(onlyP);
  const cells = headers(markup);
  assert.match(cells.find((cell) => cell.text === 'INSTRUMENTOS AVALIATIVOS').attributes, /colSpan="1"/i);
  assert.deepEqual(cells.slice(-3).map((cell) => cell.text), ['P', 'FALTAS', '% PRES.']);
  assert.equal((table(markup).match(/<input\b/g) ?? []).length, 2, 'uma nota e recuperação');
  assert.doesNotMatch(table(markup), /\bP[12]\b/);
});

test('ativar CQ acompanha a seleção no cabeçalho e nas células de notas', () => {
  const markup = render({ ...onlyP, cq: true });
  const cells = headers(markup);
  assert.match(cells.find((cell) => cell.text === 'INSTRUMENTOS AVALIATIVOS').attributes, /colSpan="2"/i);
  assert.deepEqual(cells.slice(-4).map((cell) => cell.text), ['P', 'CQ', 'FALTAS', '% PRES.']);
  assert.equal((table(markup).match(/<input\b/g) ?? []).length, 3, 'duas notas e recuperação');
});

test('duas provas documentais preservam P e P sem inventar numeração no cabeçalho', () => {
  const markup = render(onlyP, ['P', 'P']);
  const cells = headers(markup);
  assert.match(cells.find((cell) => cell.text === 'INSTRUMENTOS AVALIATIVOS').attributes, /colSpan="2"/i);
  assert.deepEqual(cells.slice(-4).map((cell) => cell.text), ['P', 'P', 'FALTAS', '% PRES.']);
  assert.doesNotMatch(markup, /\bP[12]\b/);
  assert.equal((table(markup).match(/<input\b/g) ?? []).length, 1, 'somente recuperação; notas documentais são literais');
});
