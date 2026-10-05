import assert from 'node:assert/strict';
import { repairOnlineInscription } from './online-inscription.ts';
import { createOnlineInscriptionAdmin } from './online-inscription.fixture.ts';

const academic = { course: { id: 'c' }, turma: { id: 't', curso_id: 'c' },
  aluno: { id: 'a', nome: 'Aluno de teste' }, matricula: { id: 'm', aluno_id: 'a', turma_id: 't' } };
const receipt = { id: 'new-receipt', matricula_id: 'm', turma_id: 't', cliente_id: 'a', valor: 99.9,
  status: 'PENDENTE', gateway_provider: 'banese_card', gateway_environment: 'production',
  gateway_payment_id: '000000099', gateway_payment_method: 'BOLETO', ead_checkout_attempt_id: 'new-attempt' };

Deno.test('recompra repara inscrição nova e preserva tentativa cancelada da mesma matrícula', async () => {
  const historical = { id: 'old-inscription', matricula_id: 'm', receivable_id: 'old-receipt',
    ead_checkout_attempt_id: 'old-attempt', gateway_payment_id: '000000010', status: 'CANCELADO' };
  const reserved = { id: 'new-inscription', matricula_id: 'm', receivable_id: 'new-receipt',
    ead_checkout_attempt_id: 'new-attempt', status: 'AGUARDANDO_PAGAMENTO' };
  const runtime = createOnlineInscriptionAdmin([historical, reserved], { transactionExists: true });
  const before = { ...runtime.rows.get('old-inscription') };
  const result = await repairOnlineInscription({ admin: runtime.admin, receivable: receipt, academic, requireGatewayTransaction: true });
  assert.equal(result.id, 'new-inscription');
  assert.equal(runtime.rows.size, 2);
  assert.deepEqual(runtime.rows.get('old-inscription'), before);
  assert.equal(runtime.rows.get('new-inscription')?.gateway_payment_id, '000000099');
});

Deno.test('inscrição legada sem recebível vincula no mesmo ID sem conflito de chave primária', async () => {
  const runtime = createOnlineInscriptionAdmin([{ id: 'legacy-inscription', matricula_id: 'm', receivable_id: null,
    status: 'AGUARDANDO_PAGAMENTO' }]);
  const result = await repairOnlineInscription({ admin: runtime.admin, receivable: { ...receipt, ead_checkout_attempt_id: null }, academic });
  assert.equal(result.id, 'legacy-inscription');
  assert.equal(runtime.rows.size, 1);
  assert.equal(runtime.rows.get('m')?.receivable_id, 'new-receipt');
});

Deno.test('snapshot legado updated_at NULL é protegido por CAS sem recusar o histórico', async () => {
  const runtime = createOnlineInscriptionAdmin([{ id: 'legacy-null-date', matricula_id: 'm', updated_at: null,
    receivable_id: null, status: 'AGUARDANDO_PAGAMENTO' }]);
  const result = await repairOnlineInscription({ admin: runtime.admin, receivable: { ...receipt, ead_checkout_attempt_id: null }, academic });
  assert.equal(result.id, 'legacy-null-date');
  assert.equal(runtime.rows.get('m')?.receivable_id, receipt.id);
});

Deno.test('duas inserções da mesma tentativa convergem sem alterar histórico', async () => {
  const runtime = createOnlineInscriptionAdmin();
  const results = await Promise.all([
    repairOnlineInscription({ admin: runtime.admin, receivable: receipt, academic }),
    repairOnlineInscription({ admin: runtime.admin, receivable: receipt, academic }),
  ]);
  assert.equal(runtime.rows.size, 1);
  assert.equal(results[0].id, results[1].id);
});

Deno.test('vencedor concorrente com identidade remota divergente bloqueia perdedor', async () => {
  const runtime = createOnlineInscriptionAdmin([], { beforeInsert: (_payload, rows) => {
    if (rows.size) return;
    rows.set('winner', { id: 'winner', matricula_id: 'm', receivable_id: receipt.id,
      ead_checkout_attempt_id: receipt.ead_checkout_attempt_id, gateway_provider: 'banese_card',
      gateway_environment: 'production', gateway_payment_id: '000000088', updated_at: '2026-10-04T11:00:00Z' });
  } });
  await assert.rejects(() => repairOnlineInscription({ admin: runtime.admin, receivable: receipt, academic }), /pagamento remoto canonico diferente/);
  assert.equal(runtime.upserts.length, 0);
  assert.equal(runtime.rows.get('winner')?.gateway_payment_id, '000000088');
});
