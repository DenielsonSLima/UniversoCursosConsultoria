import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { build } = require('esbuild');
const directory = dirname(fileURLToPath(import.meta.url));
const compiled = await build({
  stdin: { resolveDir: directory, loader: 'ts', contents: `
    export { matriculaTecnicaCicloManualService as service } from '../financeiro/matricula-tecnica-ciclo-manual.service';
    export { startCicloManualIssuance } from '../financeiro/manual-technical-cycle-confirmation';
  ` },
  bundle: true, format: 'cjs', platform: 'node', write: false, packages: 'external',
  plugins: [{ name: 'synthetic-supabase-transport-only', setup(builder) {
    // All domain helpers and response parsers are the production modules.
    // Only the external transport is replaced; no network or bank call exists.
    builder.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'transport', namespace: 'synthetic' }));
    builder.onLoad({ filter: /.*/, namespace: 'synthetic' }, () => ({ loader: 'js', contents: `
      export const supabase = {
        functions: { invoke: (name, options) => globalThis.__transferSdkTransport.invoke(name, options) },
        rpc: () => { throw Error('Unexpected database request in synthetic SDK contract'); }
      };
    ` }));
  } }],
});
const loaded = { exports: {} };
new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(require, loaded, loaded.exports);
const { service, startCicloManualIssuance } = loaded.exports;
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const clone = (value) => globalThis.structuredClone(value);
const fingerprint = (letter) => letter.repeat(64);

const scenario = (cycle, mode) => {
  const fee = mode === 'BOLETO';
  const schedule = (number, type, order, suffix) => ({ itemId: uuid(suffix), cicloNumero: number,
    tipo: type, ordem: order, valor: type === 'PARCELA' ? '200.00' : '75.00', vencimento: '2027-03-20',
    descontoPontualidade: '0.00', jurosAtrasoPercentual: '0.000000', multaAtrasoPercentual: '0.000000' });
  const items = [...(fee ? [schedule(cycle, cycle === 1 ? 'MATRICULA' : 'REMATRICULA', 1, 10)] : []),
    schedule(cycle, 'PARCELA', fee ? 2 : 1, 11)];
  const planItems = cycle === 1 ? [...items, schedule(2, 'PARCELA', 1, 12)] : items;
  const previewItems = items.map((item) => ({ ...item,
    chave: item.tipo === 'PARCELA' ? `ciclo-${cycle}-parc-1`
      : item.tipo === 'MATRICULA' ? 'matricula' : 'ciclo-1-rematricula',
    numero: item.tipo === 'PARCELA' ? 1 : 0, descricao: `Cobrança sintética ${item.tipo}`,
    destinoCobranca: 'BANESE', detalhesBoleto: { valorNominal: item.valor, valorEmDia: item.valor,
      desconto: null, juros: null, multa: null, instrucaoBoleto: '', mensagensBoleto: [] },
  }));
  const count = items.length;
  const total = fee ? '275.00' : '200.00';
  const preview = { cicloNumero: cycle, modoMatricula: mode, sourceVencimento: 'INDIVIDUAL',
    dataOrigem: '2027-03-20', primeiroVencimento: '2027-03-20', itens: previewItems,
    quantidadeItens: count, quantidadeBancaria: count, quantidadeLocal: 0, total,
    matriculaSemBoleto: null, cronogramaEntradaVersao: 3, cronogramaEntradaFingerprint: fingerprint('a'),
    regraEfetivaFingerprint: fingerprint('b'), politicaFingerprint: fingerprint('c'), cronogramaFingerprint: fingerprint('d') };
  const requestId = uuid(100 + cycle + Number(fee));
  const generated = { numero: cycle, status: 'EMITIDO_BANESE', quantidadeItens: count,
    quantidadeBancaria: count, quantidadeLocal: 0, total, activeTotal: total,
    emitidosBanese: count, pendentesEmissao: 0, emRevisao: 0 };
  const response = { success: true, requestId, replayed: false,
    ciclo: { ...generated, recebiveis: previewItems.map((item, index) => ({ id: uuid(400 + index),
      chave: item.chave, tipo: item.tipo, numero: item.numero, descricao: item.descricao,
      valor: item.valor, vencimento: item.vencimento, status: 'PENDENTE', destinoCobranca: 'BANESE', emissaoBanese: 'EMITIDO' })) },
    cicloManual: { habilitado: true, modo: 'MANUAL', cicloBaseHistorico: 0, cicloMaximo: 2,
      estado: cycle === 1 ? 'ELEGIVEL' : 'JA_GERADO', podeGerar: cycle === 1,
      proximoCicloNumero: cycle === 1 ? 2 : null,
      primeiroVencimentoSugerido: cycle === 1 ? '2027-03-20' : null,
      criterioElegibilidade: 'MANUAL_DECISAO_GESTOR', bloqueio: null,
      politica: { revisao: 1, fingerprint: fingerprint('c') }, cicloGerado: generated,
      planoEntrada: { versao: 3, requestId: uuid(200), cicloInicial: cycle, maxCiclos: 2,
        cronogramaFingerprint: fingerprint('a'), itens: planItems },
      decisaoGestor: { versao: 1, naoEmitirPermitido: true, opcoes: [1, 2].map((number) => ({
        cicloNumero: number, acao: number === cycle ? 'RETOMAR' : cycle === 1 ? 'CRIAR' : 'CONSULTAR',
        podeGerar: number !== cycle && cycle === 1,
        motivo: number === cycle ? 'OPERACAO_EXISTENTE' : cycle === 1 ? null : 'SEM_COBRANCAS_PLANEJADAS' })) },
      financeiroMatricula: { versao: 1, matriculaId: uuid(300), taxas: Number(fee), ajustesResiduais: 0,
        mensalidades: { lancadas: 1, emitidas: 1, bancariasEmitidas: 1, externasConhecidas: 0, canceladas: 0, pagas: 0, emRevisao: 0 },
        fontes: [{ origem: 'UNIVERSO_NATIVE', provedor: 'BANESE', canal: 'API', quantidade: count }],
        ciclosComprovados: [], operacoes: [{ cicloNumero: cycle, estado: 'LOCAL_CREATED', requestId, quantidadeItens: count }] },
    },
  };
  return { preview, response, input: { turmaId: uuid(301), matriculaId: uuid(300), cicloNumero: cycle,
    primeiroVencimento: '2027-03-20', requestId,
    expectedRegraFingerprint: preview.regraEfetivaFingerprint, expectedPoliticaFingerprint: preview.politicaFingerprint,
    expectedCronogramaFingerprint: preview.cronogramaFingerprint } };
};

for (const [cycle, mode] of [[1, 'BOLETO'], [1, 'OMITIR'], [2, 'BOLETO']]) {
  test(`handler → SDK/invoke → parsers reais: C${cycle} ${mode}, entrada v3`, async () => {
    const data = scenario(cycle, mode);
    const calls = [];
    let reply = data.response;
    globalThis.__transferSdkTransport = { invoke: async (name, options) => {
      calls.push({ name, body: clone(options.body) });
      return { data: clone(reply), error: null };
    } };
    let parsed, canonical;
    const task = startCicloManualIssuance({ preview: data.preview, previewReady: true,
      canSettleEnrollment: false, openSettlement: false, externalHistory: false, externalHistoryConfirmed: false,
      positiveAmounts: true, firstDueDate: data.input.primeiroVencimento, issuanceStarted: { current: false },
      setIssuanceSnapshot: () => {}, onConfirm: async (snapshot, date, revision) => {
        canonical = { ...data.input, revisao: revision, primeiroVencimento: date };
        assert.equal(snapshot, data.preview);
        parsed = await service.generate(canonical);
      } });
    assert.ok(task);
    await task;
    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, 'technical-manual-cycle-issuance');
    assert.deepEqual(calls[0].body, { action: 'generate', matriculaId: data.input.matriculaId,
      cicloNumero: cycle, primeiroVencimento: data.input.primeiroVencimento, requestId: data.input.requestId,
      expectedRegraFingerprint: fingerprint('b'), expectedPoliticaFingerprint: fingerprint('c'),
      expectedCronogramaFingerprint: fingerprint('d'), revisao: canonical.revisao });
    assert.equal(canonical.revisao.modoMatricula, mode);
    assert.equal(canonical.revisao.emitirMatricula, mode === 'BOLETO');
    assert.equal(canonical.revisao.itens.length, data.preview.itens.length);
    assert.deepEqual(canonical.revisao.itens.map(({ chave }) => chave), data.preview.itens.map(({ chave }) => chave));
    assert.equal(parsed.requestId, data.input.requestId);
    assert.equal(parsed.ciclo.numero, cycle);
    assert.equal(parsed.ciclo.emitidosBanese, data.preview.quantidadeBancaria);
    assert.equal(parsed.cicloManual.planoEntrada.cicloInicial, cycle);
    assert.equal(parsed.cicloManual.financeiroMatricula.matriculaId, data.input.matriculaId);
    assert.equal(parsed.ciclo.recebiveis.filter(({ tipo }) => tipo === 'MATRICULA').length,
      cycle === 1 && mode === 'BOLETO' ? 1 : 0);

    // Prove the real request reconciliation and canonical-context checks run.
    reply = { ...data.response, requestId: uuid(999) };
    await assert.rejects(service.generate(canonical), /identificador da emissão/);
    reply = clone(data.response);
    reply.cicloManual.financeiroMatricula.operacoes[0].quantidadeItens++;
    await assert.rejects(service.generate(canonical), /operação emitida desta matrícula/);
    assert.equal(calls.length, 3, 'the SDK must never retry a command automatically');
  });
}

test.after(() => { delete globalThis.__transferSdkTransport; });
