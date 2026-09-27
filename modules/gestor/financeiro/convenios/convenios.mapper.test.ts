import assert from 'node:assert/strict';
import test from 'node:test';
import {
  mapConvenioDetail,
  mapConveniosList,
  mapFinalizarMesResult,
} from './convenios.mapper.ts';

const mes = {
  id: '11111111-1111-4111-8111-111111111111',
  convenio_id: '22222222-2222-4222-8222-222222222222',
  convenio_nome: 'Anhanguera',
  parceiro_id: null,
  parceiro_nome: null,
  polo_id: '33333333-3333-4333-8333-333333333333',
  polo_nome: 'Polo Centro',
  competencia: '2026-09-01',
  status: 'ABERTO',
  saldo_inicial: 1000,
  creditos: 40000,
  despesas_pagas: 10000,
  despesas_pendentes: 2500,
  saldo_disponivel: 31000,
  saldo_projetado: 28500,
  quantidade_creditos: 1,
  quantidade_despesas: 2,
  fechado_em: null,
  observacao: null,
  sucessora_id: null,
};

test('mapeia lista e extrato sem recalcular valores financeiros no cliente', () => {
  const lista = mapConveniosList({
    versao: 1,
    resumo: {
      convenios_ativos: 1,
      meses_abertos: 1,
      meses_finalizados: 0,
      saldo_inicial: 1000,
      creditos: 40000,
      despesas_pagas: 10000,
      despesas_pendentes: 2500,
      saldo_disponivel: 31000,
      saldo_projetado: 28500,
    },
    itens: [mes],
  });
  assert.equal(lista.itens[0]?.saldoProjetado, 28500);
  assert.equal(lista.resumo.creditos, 40000);

  const detalhe = mapConvenioDetail({
    versao: 1,
    mes,
    movimentos: [{
      id: '44444444-4444-4444-8444-444444444444',
      tipo: 'CREDITO',
      status: 'CONFIRMADO',
      data: '2026-09-05',
      descricao: 'Repasse mensal',
      valor: 40000,
      conta_nome: 'Conta principal',
      origem_id: '55555555-5555-4555-8555-555555555555',
      observacao: null,
    }],
  });
  assert.equal(detalhe.movimentos[0]?.tipo, 'CREDITO');
  assert.equal(detalhe.movimentos[0]?.contaNome, 'Conta principal');
});

test('falha fechado quando status ou campo monetário viola o contrato', () => {
  assert.throws(
    () => mapConvenioDetail({ versao: 1, mes: { ...mes, status: 'ENCERRADO' }, movimentos: [] }),
    /Contrato inválido de Convênios/,
  );
  assert.throws(
    () => mapConveniosList({
      versao: 1,
      resumo: {
        convenios_ativos: 1,
        meses_abertos: 1,
        meses_finalizados: 0,
        saldo_inicial: 0,
        creditos: 'não-numérico',
        despesas_pagas: 0,
        despesas_pendentes: 0,
        saldo_disponivel: 0,
        saldo_projetado: 0,
      },
      itens: [],
    }),
    /resumo.creditos/,
  );
});

test('mapeia fechamento com sucessora opcional e idempotência explícita', () => {
  const result = mapFinalizarMesResult({
    replayed: false,
    mes_fechado: { ...mes, status: 'FINALIZADO', fechado_em: '2026-09-30T18:00:00Z' },
    proxima_mes: { ...mes, id: '66666666-6666-4666-8666-666666666666', competencia: '2026-10-01' },
  });
  assert.equal(result.replayed, false);
  assert.equal(result.mesFechado.status, 'FINALIZADO');
  assert.equal(result.proximaMes?.competencia, '2026-10-01');
});
