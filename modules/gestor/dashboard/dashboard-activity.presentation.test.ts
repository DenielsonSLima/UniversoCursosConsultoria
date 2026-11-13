import assert from 'node:assert/strict';
import test from 'node:test';
import { formatTimeAgo } from './dashboard.presentation.ts';

const now = new Date('2026-11-13T18:00:00Z');

test('explica o tempo decorrido sem abreviações de relógio', () => {
  for (const [value, expected] of [
    ['2026-11-13T17:59:59Z', 'Agora'],
    ['2026-11-13T17:59:00Z', 'há 1 minuto'],
    ['2026-11-13T17:01:00Z', 'há 59 minutos'],
    ['2026-11-13T17:00:00Z', 'há 1 hora'],
    ['2026-11-13T13:00:00Z', 'há 5 horas'],
    ['2026-11-12T19:00:00Z', 'há 23 horas'],
    ['2026-11-12T18:00:00Z', 'há 1 dia'],
    ['2026-11-11T18:00:00Z', 'há 2 dias'],
  ]) assert.equal(formatTimeAgo(value, now), expected);
});

test('mantém a data civil sem convertê-la para o fuso do navegador', () => {
  for (const [value, expected] of [
    ['2026-11-13', '13/11/2026'],
    ['2024-02-29', '29/02/2024'],
    ['2026-12-31', '31/12/2026'],
  ]) assert.equal(formatTimeAgo(value, now), expected);
});

test('datas civis independem de now e não viram tempo relativo', () => {
  assert.equal(formatTimeAgo('2026-11-13', new Date('invalid')), '13/11/2026');
  assert.equal(formatTimeAgo('2026-11-14', now), '14/11/2026');
});

test('respeita offsets explícitos, inclusive na virada do dia', () => {
  assert.equal(formatTimeAgo('2026-11-13T10:00:00-03:00', now), 'há 5 horas');
  assert.equal(formatTimeAgo('2026-11-14T03:00:00+14:00', now), 'há 5 horas');
  assert.equal(formatTimeAgo('2026-11-13T13:00:00.123456+00:00', now), 'há 4 horas');
  assert.equal(formatTimeAgo('2026-11-13T00:00:00-03:00',
    new Date('2026-11-13T04:00:00Z')), 'há 1 hora');
});

test('meia-noite com timestamp real continua sendo um instante', () => {
  assert.equal(formatTimeAgo('2026-11-13T00:00:00Z', now), 'há 18 horas');
});

test('usa duração decorrida, inclusive quando há mudança de horário de verão', () => {
  assert.equal(formatTimeAgo('2026-03-08T01:30:00-05:00',
    new Date('2026-03-08T03:30:00-04:00')), 'há 1 hora');
  assert.equal(formatTimeAgo('2026-11-01T01:30:00-04:00',
    new Date('2026-11-01T01:30:00-05:00')), 'há 1 hora');
});

test('não chama um instante futuro de Agora ou de passado', () => {
  assert.equal(formatTimeAgo('2026-11-13T19:00:00Z', now), 'em 1 hora');
  assert.equal(formatTimeAgo('2026-11-13T18:00:01Z', now), 'em instantes');
});

test('não inventa data nem fuso para valores inválidos ou sem hora inequívoca', () => {
  for (const value of [
    '', 'invalid', '2026-02-29', '2026-02-30', '2026-13-01', '2026-00-10',
    '2026-11-00', '2026-11-31', '13/11/2026', '2026-11-13T13:00:00',
    '2026-02-30T13:00:00Z', '2026-11-13T24:00:00Z', '2026-11-13T13:60:00Z',
    '2026-11-13T13:00:00+24:00', '2026-11-13 lixo',
  ]) assert.equal(formatTimeAgo(value, now), 'Data não informada', value);
  assert.equal(formatTimeAgo('2026-11-13T13:00:00Z', new Date('invalid')), 'Data não informada');
});
