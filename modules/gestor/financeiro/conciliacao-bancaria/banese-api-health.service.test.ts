import assert from 'node:assert/strict';
import test from 'node:test';
import type { GatewayOverview } from '../../configuracoes/integracao-bancaria/integracao-bancaria.service.ts';
import { buildBaneseApiHealthEvidence } from './banese-api-health.ts';

const overview = (): GatewayOverview => ({
  providers: [],
  credentials: [{
    id: 'credential-id',
    providerCode: 'banese_card',
    environment: 'sandbox',
    configured: true,
    apiKeyConfigured: false,
    accessTokenConfigured: true,
    publicKeyConfigured: false,
    clientIdConfigured: false,
    clientSecretConfigured: false,
    webhookSecretConfigured: false,
    metadata: {},
    lastTestAt: '2026-07-21T12:00:00.000Z',
    lastTestStatus: 'OK',
    lastTestMessage: 'Conexão validada.',
  }],
  routes: [],
  activeEnvironment: 'sandbox',
  issuerCandidates: [],
  activePolosCount: 0,
  webhookUrls: {},
});

test('não inventa indisponibilidade quando ainda não existe reconciliação persistida', () => {
  const evidence = buildBaneseApiHealthEvidence(overview(), null);
  assert.equal(evidence.reconciliationEvidence, 'NO_RECORD');
  assert.equal(evidence.lastReconciliationAt, null);
  assert.equal(evidence.lastTestStatus, 'OK');
});

test('classifica a última reconciliação exclusivamente pelo erro persistido', () => {
  const successful = buildBaneseApiHealthEvidence(overview(), {
    attemptedAt: '2026-07-21T13:00:00.000Z',
    persistedAt: '2026-07-21T13:00:02.000Z',
    lastError: null,
  });
  assert.equal(successful.reconciliationEvidence, 'RECORDED_WITHOUT_ERROR');

  const failed = buildBaneseApiHealthEvidence(overview(), {
    attemptedAt: '2026-07-21T14:00:00.000Z',
    persistedAt: '2026-07-21T14:00:02.000Z',
    lastError: 'Timeout confirmado na consulta.',
  });
  assert.equal(failed.reconciliationEvidence, 'RECORDED_WITH_ERROR');
  assert.equal(failed.lastReconciliationError, 'Timeout confirmado na consulta.');
});
