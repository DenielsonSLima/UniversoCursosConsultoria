import assert from 'node:assert/strict';
import test from 'node:test';
import { parseServiceReceivablesPage, parseServiceReceivablesGroups, parseServiceReceivablesSummary, serviceReceivablesArgs, serviceReceivablesKeys } from './servicos-receber.contract';
import { canReceiveService, serviceReceiptBlockReason } from './service-receivable.presentation';

const id = '00000000-0000-4000-8000-000000000001';
const filters = { poloId: id, search: '  Serviço sintético  ', dueStart: '2026-11-01', dueEnd: '2026-11-30', statusScope: 'PENDING' as const };
const row = { id, polo_id: id, descricao: 'Serviço sintético · parcela 1/3', valor: '33.34', data_vencimento: '2026-11-30',
  status: 'PENDENTE', categoria: 'OUTROS_CREDITOS', cliente_nome: 'Pessoa sintética', nfse_number: '7',
  nfse_access_key: 'synthetic-key', nfse_fiscal_description: 'Descrição fiscal integral sintética', nfse_installment_number: 1,
  nfse_installment_count: 3, nfse_fiscal_cancelled_at: null,
  payment_summary: { originalAmount: '33.34', previouslyPaid: '10.00', remainingBefore: '23.34', status: 'PENDENTE', hasEvents: true } };

test('service reads preserve fiscal/financial identities and the canonical partial balance without recalculation', () => {
  const result = parseServiceReceivablesPage({ rows: [row], total_items: 321, page: 2, page_size: 20 }, 2, 20);
  assert.equal(result.totalItems, 321); assert.equal(result.rows[0].valor, 33.34);
  assert.equal(result.rows[0].nfseNumber, '7'); assert.equal(result.rows[0].nfseInstallmentCount, 3);
  assert.equal(result.rows[0].paymentSummary?.remainingBefore, '23.34');
  assert.equal(result.rows[0].otherCreditCancellationEligible, false);
  const pending = parseServiceReceivablesPage({ rows: [{ ...row, nfse_cancellation_state: 'REVIEW_REQUIRED', nfse_cancellation_reason: 'PAYMENT_HISTORY' }], total_items: 1, page: 1, page_size: 20 }, 1, 20);
  assert.equal(pending.rows[0].nfseCancellationState, 'REVIEW_REQUIRED');
  assert.equal(pending.rows[0].nfseCancellationReason, 'PAYMENT_HISTORY');
  assert.throws(() => parseServiceReceivablesPage({ rows: [{ ...row, nfse_cancellation_state: 'UNKNOWN' }], total_items: 1, page: 1, page_size: 20 }, 1, 20));
  const cancelled = parseServiceReceivablesPage({ rows: [{ ...row, status: 'CANCELADO', nfse_fiscal_cancelled_at: '2026-11-12T22:00:00Z' }], total_items: 1, page: 1, page_size: 20 }, 1, 20);
  assert.equal(cancelled.rows[0].status, 'CANCELADO', 'Automatic financial cancellation is rendered from the canonical SQL state');
  assert.equal(cancelled.rows[0].nfseFiscalCancelledAt, '2026-11-12T22:00:00Z');
});

test('service pagination, filters and cache keys preserve scope and reject contradictory results', () => {
  assert.deepEqual(serviceReceivablesArgs(filters), { p_polo_id: id, p_search: 'Serviço sintético', p_due_start: '2026-11-01', p_due_end: '2026-11-30', p_status_scope: 'PENDING' });
  assert.notDeepEqual(serviceReceivablesKeys.page(filters, 1, 20), serviceReceivablesKeys.page({ ...filters, poloId: 'other' }, 1, 20));
  assert.notDeepEqual(serviceReceivablesKeys.page(filters, 1, 20), serviceReceivablesKeys.page(filters, 2, 20));
  assert.equal(serviceReceivablesArgs({ ...filters, statusScope: 'UPCOMING' }).p_status_scope, 'UPCOMING');
  assert.notDeepEqual(serviceReceivablesKeys.groupItems(filters, id, 1, 25), serviceReceivablesKeys.groupItems(filters, id, 2, 25));
  assert.throws(() => serviceReceivablesArgs({ ...filters, dueEnd: '2026-10-01' }), /data final/);
  for (const change of [{ page: 2 }, { page_size: 30 }, { total_items: 0 }, { rows: [row, row] }]) {
    assert.throws(() => parseServiceReceivablesPage({ rows: [row], total_items: 1, page: 1, page_size: 20, ...change }, 1, 20));
  }
});

test('partner groups preserve backend counts and require the first row to belong to the same partner', () => {
  const first = { ...row, cliente_id: id };
  const group = { key: id, label: 'Parceiro sintético', item_count: 27, pending_count: 26, received_count: 1,
    canceled_count: 0, next_due: '2026-11-30', first };
  const payload = { groups: [group], total_items: 30, total_receivables: 200, page: 2, page_size: 20 };
  const result = parseServiceReceivablesGroups(payload, 2, 20);
  assert.equal(result.groups[0].itemCount, 27); assert.equal(result.totalItems, 30); assert.equal(result.totalReceivables, 200);
  for (const change of [{ first: { ...first, cliente_id: 'another' } }, { key: 'not-a-uuid' }, { item_count: 0 }]) {
    assert.throws(() => parseServiceReceivablesGroups({ ...payload, groups: [{ ...group, ...change }] }, 2, 20));
  }
  assert.throws(() => parseServiceReceivablesGroups({ ...payload, groups: [group, group] }, 2, 20));
});

test('receipt capability never overrides fiscal cancellation; payment history stays read only', () => {
  const active = parseServiceReceivablesPage({ rows: [{ ...row, operation_capabilities: {
    sourceSystem: 'LOCAL', provenanceKind: 'LOCAL', canSettle: true, canEmit: false, canCancel: false,
    canOpenExisting: false, canReconcile: false, readOnlyReason: null,
  } }],
    total_items: 1, page: 1, page_size: 20 }, 1, 20).rows[0];
  assert.equal(canReceiveService(active), true);
  for (const state of ['PENDING', 'REVIEW_REQUIRED', 'CANCELLED'] as const) assert.equal(canReceiveService({ ...active, nfseCancellationState: state }), false);
  const cancelled = { ...active, nfseNumber: '6', nfseFiscalCancelledAt: '2026-11-12T15:06:00Z' };
  assert.equal(canReceiveService(cancelled), false); assert.match(serviceReceiptBlockReason(cancelled) || '', /NFS-e nº 6 cancelada/);
  assert.equal(canReceiveService({ ...active, operationCapabilities: undefined }), false);
});

test('service summary values come from the backend and unavailable data is not presented as zero', () => {
  const result = parseServiceReceivablesSummary([{ pending_count: 2, received_count: 1, canceled_count: 0, overdue_count: 1,
    all_count: 3, pending_value: '75.50', received_value: '50.50', canceled_value: 0, overdue_value: '25.50', all_value: 126 }]);
  assert.equal(result.pendingValue, 75.5); assert.equal(result.allCount, 3);
  assert.throws(() => parseServiceReceivablesSummary([])); assert.throws(() => parseServiceReceivablesSummary([{}]));
});
