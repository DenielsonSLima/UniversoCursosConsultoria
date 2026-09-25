import assert from 'node:assert/strict';
import { parseTransferPreview, parseTransferResult, parseTransferHistory } from './transfer-finance.contract.ts';
declare const Deno: { test: (name: string, run: () => void) => void };
const id = '00000000-0000-0000-0000-000000000001';
const item = { id, descricao: 'Mensalidade teste', origem: 'LOCAL', status: 'PENDENTE', valor: 100,
  vencimento: '2026-09-25', referencia: null, faixa: 'FUTURO', acao: 'CANCELAR_LOCAL' };
const preview = { versao: 1, matriculaId: id, tipo: 'EXTERNA_ENVIADA', dataTransferencia: '2026-09-24',
  turmaDestinoId: null, fingerprint: 'a'.repeat(64), itens: [item],
  resumo: { preservados: 0, locaisACancelar: 1, banesePendentes: 0, revisaoExterna: 0 } };

Deno.test('transfer preview retains canonical cutoff and local action', () => {
  assert.deepEqual(parseTransferPreview(preview), preview);
});
Deno.test('paid, same-day and overdue entries cannot arrive as cancellation', () => {
  for (const faixa of ['PAGO', 'NO_DIA', 'VENCIDO']) {
    assert.throws(() => parseTransferPreview({ ...preview, itens: [{ ...item, faixa }] }));
  }
});
Deno.test('internal continuity cannot project cancellation or a new boleto', () => {
  assert.throws(() => parseTransferPreview({ ...preview, tipo: 'INTERNA_TURMA', turmaDestinoId: id }));
  assert.doesNotThrow(() => parseTransferPreview({ ...preview, tipo: 'INTERNA_TURMA', turmaDestinoId: id,
    itens: [{ ...item, acao: 'CONTINUAR_ORIGEM' }] }));
});
Deno.test('imported Proesc and CNAB require external review, not local cancellation', () => {
  for (const origem of ['PROESC', 'BANESE_CNAB']) {
    assert.throws(() => parseTransferPreview({ ...preview, itens: [{ ...item, origem }] }));
    assert.doesNotThrow(() => parseTransferPreview({ ...preview, itens: [{ ...item, origem, acao: 'REVISAO_EXTERNA' }] }));
  }
});
Deno.test('unknown or malformed response fails only the financial panel', () => {
  for (const bad of [null, {}, { ...preview, itens: null }, { ...preview, fingerprint: '' },
    { ...preview, resumo: { ...preview.resumo, banesePendentes: -1 } }]) assert.throws(() => parseTransferPreview(bad));
});
Deno.test('confirmation requires explicit academic acknowledgement and operation identity', () => {
  const result = { transferenciaId: id, matriculaOrigemId: id, matriculaDestinoId: null,
    requestId: id, academicoConcluido: true, replayed: true, financeiro: preview.resumo };
  assert.deepEqual(parseTransferResult(result), result);
  assert.throws(() => parseTransferResult({ ...result, academicoConcluido: false }));
  assert.throws(() => parseTransferResult({ ...result, requestId: null }));
});
Deno.test('history preserves bank confirmation and external review as distinct states', () => {
  const history = { transferenciaId: id, tipo: 'EXTERNA_ENVIADA', data: '2026-09-24', alunoNome: 'Aluno de teste',
    matriculaOrigemId: id, matriculaDestinoId: null, itens: [{ ...item, situacao: 'REVISAO_EXTERNA' }] };
  assert.deepEqual(parseTransferHistory([history]), [history]);
  assert.throws(() => parseTransferHistory([{ ...history, itens: [{ ...item, situacao: 'CANCELADO_NAO_CONFIRMADO' }] }]));
});
