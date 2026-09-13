import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import DiarioHistoricoTabs from './DiarioHistoricoTabs';
import TurmaDiarioCard from '../TurmaDiarioCard';
import type { TurmaDiarioDisciplina } from '../turma-diarios.types';
import type { DiarioHistorico, HistoricalField } from './diario-historico.types';
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
});
