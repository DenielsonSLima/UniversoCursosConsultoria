import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildGradeChronology } from './turma-grade-cronologia.ts';
import type { TurmaAulaPlanejada, TurmaAtividadeExtraClasse } from '../../turma-grade.types';
import { getSuggestedClassScheduleForHoursChange } from './turma-grade-ui.ts';
import { getAulaOrigemOptions, resolveAulaOrigem } from './turma-grade-aula-origem.ts';

const emptyDraft = {
  previousHours: '',
  horaInicio: '',
  horaFim: '',
  isExtraClasse: false,
};

test('sugere o horário padrão para cargas de 4h e 8h', () => {
  assert.deepEqual(
    getSuggestedClassScheduleForHoursChange({ ...emptyDraft, nextHours: '4' }),
    { horaInicio: '08:00', horaFim: '12:00' },
  );
  assert.deepEqual(
    getSuggestedClassScheduleForHoursChange({ ...emptyDraft, nextHours: '4,0' }),
    { horaInicio: '08:00', horaFim: '12:00' },
  );
  assert.deepEqual(
    getSuggestedClassScheduleForHoursChange({ ...emptyDraft, nextHours: '8' }),
    { horaInicio: '08:00', horaFim: '16:00' },
  );
  assert.deepEqual(
    getSuggestedClassScheduleForHoursChange({ ...emptyDraft, nextHours: '8,0' }),
    { horaInicio: '08:00', horaFim: '16:00' },
  );
});

test('atualiza uma sugestão anterior quando a carga muda', () => {
  assert.deepEqual(
    getSuggestedClassScheduleForHoursChange({
      previousHours: '8',
      nextHours: '4',
      horaInicio: '08:00',
      horaFim: '16:00',
      isExtraClasse: false,
    }),
    { horaInicio: '08:00', horaFim: '12:00' },
  );
  assert.deepEqual(
    getSuggestedClassScheduleForHoursChange({
      previousHours: '4',
      nextHours: '6',
      horaInicio: '08:00',
      horaFim: '12:00',
      isExtraClasse: false,
    }),
    { horaInicio: '', horaFim: '' },
  );
});

test('preserva horário manual e ignora outras cargas ou extra-classe', () => {
  assert.equal(getSuggestedClassScheduleForHoursChange({
    previousHours: '8',
    nextHours: '4',
    horaInicio: '09:00',
    horaFim: '13:00',
    isExtraClasse: false,
  }), null);
  assert.equal(getSuggestedClassScheduleForHoursChange({ ...emptyDraft, nextHours: '6' }), null);
  assert.equal(getSuggestedClassScheduleForHoursChange({
    ...emptyDraft,
    nextHours: '8',
    isExtraClasse: true,
  }), null);
});

test('linha de planejamento exibe rótulos visíveis e associados aos campos', () => {
  const source = readFileSync(new URL('./TurmaGradePlanejamentoForm.tsx', import.meta.url), 'utf8');

  assert.match(source, /Conteúdo da aula \(opcional\)/);
  assert.match(source, /Tema da atividade/);
  assert.match(source, /Data da aula/);
  assert.match(source, /Prazo de entrega/);
  assert.match(source, />Início</);
  assert.match(source, />Fim</);
  assert.match(source, /Carga horária do dia/);
  assert.match(source, /htmlFor=\{`turma-data-input-/);
  assert.match(source, /htmlFor=\{`turma-hora-inicio-input-/);
  assert.match(source, /htmlFor=\{`turma-hora-fim-input-/);
  assert.match(source, /htmlFor=\{`turma-horas-input-/);
});


const aula = (id: string, dataAula?: string): TurmaAulaPlanejada => ({
  id, dataAula, titulo: id, cargaHoraria: 8, sessoes: [],
});
const extra = (id: string, prazoEntrega?: string | null, status = 'PUBLICADA'): TurmaAtividadeExtraClasse => ({
  id, prazoEntrega, status, titulo: id, cargaHoraria: 5,
});
const identity = (item: ReturnType<typeof buildGradeChronology>[number]) =>
  item.tipo === 'aula' ? item.aula.id : item.atividade.id;

test('intercala aulas e extras pela data sem alterar registros ou numeração de origem', () => {
  const aulas = Object.freeze([aula('a1', '2026-06-06'), aula('a2', '2026-06-13'), aula('a3', '2026-06-20')]);
  const extras = Object.freeze([extra('e1', '2026-06-12'), extra('e2', '2026-06-19'), extra('e3', '2026-06-26')]);
  const result = buildGradeChronology(aulas, extras);
  assert.deepEqual(result.map(identity), ['a1', 'e1', 'a2', 'e2', 'a3', 'e3']);
  assert.deepEqual(result.map((item) => item.index), [0, 0, 1, 1, 2, 2]);
  assert.equal(result[0].tipo === 'aula' && result[0].aula, aulas[0]);
  assert.deepEqual(aulas.map((item) => item.id), ['a1', 'a2', 'a3']);
});

test('ordena datas reais entre meses e anos e deixa datas ausentes ou inválidas ao fim', () => {
  const result = buildGradeChronology([
    aula('sem-data'), aula('fevereiro', '2027-02-01'), aula('dezembro', '2026-12-31'),
  ], [extra('invalida', '2027-02-30'), extra('janeiro', '2027-01-01'), extra('vazia', null)]);
  assert.deepEqual(result.map(identity), ['dezembro', 'janeiro', 'fevereiro', 'sem-data', 'invalida', 'vazia']);
});

test('mantém desempate estável, rascunhos visíveis e arquivadas fora da cronologia', () => {
  const result = buildGradeChronology([aula('a1', '2026-06-12'), aula('a2', '2026-06-12')], [
    extra('arquivada', '2026-01-01', 'ARQUIVADA'),
    extra('rascunho', '2026-06-12', 'RASCUNHO'), extra('publicada', '2026-06-12'),
  ]);
  assert.deepEqual(result.map(identity), ['a1', 'a2', 'rascunho', 'publicada']);
  assert.deepEqual(result.map((item) => item.index), [0, 1, 0, 1]);
  assert.deepEqual(buildGradeChronology([], []), []);
});

test('origem preserva a identidade e reconhece as sessões de um mesmo encontro', () => {
  const aulas = [aula('m1', '2026-06-06'), aula('m2', '2026-06-13')];
  aulas[0].sessoes = [{ id: 't1', periodo: 'T', cargaHoraria: 4 }];
  assert.equal(getAulaOrigemOptions(aulas)[0].value, 'm1');
  assert.match(getAulaOrigemOptions(aulas)[0].label, /Aula 1.*06\/06\/2026/);
  assert.equal(resolveAulaOrigem(aulas, 't1')?.aula.id, 'm1');
  assert.equal(resolveAulaOrigem(aulas, 'm2')?.label, 'Complemento da Aula 2 • 13/06/2026');
  assert.equal(resolveAulaOrigem(aulas, null), null);
  assert.equal(resolveAulaOrigem(aulas, 'inexistente'), null);
});

test('formulário exige aula de origem canônica sem seletor nativo', () => {
  const source = readFileSync(new URL('./TurmaGradePlanejamentoForm.tsx', import.meta.url), 'utf8');
  assert.match(source, /Aula de origem/);
  assert.match(source, /<InstitutionalSelect/);
  assert.match(source, /!origemValida/);
  assert.doesNotMatch(source, /<select\b|<datalist\b/);
});
