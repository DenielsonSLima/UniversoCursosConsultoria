import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BANESE_CNAB_RETURN_MAX_FILE_SIZE,
  buildApiSyncSummary,
  canConfirmBaneseCnabReturn,
  canResumeBaneseCnabReturn,
  canRevalidateBaneseCnabReturn,
  classifySettlementChannel,
  countRetryableBaneseCnabReturnRecords,
  describeCnabAvailabilityError,
  getMaceioDateKey,
  requiresBaneseCnabProductionAcknowledgement,
  summarizeBaneseCnabReturn,
  validateBaneseCnabReturnFile,
} from './conciliacao-bancaria.utils.ts';

test('prioriza a baixa manual mesmo quando o título Banese foi sincronizado e cancelado', () => {
  assert.equal(classifySettlementChannel({
    status: 'PAGO',
    origemPagamento: 'PRESENCIAL',
    manualSettlementId: 'settlement-id',
    gatewayProvider: 'banese_card',
    gatewayPaymentMethod: 'BOLETO',
    gatewayStatus: 'CANCELED',
  }), 'CAIXA_MANUAL');
});

test('só classifica API Banese quando o status bancário confirma pagamento', () => {
  assert.equal(classifySettlementChannel({
    status: 'PAGO',
    gatewayProvider: 'banese_card',
    gatewayPaymentMethod: 'BOLETO',
    gatewayStatus: 'PAID',
    gatewaySubmissionChannel: 'API',
  }), 'API_BANESE');

  assert.equal(classifySettlementChannel({
    status: 'PAGO',
    gatewayProvider: 'banese_card',
    gatewayPaymentMethod: 'BOLETO',
    gatewayStatus: 'CANCELED',
    gatewaySubmissionChannel: 'API',
  }), 'OUTRO');
});

test('explica o bloqueio do CNAB por falta de EDI7 sem marcar a API como indisponível', () => {
  const notice = describeCnabAvailabilityError(
    'Código EDI7 do Banese deve conter exatamente seis dígitos.',
  );

  assert.equal(notice?.reason, 'EDI7_MISSING');
  assert.match(notice?.message || '', /API Banese continua sendo o canal principal/i);
  assert.match(notice?.detail || '', /seis dígitos/i);
  assert.equal(describeCnabAvailabilityError(null), null);
});

test('aceita somente extensões de retorno Banese até 5 MB', () => {
  assert.deepEqual(validateBaneseCnabReturnFile({ name: 'RETORNO.RET', size: 240 }), {
    valid: true,
    extension: '.ret',
  });
  assert.deepEqual(validateBaneseCnabReturnFile({ name: 'retorno.txt', size: 240 }), {
    valid: true,
    extension: '.txt',
  });
  assert.deepEqual(validateBaneseCnabReturnFile({ name: 'retorno.cnab', size: BANESE_CNAB_RETURN_MAX_FILE_SIZE }), {
    valid: true,
    extension: '.cnab',
  });
});

test('bloqueia remessa, arquivo vazio e retorno maior que 5 MB', () => {
  const remittance = validateBaneseCnabReturnFile({ name: 'CB220001.rem', size: 240 });
  assert.equal(remittance.valid, false);
  if (!remittance.valid) assert.match(remittance.message, /remessa/i);

  const empty = validateBaneseCnabReturnFile({ name: 'retorno.ret', size: 0 });
  assert.equal(empty.valid, false);

  const oversized = validateBaneseCnabReturnFile({
    name: 'retorno.ret',
    size: BANESE_CNAB_RETURN_MAX_FILE_SIZE + 1,
  });
  assert.equal(oversized.valid, false);
  if (!oversized.valid) assert.match(oversized.message, /5 MB/i);
});

test('resume apenas linhas previamente filtradas, sem depender de payload bruto', () => {
  const now = new Date().toISOString();
  const summary = buildApiSyncSummary([
    { createdAt: now, updatedAt: now, lastError: null },
  ]);

  assert.equal(summary.syncsToday, 1);
  assert.equal(summary.syncsThisWeek, 1);
  assert.equal(summary.syncsThisMonth, 1);
  assert.equal(summary.hasApiSyncError, false);
});

test('libera confirmação com MATCHED e SKIPPED, mas bloqueia divergências e lote sem novidade', () => {
  const matchedRecord = {
    id: 'record-1',
    lineNumber: 2,
    nossoNumero: '123456789',
    occurrenceCodes: ['06'],
    status: 'MATCHED' as const,
  };
  const reviewRecord = {
    ...matchedRecord,
    id: 'record-2',
    status: 'REVIEW_REQUIRED' as const,
  };
  const skippedRecord = {
    ...matchedRecord,
    id: 'record-3',
    status: 'SKIPPED' as const,
  };

  assert.equal(canConfirmBaneseCnabReturn([]), false);
  assert.equal(canConfirmBaneseCnabReturn([matchedRecord]), true);
  assert.equal(canConfirmBaneseCnabReturn([matchedRecord, skippedRecord]), true);
  assert.equal(canConfirmBaneseCnabReturn([skippedRecord]), false);
  assert.equal(canConfirmBaneseCnabReturn([matchedRecord, reviewRecord]), false);
  assert.deepEqual(summarizeBaneseCnabReturn([matchedRecord, reviewRecord]), {
    events: 2,
    matched: 1,
    reviewRequired: 1,
    applied: 0,
    errors: 0,
    skipped: 0,
  });
});

test('não apresenta movimento apenas registrado como baixa financeira', () => {
  const record = {
    id: 'record-1',
    lineNumber: 2,
    nossoNumero: '123456789',
    occurrenceCodes: ['06'],
    status: 'RECORDED' as const,
  };
  const activationPending = { ...record, id: 'record-2', status: 'ACTIVATION_PENDING' as const };
  const activated = { ...record, id: 'record-3', status: 'ACTIVATED' as const };

  const summary = summarizeBaneseCnabReturn([record, activationPending, activated]);
  assert.equal(summary.applied, 2);
});

test('considera MATCHED, ERROR e ACTIVATION_PENDING como pendências reprocessáveis', () => {
  const baseRecord = {
    id: 'record-1',
    lineNumber: 2,
    nossoNumero: '123456789',
    occurrenceCodes: ['06'],
    status: 'ERROR' as const,
  };

  assert.equal(countRetryableBaneseCnabReturnRecords([
    baseRecord,
    { ...baseRecord, id: 'record-2', status: 'ACTIVATION_PENDING' as const },
    { ...baseRecord, id: 'record-3', status: 'MATCHED' as const },
    { ...baseRecord, id: 'record-4', status: 'ACTIVATED' as const },
  ]), 3);
});

test('mantém REVIEW_REQUIRED na revalidação e libera MATCHED para retry depois dela', () => {
  const reviewRecord = {
    id: 'record-review',
    lineNumber: 2,
    nossoNumero: '123456789',
    occurrenceCodes: ['06'],
    status: 'REVIEW_REQUIRED' as const,
  };
  const matchedRecord = {
    ...reviewRecord,
    id: 'record-matched',
    status: 'MATCHED' as const,
  };

  assert.equal(canRevalidateBaneseCnabReturn('PREVIEWED', [reviewRecord]), true);
  assert.equal(canRevalidateBaneseCnabReturn('PARTIAL', [reviewRecord, matchedRecord]), true);
  assert.equal(countRetryableBaneseCnabReturnRecords([reviewRecord, matchedRecord]), 1);

  const afterRevalidation = [
    matchedRecord,
    { ...matchedRecord, id: 'record-rematched' },
  ];
  assert.equal(canRevalidateBaneseCnabReturn('PARTIAL', afterRevalidation), false);
  assert.equal(countRetryableBaneseCnabReturnRecords(afterRevalidation), 2);
});

test('exige aceite em produção nas ações mutáveis e preserva retomada de PROCESSING', () => {
  assert.equal(requiresBaneseCnabProductionAcknowledgement('production'), true);
  assert.equal(requiresBaneseCnabProductionAcknowledgement('sandbox'), false);
  assert.equal(canResumeBaneseCnabReturn('PROCESSING'), true);
  assert.equal(canResumeBaneseCnabReturn('PARTIAL'), false);
});

test('usa o dia civil de America/Maceio nos indicadores', () => {
  const reference = new Date('2026-07-22T01:30:00.000Z');
  assert.equal(getMaceioDateKey(reference), '2026-07-21');

  const summary = buildApiSyncSummary([
    {
      createdAt: '2026-07-22T00:30:00.000Z',
      updatedAt: '2026-07-22T00:35:00.000Z',
      lastError: null,
    },
  ], reference);

  assert.equal(summary.syncsToday, 1);
  assert.equal(summary.syncsThisWeek, 1);
  assert.equal(summary.syncsThisMonth, 1);
});
