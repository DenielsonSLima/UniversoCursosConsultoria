import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import DiarioHistoricoTabs from './DiarioHistoricoTabs';
import TurmaDiarioCard from '../TurmaDiarioCard';
import type { TurmaDiarioDisciplina } from '../turma-diarios.types';
import type { DiarioHistorico, HistoricalField } from './diario-historico.types';
import { DiarioDocumentaryProvider } from './DiarioDocumentaryContext';
import { buildDocumentaryEvidence, buildDocumentaryAttendanceMap } from './diario-documentary.presentation';
import DiarioResultadoTab from '../DiarioResultadoTab';
import DiarioFrequenciaTab from '../DiarioFrequenciaTab';
import { buildGradesMap, buildPraticasMap } from '../diario-classe.utils';
import {
  historicalDiaryCardsKey, historicalDiaryKey, historicalFieldNeedsReview, historicalFieldText, parseDiarioHistorico,
} from './diario-historico.presentation';

const field = (raw: string, value: unknown, state = 'CONFERIDO'): HistoricalField => ({
  raw, value, review: { state }, sourceRefs: [{ locator: 'table[1]/row[1]/cell[1]' }],
});
const history: DiarioHistorico = {
  id: 'synthetic-history', sourceName: 'diario-sintetico.docx', sourceSha256: 'a'.repeat(64),
  importedAt: '2026-01-02T12:00:00Z', readOnly: true,
  officialHours: 20, officialClassHours: 20, reportedClassHours: 24, hoursState: 'EM_CONFERENCIA',
  studentsCount: 1, unresolvedCount: 1, lessonsCount: 1, attendanceCount: 0, gradesConfirmed: 1,
  lessons: [{ id: 'lesson-a', sourceKey: 'source-lesson-a', date: null,
    dateField: field('01/01 ou 01/04', null, 'REVIEW'), hours: 4,
    hoursField: field('4h', 4), hoursState: 'EM_CONFERENCIA',
    content: 'Conteúdo preservado.', practice: null }],
  students: [{ id: 'student-a', matriculaId: 'enrollment-a', name: 'Aluno sintético',
    enrollmentStatus: 'TRANCADO', grades: [],
    gradeRows: [{ sourceKey: 'grade-row-a', grades: [
      { columnOrdinal: 1, category: field('P', 'P'), value: field('7,8', 7.8) },
      { columnOrdinal: 2, category: field('P', 'P'), value: field('8,9', 8.9) },
    ], reportedResults: { final: field('7,5', 7.5, 'REVIEW'), outcome: field('APROVADO', 'APROVADO') } }],
    reportedResults: { final: field('7,5', 7.5, 'REVIEW'), frequency: field('100%', 100, 'REVIEW') },
    partial: null, final: 6.4, recovery: null, gradeState: 'CONFERIDO',
    frequency: null, frequencyState: 'EM_CONFERENCIA', attendance: [],
  }],
  unresolvedStudents: [{ sourcePersonKey: 'student-unmatched', sourceNames: [field('Aluno a conferir', 'Aluno a conferir')] }],
  metadata: { closure: [{ ...field('Encerrado em 01/01/2026', null, 'REVIEW'), declaredDate: '2026-01-01' }] },
  issues: [{ code: 'DATE_CONFLICT', sourceRefs: [{ locator: 'table[1]/row[1]/cell[1]' }] }],
};

test('somente null explícito libera diário operacional; payloads incompletos falham fechados', () => {
  assert.equal(parseDiarioHistorico(null), null);
  for (const value of [undefined, [], {}, false, { ...history, readOnly: false },
    { ...history, students: [{ ...history.students[0], attendance: null }] },
    { ...history, students: [{ ...history.students[0], attendance: [null] }] },
    { ...history, students: [{ ...history.students[0], grades: [null] }] },
    { ...history, issues: [null] }, { ...history, metadata: { closure: 'invalid' } },
    { ...history, lessons: [{ ...history.lessons[0], dateField: { sourceRefs: [null] } }] }]) {
    assert.throws(() => parseDiarioHistorico(value));
  }
  assert.equal(parseDiarioHistorico(history), history);
});

test('chave isola turma, disciplina, ator/contexto, modo de acesso e polo', () => {
  const baseline = historicalDiaryKey('t1', 'd1', 'GESTOR', 'actor:context', 'p1');
  assert.notDeepEqual(baseline, historicalDiaryKey('t2', 'd1', 'GESTOR', 'actor:context', 'p1'));
  assert.notDeepEqual(baseline, historicalDiaryKey('t1', 'd2', 'GESTOR', 'actor:context', 'p1'));
  assert.notDeepEqual(baseline, historicalDiaryKey('t1', 'd1', 'PROFESSOR', 'actor:context', 'p1'));
  assert.notDeepEqual(baseline, historicalDiaryKey('t1', 'd1', 'GESTOR', 'other:context', 'p1'));
  assert.notDeepEqual(baseline, historicalDiaryKey('t1', 'd1', 'GESTOR', 'actor:context', 'p2'));
  const cards = historicalDiaryCardsKey('t1', 'actor1', 'context1', 'p1');
  assert.notDeepEqual(cards, historicalDiaryCardsKey('t2', 'actor1', 'context1', 'p1'));
  assert.notDeepEqual(cards, historicalDiaryCardsKey('t1', 'actor2', 'context1', 'p1'));
  assert.notDeepEqual(cards, historicalDiaryCardsKey('t1', 'actor1', 'context2', 'p1'));
  assert.notDeepEqual(cards, historicalDiaryCardsKey('t1', 'actor1', 'context1', 'p2'));
});

test('zero permanece zero; campo desconhecido não vira nota e conflito preserva a fonte', () => {
  assert.equal(historicalFieldText(field('0', 0)), '0');
  assert.equal(historicalFieldText(field('-', null, 'EMPTY')), '—');
  assert.equal(historicalFieldText(field('01/01 ou 01/04', null, 'REVIEW')), '01/01 ou 01/04');
  assert.equal(historicalFieldNeedsReview(field('7,5', 7.5, 'REVIEW')), true);
});

test('resultados preservam instrumentos repetidos e mostram média enviada pelo servidor', () => {
  const html = renderToStaticMarkup(createElement(DiarioHistoricoTabs, { history, activeTab: 'resultado' }));
  assert.equal((html.match(/Instrumento do documento/g) || []).length, 2);
  for (const expected of ['7,8', '8,9', '7,5', '6,4', 'Conferir', 'APROVADO', 'TRANCADO', 'Situação no documento']) {
    assert.ok(html.includes(expected), expected);
  }
  assert.doesNotMatch(html, /<input|<select|contenteditable|Salvar notas|Promover aluno/);
});

test('frequência distingue marcação ausente e percentual pendente do valor documental', () => {
  const html = renderToStaticMarkup(createElement(DiarioHistoricoTabs, { history, activeTab: 'frequencia' }));
  for (const expected of ['01/01 ou 01/04', '100%', '—', 'Conferir', 'Aluno a conferir']) assert.ok(html.includes(expected));
  assert.doesNotMatch(html, /<input|<select|<button/);
});

test('aluno com notas e resultados null permanece visível sem bloquear todo o diário', () => {
  const missingGrades: DiarioHistorico = { ...history, students: [{
    ...history.students[0], grades: null, gradeRows: null, reportedResults: null,
    final: null, gradeState: 'EM_CONFERENCIA', resultState: 'EM_CONFERENCIA',
  }] };
  assert.equal(parseDiarioHistorico(missingGrades), missingGrades);
  for (const activeTab of ['resultado', 'frequencia'] as const) {
    const html = renderToStaticMarkup(createElement(DiarioHistoricoTabs, { history: missingGrades, activeTab }));
    assert.ok(html.includes('Aluno sintético'));
    assert.ok(html.includes('—'));
    assert.ok(html.includes('Conferir'));
    assert.doesNotMatch(html, /APROVADO|<input|<select/);
  }
});

test('conteúdo mantém horas documentais separadas da carga oficial e fechamento permanece apenas declarado', () => {
  const content = renderToStaticMarkup(createElement(DiarioHistoricoTabs, { history, activeTab: 'conteudo' }));
  for (const expected of ['20 h', '24 h', '4h', 'Conteúdo preservado.', 'Conferir']) assert.ok(content.includes(expected));
  const closure = renderToStaticMarkup(createElement(DiarioHistoricoTabs, { history, activeTab: 'fechamento' }));
  assert.ok(closure.includes('Data declarada: 01/01/2026'));
  assert.ok(closure.includes('não encerra o período nem promove alunos'));
  assert.doesNotMatch(closure, /<button|<input|<select/);
  const unknownClosure = parseDiarioHistorico({ ...history, metadata: { closure: [null] } })!;
  const missingDate = renderToStaticMarkup(createElement(DiarioHistoricoTabs, { history: unknownClosure, activeTab: 'fechamento' }));
  assert.ok(missingDate.includes('Data declarada: —'));
});

test('card histórico mostra evidências importadas com período planejado e não oferece PDF operacional', () => {
  const discipline: TurmaDiarioDisciplina = {
    id: 'synthetic-discipline', nome: 'Disciplina sintética', professor: 'Professor sintético',
    horasRealizadas: 0, cargaHoraria: 20, progressoPercent: 0, horasStatus: 'PENDENTE',
    periodoStatus: 'PLANEJADO', concluida: false, primeiraAula: null, ultimaAula: null,
    presencaGeralPercent: null, bloqueioDiario: 'ABERTO', historico: {
      id: 'synthetic-history', origem: 'DOCX_HISTORICO', sourceName: 'fonte-sintetica.docx',
      readOnly: true, estado: 'EM_CONFERENCIA', aulasDocumentadas: 6,
      horasDocumentadas: 24, horasOficiais: 20, horasEstado: 'EM_CONFERENCIA',
      datasEstado: 'EM_CONFERENCIA', primeiraAula: null, ultimaAula: null,
      frequenciasRegistradas: 48, frequenciasConferidas: 32,
    },
  };
  const html = renderToStaticMarkup(createElement(TurmaDiarioCard, {
    disciplina: discipline, onOpen: () => {}, onOpenPdf: () => {},
  }));
  for (const expected of ['Histórico em conferência', '6 aulas documentadas', '24 h', 'Oficial: 20 h',
    '48 registros', '32 conferidos', 'Datas em conferência', 'Visualizar histórico']) assert.ok(html.includes(expected), expected);
  assert.doesNotMatch(html, /Sem lançamento|0h \/ 20h|PDF em branco|onOpenPdf|disabled=""/);
  const operational = renderToStaticMarkup(createElement(TurmaDiarioCard, {
    disciplina: { ...discipline, historico: null }, onOpen: () => {}, onOpenPdf: () => {},
  }));
  assert.ok(operational.includes('Sem lançamento'));
  assert.ok(operational.includes('PDF em branco'));
  assert.doesNotMatch(operational, /Histórico em conferência/);
  const materialized = renderToStaticMarkup(createElement(TurmaDiarioCard, {
    disciplina: { ...discipline, horasRealizadas: 20, progressoPercent: 100,
      historico: { ...discipline.historico!, readOnly: false, estado: 'MATERIALIZADO',
        materialization: { status: 'MATERIALIZADO' } } },
    onOpen: () => {}, onOpenPdf: () => {},
  }));
  assert.ok(materialized.includes('20h / 20h'));
  assert.ok(materialized.includes('PDF preenchido'));
  assert.doesNotMatch(materialized, /Importado do diário|Histórico em conferência|DOCX/);
  assert.doesNotMatch(materialized, /Visualizar histórico|PDF preenchido aguarda/);
});

test('materialização libera o fluxo normal somente quando a confirmação e readOnly são coerentes', () => {
  const completed = { ...history, readOnly: false, materialization: { status: 'MATERIALIZADO' } };
  assert.equal(parseDiarioHistorico(completed), completed);
  assert.throws(() => parseDiarioHistorico({ ...completed, readOnly: true }));
  assert.throws(() => parseDiarioHistorico({ ...completed, materialization: { status: 'PENDENTE' } }));
});

test('diário normal exibe instrumentos P/P sem somar e mostra média documental enviada pelo servidor', () => {
  const html = renderToStaticMarkup(createElement(DiarioDocumentaryProvider, { history,
    children: createElement(DiarioResultadoTab, {
      students: [{ id: 'student-a', nome: 'Aluno sintético', matricula: 'M1', status: 'CURSANDO' }],
      localGrades: {}, isReadOnly: false,
      activeInstruments: { p: true, ti: true, tg: true, s: true, cq: true, o: true },
      onToggleInstrument() {}, onGradeChange() {}, onSaveGrade() {},
      getStats: () => ({ mediaParcial: 7.5, mediaFinal: 7.5, faltas: 0, frequencia: 100, resultado: 'APROVADO' }),
    }),
  }));
  assert.ok(html.includes('P: 7,8 | P: 8,9'));
  assert.ok(html.includes('7.5'));
  assert.doesNotMatch(html, /16\.7|somando os pontos|Registros importados|DOCX/);
  for (const input of html.match(/<input[^>]*>/g) || []) assert.ok(input.includes('disabled='));
});

test('diário normal e payload PDF preservam AT, FJ e traço sem transformar em presença', () => {
  const materialized: DiarioHistorico = { ...history, lessons: ['AT', 'FJ', '-'].map((mark) => ({
    ...history.lessons[0], id: mark, operationalLessonId: `op-${mark}`, date: '2026-01-01',
  })), students: [{ ...history.students[0], attendance: ['AT', 'FJ', '-'].map((mark) => ({
    lessonId: mark, status: null, state: 'EM_CONFERENCIA', source: field(mark, null),
  })) }] };
  const evidence = buildDocumentaryEvidence(materialized);
  assert.deepEqual(buildDocumentaryAttendanceMap(evidence, {})['student-a'], {
    'op-AT': 'AT', 'op-FJ': 'FJ', 'op--': '-',
  });
  assert.equal(buildDocumentaryAttendanceMap(evidence, { 'student-a': { 'op-AT': 'P' } })['student-a']['op-AT'], undefined);
  const html = renderToStaticMarkup(createElement(DiarioDocumentaryProvider, { history: materialized,
    children: createElement(DiarioFrequenciaTab, {
      students: [{ id: 'student-a', nome: 'Aluno sintético', matricula: 'M1', status: 'CURSANDO' }],
      aulas: materialized.lessons.map((lesson) => ({ id: lesson.operationalLessonId!, titulo: 'Conteúdo',
        cargaHoraria: 4, dataLabel: '01/01', sessoes: [{ id: lesson.operationalLessonId!, periodo: 'U', cargaHoraria: 4 }] })),
      attendanceMap: {}, isReadOnly: false, onToggleAttendance() {},
      getStats: () => ({ mediaParcial: null, mediaFinal: null, faltas: 0, frequencia: null, resultado: 'EM_CONFERENCIA' }),
    }),
  }));
  for (const mark of ['AT', 'FJ', '-']) assert.ok(html.includes(`>${mark}</button>`), mark);
  for (const button of html.match(/<button[^>]*>/g) || []) assert.ok(button.includes('disabled='));
});

test('dados documentais ausentes não se tornam zero faltas ou prática padrão', () => {
  const students = [{ id: 's1', nome: 'Aluno sintético', matricula: 'M1', status: 'CURSANDO' }];
  const aulas = [{ id: 'a1', titulo: 'Conteúdo', cargaHoraria: 4, dataLabel: '01/01',
    sessoes: [{ id: 'a1', periodo: 'U' as const, cargaHoraria: 4 }] }];
  const grade = { aluno_id: 's1', total_faltas: null, total_aulas: 1 };
  assert.equal(buildGradesMap(students, aulas, [grade], true).s1.total_faltas, null);
  assert.equal(buildGradesMap(students, aulas, [{ ...grade, total_faltas: 0 }], true).s1.total_faltas, 0);
  assert.equal(buildGradesMap(students, aulas, [grade]).s1.total_faltas, 0);
  assert.equal(buildPraticasMap(aulas, [], '').a1, '');
  assert.equal(buildPraticasMap(aulas, []).a1, 'Aula expositiva / Prática padrão');
});
