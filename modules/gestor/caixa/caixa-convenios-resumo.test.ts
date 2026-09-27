import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertCaixaConveniosResumoRequest,
  mapCaixaConveniosResumo,
} from './caixa-convenios.service';

const payload = () => ({
  versao: 1,
  competencia: '2026-09-01',
  escopo_tipo: 'POLO',
  polo_id: '11111111-1111-1111-1111-111111111111',
  quantidade_convenios: 1,
  saldo_inicial: 2000,
  creditos_recebidos: 40000,
  despesas_pagas: 15000,
  comprometido_aberto: 5000,
  saldo_disponivel: 27000,
  saldo_projetado: 22000,
  itens: [{
    convenio_id: '22222222-2222-2222-2222-222222222222',
    nome: 'Anhanguera',
    competencia: '2026-09-01',
    status: 'ABERTO',
    saldo_inicial: 2000,
    creditos_recebidos: 40000,
    despesas_pagas: 15000,
    comprometido_aberto: 5000,
    saldo_disponivel: 27000,
    saldo_projetado: 22000,
  }],
});

test('preserva a posição canônica dos convênios sem recompor valores no cliente', () => {
  const resumo = mapCaixaConveniosResumo(payload());
  assert.equal(resumo.quantidadeConvenios, 1);
  assert.equal(resumo.saldoDisponivel, 27000);
  assert.equal(resumo.saldoProjetado, 22000);
  assert.equal(resumo.itens[0]?.nome, 'Anhanguera');
  assertCaixaConveniosResumoRequest(
    resumo,
    '11111111-1111-1111-1111-111111111111',
    '2026-09-01',
  );
});

test('recusa escopo, competência, status e contagem incompatíveis', () => {
  const resumo = mapCaixaConveniosResumo(payload());
  assert.throws(() => assertCaixaConveniosResumoRequest(resumo, null, '2026-09-01'), /escopo diferente/);
  assert.throws(() => assertCaixaConveniosResumoRequest(resumo, resumo.poloId, '2026-10-01'), /competência diferente/);

  const invalidStatus = payload();
  invalidStatus.itens[0].status = 'PENDENTE';
  assert.throws(() => mapCaixaConveniosResumo(invalidStatus), /status/);

  const invalidCount = payload();
  invalidCount.quantidade_convenios = 2;
  assert.throws(() => mapCaixaConveniosResumo(invalidCount), /quantidade divergente/);
});
