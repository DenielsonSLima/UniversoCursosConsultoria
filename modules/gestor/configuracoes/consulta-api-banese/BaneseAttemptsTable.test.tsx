import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import BaneseAttemptsTable from './BaneseAttemptsTable';
import type { BaneseAttemptRecovery, BanesePollingAttempt } from './consulta-api-banese.types';

const recovery: BaneseAttemptRecovery = {
  status: 'RECOVERED_AFTER_QUERY', label: 'Erro histórico superado por consulta posterior',
  currentQueryLabel: 'Última consulta concluída: banco informou pendente',
  recoveredAt: '2026-09-10T12:16:00Z', latestQueryAt: '2026-09-12T12:00:00Z',
  latestQueryResult: 'PENDING', latestQueryErrorClass: null,
  queueState: 'READY', queueLabel: 'Aguardando próxima consulta', nextCheckAt: '2026-09-12T12:05:00Z',
};
const attempt: BanesePollingAttempt = {
  id: 1, receivable_id: 'synthetic-title', created_at: '2026-09-10T12:00:00Z',
  result: 'ERROR', error_class: 'TIMEOUT', current_receivable_status: 'PENDENTE',
  current_gateway_status: 'PENDING', recovery,
};
const render = (value: BanesePollingAttempt = attempt) => renderToStaticMarkup(
  <BaneseAttemptsTable attempts={[value]} context="errors" canViewReceivableDetails
    page={1} totalPages={1} totalCount={1} pageSize={20} onPageChange={() => undefined} />,
);

test('historical timeout remains visible while successful pending query shows recovery', () => {
  const html = render();
  assert.match(html, /Histórico de erros de consulta/);
  assert.match(html, /eventos históricos/);
  assert.match(html, /TIMEOUT/);
  assert.match(html, /Erro histórico superado por consulta posterior/);
  assert.match(html, /banco informou pendente/);
  assert.match(html, /Próxima consulta em/);
  assert.doesNotMatch(html, /Erros recentes/);
});

test('a newer error is presented alongside historical recovery instead of being hidden', () => {
  const html = render({ ...attempt, recovery: { ...recovery,
    currentQueryLabel: 'A última tentativa de consulta falhou', latestQueryResult: 'ERROR',
    latestQueryErrorClass: 'UPSTREAM_5XX',
  } });
  assert.match(html, /superado por consulta posterior/);
  assert.match(html, /última tentativa de consulta falhou/);
  assert.match(html, /UPSTREAM_5XX/);
});

test('paid title does not manufacture a successful GET from payment alone', () => {
  const html = render({ ...attempt, current_receivable_status: 'PAGO', amount_paid: 260,
    recovery: { ...recovery, status: 'SETTLED_CURRENT',
      label: 'Título já pago e fila concluída; sem nova consulta comprovada',
      recoveredAt: null, latestQueryResult: 'ERROR', currentQueryLabel: 'A última tentativa de consulta falhou',
      queueState: 'DONE', queueLabel: 'Concluída', nextCheckAt: null,
    },
  });
  assert.match(html, /sem nova consulta comprovada/);
  assert.match(html, /260,00/);
  assert.doesNotMatch(html, /Consulta recuperada em|Próxima consulta em/);
});

test('unresolved error and missing projection never infer recovery from receivable status', () => {
  const html = render({ ...attempt, recovery: { ...recovery, status: 'AWAITING_NEW_QUERY',
    label: 'Sem consulta posterior bem-sucedida registrada', recoveredAt: null,
    currentQueryLabel: 'A última tentativa de consulta falhou', latestQueryResult: 'ERROR',
  } });
  assert.match(html, /Sem consulta posterior bem-sucedida registrada/);
  assert.doesNotMatch(html, /superado por consulta posterior/);
  assert.doesNotMatch(render({ ...attempt, current_receivable_status: 'PAGO', recovery: null }), /Consulta recuperada em/);
});
