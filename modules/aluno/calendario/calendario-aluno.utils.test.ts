import assert from 'node:assert/strict';
import type { CalendarEvent } from '../../gestor/calendario/calendario.types.ts';
import {
  filterStudentCalendarEvents,
  isCalendarEventVisibleToStudent,
} from './calendario-aluno.utils.ts';

declare const Deno: {
  test(name: string, testFunction: () => void | Promise<void>): void;
};

const event = (overrides: Partial<CalendarEvent>): CalendarEvent => ({
  id: 'event-1',
  title: 'Evento',
  date: '2026-08-01',
  typeId: 'inst',
  ...overrides,
});

Deno.test('aluno recebe somente eventos gerais ou das próprias turmas', () => {
  const turmas = new Set(['turma-40']);

  assert.equal(isCalendarEventVisibleToStudent(event({ visibility: 'GENERAL' }), turmas), true);
  assert.equal(isCalendarEventVisibleToStudent(event({ visibility: 'TURMA', turmaId: 'turma-40' }), turmas), true);
  assert.equal(isCalendarEventVisibleToStudent(event({ visibility: 'TURMA', turmaId: 'turma-99' }), turmas), false);
  assert.equal(isCalendarEventVisibleToStudent(event({ visibility: 'PERSONAL' }), turmas), false);
});

Deno.test('filtro de turma preserva feriados e eventos gerais', () => {
  const events = [
    event({ id: 'official-2026-independencia', typeId: 'fer' }),
    event({ id: 'general', visibility: 'GENERAL' }),
    event({ id: 'class-a', turmaId: 'turma-40', visibility: 'TURMA', typeId: 'ped' }),
    event({ id: 'class-b', turmaId: 'turma-41', visibility: 'TURMA', typeId: 'ped' }),
  ];

  assert.deepEqual(
    filterStudentCalendarEvents(events, 'turma-40', '').map((item) => item.id),
    ['official-2026-independencia', 'general', 'class-a'],
  );
});

Deno.test('filtro de categoria também se aplica às datas oficiais', () => {
  const events = [
    event({ id: 'official-2026-independencia', typeId: 'fer' }),
    event({ id: 'official-2026-estudante', typeId: 'com' }),
    event({ id: 'class-a', turmaId: 'turma-40', visibility: 'TURMA', typeId: 'ped' }),
  ];

  assert.deepEqual(
    filterStudentCalendarEvents(events, 'turma-40', 'fer').map((item) => item.id),
    ['official-2026-independencia'],
  );
});
