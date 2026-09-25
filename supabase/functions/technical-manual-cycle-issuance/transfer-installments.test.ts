import assert from 'node:assert/strict';
import type { ManualCycleContext, ManualCycleIssuanceRequest } from './contract.ts';
import { runManualCycleIssuance, type ManualCycleIssuanceDependencies } from './orchestrator.ts';

function scenario(count: number, cycle: number, mode: 'BOLETO' | 'REGISTRO_SEM_BOLETO' | 'OMITIR') {
  const local = cycle === 1 && mode === 'REGISTRO_SEM_BOLETO';
  const items: ManualCycleContext['ciclo']['recebiveis'] = Array.from({ length: count }, (_, index) => ({
    id: `parcela-${index + 1}`, chave: `ciclo-${cycle}-parc-${index + 1}`,
    tipo: 'PARCELA', numero: index + 1, descricao: `Mensalidade ${index + 1}/${count}`,
    valor: '100.00', vencimento: '2027-01-20', status: 'PENDENTE',
    emissaoBanese: 'PENDENTE', destinoCobranca: 'BANESE',
  }));
  if (mode !== 'OMITIR') items.unshift({
    id: 'taxa', chave: cycle === 1 ? 'matricula' : 'ciclo-1-rematricula',
    tipo: cycle === 1 ? 'MATRICULA' : 'REMATRICULA', numero: 0, descricao: 'Taxa',
    valor: '100.00', vencimento: '2027-01-20', status: 'PENDENTE',
    emissaoBanese: local ? 'NAO_APLICAVEL' : 'PENDENTE',
    destinoCobranca: local ? 'LOCAL' : 'BANESE', localSemBoletoComprovado: local,
  });
  const context: ManualCycleContext = {
    requestId: 'request', replayed: false, matriculaId: 'matricula', turmaId: 'turma', poloId: 'polo',
    ciclo: { numero: cycle, cicloNumero: cycle, status: 'LOCAL_CREATED', quantidadeItens: items.length,
      quantidadeBancaria: items.length - Number(local), quantidadeLocal: Number(local),
      total: `${items.length * 100}.00`, emitidosBanese: 0,
      pendentesEmissao: items.length - Number(local), emRevisao: 0, recebiveis: items },
    cicloManual: {},
  };
  const request: ManualCycleIssuanceRequest = {
    action: 'generate', matriculaId: 'matricula', cicloNumero: cycle, primeiroVencimento: '2027-01-20',
    requestId: 'request', expectedRegraFingerprint: 'a'.repeat(64),
    expectedPoliticaFingerprint: 'b'.repeat(64), expectedCronogramaFingerprint: 'c'.repeat(64),
    revisao: { emitirMatricula: mode === 'BOLETO', modoMatricula: mode,
      itens: items.map((item) => ({ chave: item.chave, valor: item.valor, vencimento: item.vencimento,
        descontoPontualidade: '0', jurosAtrasoPercentual: '0', multaAtrasoPercentual: '0' })) },
  };
  const calls: string[] = [];
  const load = () => Promise.resolve(globalThis.structuredClone(context));
  const dependencies: ManualCycleIssuanceDependencies = {
    preflight: () => Promise.resolve(), prepare: load, resume: load, reload: load,
    issueReceivable: (_context, id) => {
      calls.push(id);
      context.ciclo.recebiveis.find((item) => item.id === id)!.emissaoBanese = 'EMITIDO';
      context.ciclo.emitidosBanese++;
      context.ciclo.pendentesEmissao--;
      return Promise.resolve();
    },
  };
  return { context, request, dependencies, calls };
}

Deno.test('plano parcial ou completo emite exatamente os itens revisados, preservando matrícula LOCAL', async () => {
  for (const count of [1, 6, 60]) {
    for (const [cycle, mode] of [[1, 'BOLETO'], [1, 'REGISTRO_SEM_BOLETO'], [1, 'OMITIR'], [2, 'BOLETO'], [2, 'OMITIR']] as const) {
      const value = scenario(count, cycle, mode);
      const result = await runManualCycleIssuance(value.request, value.dependencies);
      const expectedBank = count + Number(mode === 'BOLETO');
      assert.equal(result.ciclo.emitidosBanese, expectedBank);
      assert.equal(value.calls.length, expectedBank);
      assert.equal(value.calls.includes('taxa'), mode === 'BOLETO');
      await runManualCycleIssuance({ ...value.request, action: 'resume', revisao: null }, value.dependencies);
      assert.equal(value.calls.length, expectedBank, 'Retomada não pode repetir emissão');
    }
  }
});

Deno.test('divergência de quantidade, chave, ordinal ou identidade bloqueia antes da emissão', async () => {
  for (const change of [
    (c: ManualCycleContext) => { c.ciclo.recebiveis.pop(); c.ciclo.quantidadeItens--; c.ciclo.quantidadeBancaria!--; },
    (c: ManualCycleContext) => { c.ciclo.recebiveis[1].numero = 3; },
    (c: ManualCycleContext) => { c.ciclo.recebiveis[1].id = c.ciclo.recebiveis[2].id; },
    (c: ManualCycleContext) => { c.ciclo.recebiveis[1].chave = 'outra-chave'; },
  ]) {
    const value = scenario(6, 1, 'REGISTRO_SEM_BOLETO');
    change(value.context);
    await assert.rejects(() => runManualCycleIssuance(value.request, value.dependencies), /cobranças revisadas/);
    assert.equal(value.calls.length, 0);
  }
});
