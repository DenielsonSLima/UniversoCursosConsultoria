import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { getSuggestedClassScheduleForHoursChange } from './turma-grade-ui.ts';

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
