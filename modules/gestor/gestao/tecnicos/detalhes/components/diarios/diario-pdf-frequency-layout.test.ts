import assert from 'node:assert/strict';
import { composeDiarioPdfWithManifest } from './diario-pdf.ts';
import { createSnapshot, loadAssets, IDS } from './diario-pdf-server-boundary.fixtures.ts';
import { CONTENT_LEFT, STANDARD_CONTENT_TOP } from './diario-pdf-layout.ts';
import type { DiarioPdfSessionSnapshot } from './diario-pdf.contract.ts';

declare const Deno: { test: (name: string, fn: () => Promise<void>) => void };

const uuid = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const dates = ['2026-06-06', '2026-06-13', '2026-06-20', '2026-07-04', '2026-07-11', '2026-07-18', '2026-07-25'];
const nativeStrings = (commands: string) => [...commands.matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)]
  .map((match) => match[1].replace(/\\([\\()])/g, '$1'));

const frequencySnapshot = (periods: DiarioPdfSessionSnapshot['periodo'][][], studentCount = 1) => {
  const snapshot = createSnapshot();
  const baseGrade = snapshot.gradesMap[IDS.student];
  snapshot.aulas = periods.map((meeting, index) => ({
    id: uuid(100 + index), titulo: `Conteudo ${index + 1}`, dataSource: dates[index],
    cargaHoraria: meeting.length * 4,
    sessoes: meeting.map((periodo, sessionIndex) => ({
      id: uuid(200 + index * 10 + sessionIndex), periodo, cargaHoraria: 4,
    })),
  }));
  const sessions = snapshot.aulas.flatMap((lesson) => lesson.sessoes);
  const hours = sessions.length * 4;
  snapshot.disciplina.cargaHoraria = hours;
  snapshot.closure.hoursCompleted = hours;
  snapshot.closure.requiredHours = hours;
  snapshot.praticasMap = Object.fromEntries(snapshot.aulas.map((lesson) => [lesson.id, 'Pratica sintetica']));
  snapshot.students = Array.from({ length: studentCount }, (_, index) => ({
    id: uuid(300 + index),
    nome: `ALUNO DE TESTE NOME COMPOSTO EXTENSO DO NASCIMENTO ${String(index + 1).padStart(2, '0')}`,
    matricula: `QA-2026-${String(index + 1).padStart(2, '0')}`,
  }));
  snapshot.gradesMap = {};
  snapshot.attendanceMap = {};
  snapshot.students.forEach((student) => {
    snapshot.gradesMap[student.id] = { ...baseGrade, total_aulas: sessions.length };
    snapshot.attendanceMap[student.id] = Object.fromEntries(sessions.map((session) => [session.id, 'P' as const]));
  });
  return snapshot;
};

const frequencyPages = (pdf: Awaited<ReturnType<typeof composeDiarioPdfWithManifest>>['pdf']) => (
  pdf.internal as unknown as { pages: string[][] }
).pages.slice(1).map((page) => page.join('\n')).filter((page) => /\(Frequência \d+\.\d+\) Tj/.test(page));

Deno.test('seis datas M/T ficam no mesmo bloco com nomes, matriculas e larguras fixas', async () => {
  const snapshot = frequencySnapshot(Array.from({ length: 6 }, () => ['M', 'T']), 20);
  const before = JSON.stringify(snapshot);
  const built = await composeDiarioPdfWithManifest(snapshot, await loadAssets());
  const pages = frequencyPages(built.pdf);
  assert.equal(pages.length, 2, 'Somente a continuacao dos 20 alunos pode criar uma segunda folha');
  assert.equal(JSON.stringify(snapshot), before, 'O compositor nao pode alterar o snapshot');

  for (const [index, page] of pages.entries()) {
    const strings = nativeStrings(page);
    assert.ok(strings.includes(`Frequência 1.${index + 1}`));
    for (const date of ['06/06', '13/06', '20/06', '04/07', '11/07', '18/07']) {
      assert.equal(strings.filter((value) => value === date).length, 1);
    }
    assert.equal(strings.filter((value) => value === 'M').length, 6);
    assert.equal(strings.filter((value) => value === 'T').length, 6);
    const students = snapshot.students.slice(index * 14, (index + 1) * 14);
    for (const student of students) {
      assert.ok(strings.includes(student.nome), `Nome integral ausente: ${student.nome}`);
      assert.ok(strings.includes(`(${student.matricula})`));
    }
    assert.equal(strings.filter((value) => value === 'P').length, students.length * 12);

    const internal = built.pdf.internal as unknown as { scaleFactor: number };
    const height = built.pdf.internal.pageSize.getHeight();
    const rectangles = [...page.matchAll(/([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) re/g)].map((match) => ({
      x: Number(match[1]) / internal.scaleFactor,
      y: height - Number(match[2]) / internal.scaleFactor,
      width: Number(match[3]) / internal.scaleFactor,
      height: -Number(match[4]) / internal.scaleFactor,
    }));
    const header = rectangles.filter((rectangle) => Math.abs(rectangle.y - STANDARD_CONTENT_TOP) < 0.01);
    const studentCell = header.find((rectangle) => Math.abs(rectangle.x - CONTENT_LEFT - 8) < 0.01);
    assert.ok(studentCell && Math.abs(studentCell.width - 84) < 0.01);
    assert.equal(header.filter((rectangle) => Math.abs(rectangle.width - 28) < 0.01).length, 6);
  }
});

Deno.test('frequencia continua encontros inteiros e conserva todos os periodos apos doze sessoes', async () => {
  const assets = await loadAssets();
  for (const periods of [
    Array.from({ length: 7 }, () => ['M', 'T'] as const),
    [['M', 'T', 'N'], ['U'], ['M', 'T', 'N'], ['M', 'T', 'N'], ['M', 'T', 'N']] as const,
  ]) {
    const snapshot = frequencySnapshot(periods.map((meeting) => [...meeting]));
    const pages = frequencyPages((await composeDiarioPdfWithManifest(snapshot, assets)).pdf);
    assert.equal(pages.length, 2);
    const strings = pages.map(nativeStrings);
    periods.forEach((meeting, index) => {
      const date = `${dates[index].slice(8)}/${dates[index].slice(5, 7)}`;
      assert.equal(strings.flat().filter((value) => value === date).length, 1, 'Encontro nao pode se dividir');
      const page = strings.find((values) => values.includes(date));
      assert.ok(page);
      assert.ok(meeting.every((period) => page.includes(period === 'U' ? 'ÚNICA' : period)));
    });
    assert.equal(strings.flat().filter((value) => value === 'P').length, periods.flat().length);
    for (const period of ['M', 'T', 'N', 'U']) {
      assert.equal(strings.flat().filter((value) => value === (period === 'U' ? 'ÚNICA' : period)).length,
        periods.flat().filter((value) => value === period).length);
    }
  }
});
