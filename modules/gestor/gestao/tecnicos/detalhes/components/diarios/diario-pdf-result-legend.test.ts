import assert from 'node:assert/strict';
import { composeDiarioPdf } from './diario-pdf.ts';
import { createSnapshot, loadAssets, IDS } from './diario-pdf-server-boundary.fixtures.ts';
import { DIARIO_RESULT_LEGEND_TEXT, DIARIO_RESULT_LEGEND_TITLE } from './diario-print.utils.ts';
import { CONTENT_LEFT, STANDARD_CONTENT_TOP } from './diario-pdf-layout.ts';
import type { DiarioPdfRenderableData } from './diario-pdf.contract.ts';

declare const Deno: { test: (name: string, fn: () => Promise<void>) => void };

type Source = 'normal' | 'P P' | 'P TG CQ';
const assets = loadAssets();
const normalize = (text: string) => text.replace(/\s+/g, ' ').trim();
const nativeStrings = (commands: string) => [...commands.matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)]
  .map((match) => match[1].replace(/\\([\\()])/g, '$1'));

const createResults = (count: number, source: Source, blank: boolean): DiarioPdfRenderableData => {
  const props: DiarioPdfRenderableData = createSnapshot();
  const baseGrade = props.gradesMap[IDS.student];
  props.students = Array.from({ length: count }, (_, index) => ({
    id: `legend-student-${index}`, nome: `Aluno Legenda ${String(index + 1).padStart(2, '0')}`,
    matricula: `TESTE-${index + 1}`,
  }));
  props.gradesMap = {};
  props.attendanceMap = {};
  props.activeInstruments = { p: true, ti: false, tg: false, s: false, cq: true, o: false };
  props.exportMode = blank ? 'EM_BRANCO' : 'PREENCHIDO';
  const labels = source === 'P P' ? ['P', 'P'] : ['P', 'TG', 'CQ'];
  const values = source === 'P P' ? ['4,4', '5,0'] : ['6,5', '2,0', '1,0'];
  for (const student of props.students) {
    props.gradesMap[student.id] = {
      ...baseGrade, p: 6.5, cq: 1, media_parcial: 9.5, media_final: 9.5,
      ...(source === 'normal' ? {} : {
        instrumentos_documentais: [{ sourceKey: student.id, grades: labels.map((label, index) => ({
          columnOrdinal: index + 1, category: { raw: label }, value: { raw: values[index] },
        })) }],
      }),
    };
    props.attendanceMap[student.id] = { [IDS.session]: 'P' };
  }
  return props;
};

const textBaseline = (commands: string, label: string, pageHeight: number, scale: number) => {
  const block = [...commands.matchAll(/BT\n([\s\S]*?)\nET/g)]
    .map((match) => match[1]).find((value) => nativeStrings(value).includes(label));
  assert.ok(block, `Texto nativo ausente: ${label}`);
  const position = block.match(/([-\d.]+) ([-\d.]+) Td/);
  assert.ok(position, `Posição de texto ausente: ${label}`);
  return pageHeight - Number(position[2]) / scale;
};

for (const count of [36, 19, 18, 0]) {
  for (const source of ['normal', 'P P', 'P TG CQ'] as const) {
    for (const blank of [false, true]) {
      Deno.test(`legenda integral em cada página de resultados: ${count} alunos, ${source}, ${blank ? 'branco' : 'preenchido'}`, async () => {
        const props = createResults(count, source, blank);
        const before = JSON.stringify(props);
        const pdf = await composeDiarioPdf(props, await assets);
        const internal = pdf.internal as unknown as { pages: string[][]; scaleFactor: number };
        const pages = internal.pages.slice(1).map((page) => page.join('\n'))
          .filter((page) => /\(Resultados \d+\) Tj/.test(page));
        assert.equal(pages.length, Math.max(1, Math.ceil(count / 18)));
        assert.equal(JSON.stringify(props), before, 'Composição não pode alterar os dados acadêmicos');

        for (const [index, page] of pages.entries()) {
          const strings = nativeStrings(page);
          assert.equal(strings.filter((text) => text === DIARIO_RESULT_LEGEND_TITLE).length, 1,
            `Legenda deve estar na página de resultados ${index + 1}`);
          assert.ok(normalize(strings.join(' ')).includes(DIARIO_RESULT_LEGEND_TEXT),
            'Legenda completa deve ser texto PDF nativo, incluindo CQ, outros instrumentos e resultado');
          assert.ok(!page.includes('As avaliações registradas aparecem separadas'));

          const pageHeight = pdf.internal.pageSize.getHeight();
          const scale = internal.scaleFactor;
          const legendY = textBaseline(page, DIARIO_RESULT_LEGEND_TITLE, pageHeight, scale);
          const tableBottom = [...page.matchAll(/([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) re/g)]
            .map((match) => ({ x: Number(match[1]) / scale, top: pageHeight - Number(match[2]) / scale,
              height: -Number(match[4]) / scale }))
            .filter((rect) => Math.abs(rect.x - CONTENT_LEFT) < 0.01
              && rect.top >= STANDARD_CONTENT_TOP - 0.01 && rect.height > 0)
            .reduce((bottom, rect) => Math.max(bottom, rect.top + rect.height), 0);
          assert.ok(tableBottom > STANDARD_CONTENT_TOP, 'Tabela vetorial deve estar presente');
          assert.ok(legendY > tableBottom + 2, 'Legenda precisa ficar abaixo da tabela sem sobreposição');
          const footerY = textBaseline(page, `Resultados ${index + 1}`, pageHeight, scale);
          assert.ok(legendY + 10 < footerY, 'Legenda integral precisa caber antes do rodapé');

          if (count === 0) continue;
          const expectedLabels = source === 'normal' ? ['P', 'CQ'] : source.split(' ');
          for (const label of ['P', 'TI', 'TG', 'S', 'CQ', 'O']) {
            assert.equal(strings.filter((value) => value === label).length,
              expectedLabels.filter((value) => value === label).length,
              `Coluna ${label} deve preservar seleção/fonte, inclusive P repetido`);
          }
          assert.ok(!strings.includes('P1') && !strings.includes('P2'));
          if (blank) {
            for (const value of ['4,4', '5,0', '6,5', '9,5']) assert.ok(!strings.includes(value));
          } else {
            const studentsOnPage = Math.min(18, count - index * 18);
            assert.equal(strings.filter((value) => value === '9,5').length, studentsOnPage * 2,
              'Médias parcial e final devem preservar o valor fornecido, mesmo quando a soma difere');
            const expectedGrades = source === 'P P' ? ['4,4', '5,0'] : source === 'P TG CQ'
              ? ['6,5', '2,0', '1,0'] : ['6,5', '1,0'];
            for (const value of expectedGrades) assert.ok(strings.includes(value), `Nota preservada: ${value}`);
          }
        }
      });
    }
  }
}
