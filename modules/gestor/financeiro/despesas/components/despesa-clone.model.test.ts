import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDespesaCloneDraft, resolveDespesaCloneCategoria } from './despesa-clone.model.ts';
import { despesaSugestaoReducer, initialSugestaoState } from './despesa-sugestao.model.ts';
import type { SugestaoState } from './despesa-sugestao.model.ts';
import type { DespesaLancamento } from '../despesas.types';

const source = {
  id: 'origem', requestId: 'pedido-antigo', fornecedorId: 'parceiro-antigo',
  fornecedorNome: 'Fornecedor antigo', fornecedorNomeFantasia: 'Marca antiga',
  descricao: 'SERVIÇO', categoriaFinanceiraId: 'categoria', valorBase: 1234.56,
  jurosValor: 2.34, multaValor: 1.01, descontoValor: 3.21, valor: 1234.70,
  dataLancamento: '2026-11-01', dataVencimento: '2026-11-05', dataPagamento: '2026-11-08',
  formaPagamento: 'DINHEIRO', contaBancariaId: 'conta', status: 'PAGO',
  grupoParcelas: 'grupo', totalParcelas: 12, parcelaNumero: 7, turmaId: 'turma',
  anexoPath: 'privado', convenioMesId: 'convenio', rateioMode: 'TODOS',
  paymentSummary: { hasEvents: true },
} as unknown as DespesaLancamento;

test('clonagem mantém entradas, centavos e datas distintas sem reutilizar vínculos e baixas', () => {
  const before = JSON.parse(JSON.stringify(source));
  const draft = buildDespesaCloneDraft(source);
  assert.deepEqual(draft, {
    descricao: 'SERVIÇO', categoriaId: 'categoria', valor: '1.234,56',
    jurosValor: '2,34', multaValor: '1,01', descontoValor: '3,21',
    dataLancamento: '2026-11-01', dataVencimento: '2026-11-05', dataPagamento: '2026-11-08',
    formaPagamento: 'DINHEIRO', contaBancariaId: 'conta', pago: true,
  });
  assert.deepEqual(source, before);
  for (const key of ['id', 'requestId', 'fornecedorId', 'fornecedorNome', 'fornecedorNomeFantasia',
    'grupoParcelas', 'totalParcelas', 'parcelaNumero', 'turmaId', 'anexoPath', 'convenioMesId',
    'rateioMode', 'paymentSummary']) assert.equal(key in draft, false, key);
});

test('escolher outro parceiro preserva os campos clonados diante da sugestão anterior', () => {
  const draft = buildDespesaCloneDraft(source);
  let state: SugestaoState = { ...initialSugestaoState,
    campos: { descricao: draft.descricao, valor: draft.valor, categoriaId: draft.categoriaId },
    manuais: { descricao: true, valor: true, categoriaId: true },
  };
  state = despesaSugestaoReducer(state, { type: 'selecionar', scope: 'novo-parceiro' });
  state = despesaSugestaoReducer(state, { type: 'aplicar', scope: 'novo-parceiro',
    sugestao: { id: 'sugestao', descricao: 'OUTRO', valorBase: 9.99, categoriaId: 'outra' }, categoriasAtivas: ['outra'],
  });
  assert.deepEqual(state.campos, { descricao: draft.descricao, valor: draft.valor, categoriaId: draft.categoriaId });
});

test('pendente não adquire data de pagamento e ausência de categoria continua vazia', () => {
  const draft = buildDespesaCloneDraft({ ...source, status: 'PENDENTE',
    categoriaFinanceiraId: undefined, dataPagamento: undefined, dataLancamento: undefined });
  assert.equal(draft.pago, false);
  assert.equal(draft.dataPagamento, '');
  assert.equal(draft.categoriaId, '');
  assert.equal(draft.dataLancamento, source.dataVencimento);
});

test('categoria só é descartada após consulta resolvida; inativa ou removida não vira vínculo oculto', () => {
  assert.equal(resolveDespesaCloneCategoria('original'), 'original');
  assert.equal(resolveDespesaCloneCategoria('original', []), '');
  const categoria = { id: 'original', nome: 'ANTIGA', tipo: 'DESPESA_VARIAVEL' as const, status: 'inativo' as const };
  assert.equal(resolveDespesaCloneCategoria('original', [categoria]), '');
  assert.equal(resolveDespesaCloneCategoria('original', [{ ...categoria, status: 'ativo' }]), 'original');
});
