import assert from 'node:assert/strict';
import test from 'node:test';
import type { ContasReceber } from './financeiro.types';
import { mapReceivableIssuance, receivableIssuanceNotice, submitReceivableFromFinanceiro } from './financeiro.receivable-issuance';

const receivable = (overrides: Partial<ContasReceber> = {}): ContasReceber => ({
  id: 'synthetic-title', poloId: 'synthetic-polo', descricao: 'Parcela de teste',
  valor: 279.9, dataVencimento: '2030-01-10', status: 'PENDENTE', categoria: 'MENSALIDADE',
  ...overrides,
});

test('projeção preserva destino e estado canônicos sem inferir pelo curso ou descrição', () => {
  assert.deepEqual(mapReceivableIssuance({
    destino_cobranca: 'BANESE', emissao_gerenciada_turma: true, emissao_ciclo_status: 'REVISAO',
  }), { destinoCobranca: 'BANESE', emissaoGerenciadaTurma: true, emissaoCicloStatus: 'REVISAO' });
  assert.deepEqual(mapReceivableIssuance({
    curso_modalidade: 'TECNICO', descricao: 'Ciclo manual', emissao_gerenciada_turma: 'true',
    emissao_ciclo_status: 'unknown',
  }), { destinoCobranca: undefined, emissaoGerenciadaTurma: false, emissaoCicloStatus: undefined });
  assert.equal(mapReceivableIssuance({ regra_financeira_tecnica_snapshot: { destinoCobranca: 'LOCAL' } }).destinoCobranca, 'LOCAL');
});

test('callback de envio recusa todo ciclo nativo e matrícula sem boleto antes de qualquer chamada bancária', async () => {
  let calls = 0;
  const send = async () => { calls += 1; return { success: true }; };
  for (const emissaoCicloStatus of ['EMITIDO', 'PENDENTE', 'REVISAO', 'REVISAO_MANUAL', undefined] as const) {
    await assert.rejects(submitReceivableFromFinanceiro(receivable({
      emissaoGerenciadaTurma: true, emissaoCicloStatus,
    }), send), /Gestão → Turma → Financeiro/);
  }
  await assert.rejects(submitReceivableFromFinanceiro(receivable({ destinoCobranca: 'LOCAL' }), send), /sem boleto/);
  assert.equal(calls, 0);
});

test('histórico importado não é reenviado e títulos comuns das outras modalidades continuam disponíveis', async () => {
  const calls: string[] = [];
  const send = async (id: string) => { calls.push(id); return { success: true }; };
  await assert.rejects(submitReceivableFromFinanceiro(receivable({ origemPagamento: 'SISTEMA_ANTERIOR' }), send), /histórico importado/);
  await assert.rejects(submitReceivableFromFinanceiro(receivable({
    proescEvidence: { sourceStatus: 'OPEN', verification: 'VERIFIED', observedAt: null },
  }), send), /histórico importado/);
  for (const cursoModalidade of ['EAD', 'LIVRE', 'ESPECIALIZACAO', 'TECNICO']) {
    assert.deepEqual(await submitReceivableFromFinanceiro(receivable({ cursoModalidade }), send), { success: true });
  }
  assert.equal(calls.length, 4);
});

test('aviso de emissão conserva recuperação na turma e distingue revisão e recebimento local', () => {
  assert.match(receivableIssuanceNotice(receivable({ emissaoGerenciadaTurma: true }))!.message, /Retomar emissão/);
  const review = receivableIssuanceNotice(receivable({ emissaoGerenciadaTurma: true, emissaoCicloStatus: 'REVISAO_MANUAL' }))!;
  assert.equal(review.title, 'Emissão em revisão');
  assert.doesNotMatch(review.message, /Retomar/);
  assert.equal(receivableIssuanceNotice(receivable({ destinoCobranca: 'LOCAL' }))!.title, 'Sem boleto');
  assert.equal(receivableIssuanceNotice(receivable({ emissaoGerenciadaTurma: true, emissaoCicloStatus: 'EMITIDO' })), null);
});
