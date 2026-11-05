import assert from 'node:assert/strict';
import { buildOtherCreditPayload, type OtherCreditInput } from './other-credit.service.ts';

Deno.test('créditos avulsos locais e bancários possuem tipo canônico sem vínculo com carnê', () => {
  for (const mode of ['LOCAL_PAGO', 'LOCAL_RECEBER', 'GATEWAY'] as const) {
    const input: OtherCreditInput = {
      idempotencyKey: '11111111-1111-4111-8111-111111111111',
      poloId: '22222222-2222-4222-8222-222222222222',
      description: 'Crédito de teste', value: 129.9, dueDate: '2026-11-10',
      clientId: null, categoryId: null, accountId: null, mode,
      paymentMethod: mode === 'GATEWAY' ? 'BOLETO' : mode === 'LOCAL_PAGO' ? 'PIX' : null,
    };
    const row = buildOtherCreditPayload(input, mode === 'GATEWAY'
      ? { providerCode: 'banese_card', environment: 'sandbox', paymentMethod: 'BOLETO' } : null);
    assert.equal(row.tipo_lancamento, 'OUTRO_CREDITO');
    assert.equal(row.categoria, 'OUTROS_CREDITOS');
    assert.equal('outros_creditos_plano_id' in row, false);
    assert.equal(row.status, mode === 'LOCAL_PAGO' ? 'PAGO' : 'PENDENTE');
  }
});
