import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { build, transform } from 'esbuild';

const directory = dirname(fileURLToPath(import.meta.url));
const nodeRequire = createRequire(import.meta.url);
const bundled = await build({ entryPoints: [resolve(directory, 'external-transfer-issuance.ts')],
  bundle: true, format: 'cjs', platform: 'node', write: false, packages: 'external' });
const module = { exports: {} };
new Function('require', 'module', 'exports', bundled.outputFiles[0].text)(nodeRequire, module, module.exports);
const { prepareExternalTransferIssuance } = module.exports;
const compile = async (file, require) => {
  const code = await transform(await readFile(resolve(directory, file), 'utf8'), { loader: file.endsWith('tsx') ? 'tsx' : 'ts', format: 'cjs' });
  const target = { exports: {} };
  new Function('require', 'module', 'exports', code.code)(require, target, target.exports);
  return target.exports;
};
const uuid = (number) => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const fingerprint = 'a'.repeat(64);
const item = (id, cicloNumero, tipo, ordem) => ({ itemId: uuid(id), cicloNumero, tipo, ordem,
  vencimento: '2027-01-10', valor: '200.00', descontoPontualidade: '10.00',
  jurosAtrasoPercentual: '1.000000', multaAtrasoPercentual: '2.000000' });
const clone = (value) => globalThis.structuredClone(value);
const fixture = (cycle = 1) => {
  const items = [item(20, cycle, cycle === 1 ? 'MATRICULA' : 'REMATRICULA', 1), item(21, cycle, 'PARCELA', 2)];
  if (cycle === 1) items.push(item(22, 2, 'REMATRICULA', 1), item(23, 2, 'PARCELA', 2));
  const saved = { versao: 3, requestId: uuid(1), replayed: false, matriculaId: uuid(2), transferenciaId: uuid(3),
    financeiro: { financeiro: { versao: 3, itens: items } }, cobrancaGerada: false };
  const context = { saved, turmaId: uuid(4), alunoId: uuid(5), poloId: uuid(6) };
  const plan = { versao: 3, itens: clone(items), requestId: saved.requestId, cicloInicial: cycle, maxCiclos: 2, cronogramaFingerprint: fingerprint };
  const cycleState = { habilitado: true, modo: 'MANUAL', estado: 'ELEGIVEL', podeGerar: true,
    criterioElegibilidade: 'MANUAL_DECISAO_GESTOR', planoEntrada: plan, proximoCicloNumero: cycle,
    decisaoGestor: { versao: 1, naoEmitirPermitido: true, opcoes: [
      { cicloNumero: 1, acao: cycle === 1 ? 'CRIAR' : 'CONSULTAR', podeGerar: cycle === 1, motivo: cycle === 1 ? null : 'SEM_COBRANCAS' },
      { cicloNumero: 2, acao: 'CRIAR', podeGerar: true, motivo: null },
    ] },
    financeiroMatricula: { versao: 1, matriculaId: saved.matriculaId, fontes: [] },
    cicloGerado: null, primeiroVencimentoSugerido: '2027-01-10' };
  const row = { matriculaId: saved.matriculaId, alunoId: context.alunoId, alunoNome: 'Aluno sintético', matriculaExibicao: 'SYN-001', cicloManual: cycleState };
  const workspace = { turma: { turmaId: context.turmaId, poloId: context.poloId }, aluno: { alunoId: context.alunoId }, matriculas: [row] };
  const previewItems = items.filter((entry) => entry.cicloNumero === cycle).map((entry) => ({ ...entry,
    chave: `item:${entry.itemId}`, detalhesBoleto: { desconto: { valor: '10.00' }, juros: { percentualMes: '1.000000' }, multa: { percentual: '2.000000' } } }));
  const response = { matriculaId: saved.matriculaId, turmaId: context.turmaId, cicloManual: clone(cycleState),
    preview: { cicloNumero: cycle, modoMatricula: 'BOLETO', sourceVencimento: 'INDIVIDUAL', dataOrigem: '2027-01-10',
      itens: previewItems, quantidadeItens: 2, quantidadeBancaria: 2, total: '400.00',
      cronogramaEntradaVersao: 3, cronogramaEntradaFingerprint: fingerprint,
      regraEfetivaFingerprint: 'b'.repeat(64), politicaFingerprint: 'c'.repeat(64), cronogramaFingerprint: 'd'.repeat(64) } };
  return { context, workspace, response, row };
};

test('C1 e C2 inicial usam somente o ciclo autorizado e preservam snapshot aprovado', async () => {
  for (const cycle of [1, 2]) {
    const data = fixture(cycle);
    let input;
    const result = await prepareExternalTransferIssuance(data.context, async () => data.workspace,
      async (value) => { input = value; return data.response; });
    assert.equal(input.cicloNumero, cycle);
    assert.equal(result.cycleNumber, cycle);
    assert.deepEqual(input.revisao.itens, []);
    assert.equal(input.revisao.emitirMatricula, true);
    assert.deepEqual(result.preview, data.response.preview);
  }
});

test('identidade, plano modificado, C2 já liberado após C1 e origem conflitante bloqueiam antes da prévia', async () => {
  const mutations = [
    (data) => { data.workspace.turma.poloId = uuid(100); },
    (data) => { data.workspace.aluno.alunoId = uuid(100); },
    (data) => { data.row.matriculaId = uuid(100); },
    (data) => { data.row.cicloManual.planoEntrada.itens[0].valor = '250.00'; },
    (data) => { data.row.cicloManual.proximoCicloNumero = 2; },
    (data) => { data.row.cicloManual.decisaoGestor.opcoes[0].acao = 'CONSULTAR'; },
    (data) => { data.row.cicloManual.financeiroMatricula.fontes = [{ origem: 'CONFLICT' }]; },
    (data) => { data.row.cicloManual.estado = 'PROTEGIDO_EXISTENTE'; },
    (data) => { data.row.cicloManual.cicloGerado = { numero: 1 }; },
  ];
  for (const mutate of mutations) {
    const data = fixture();
    mutate(data);
    let previews = 0;
    await assert.rejects(prepareExternalTransferIssuance(data.context, async () => data.workspace,
      async () => { previews++; return data.response; }));
    assert.equal(previews, 0);
  }
});

test('prévia alterada em valor, encargo, vencimento, identidade ou ciclo bloqueia emissão', async () => {
  for (const mutate of [
    (result) => { result.preview.itens[0].valor = '201.00'; },
    (result) => { result.preview.itens[0].detalhesBoleto.multa.percentual = '3'; },
    (result) => { result.preview.itens[0].vencimento = '2027-01-11'; },
    (result) => { result.turmaId = uuid(100); },
    (result) => { result.preview.cicloNumero = 2; },
  ]) {
    const data = fixture();
    mutate(data.response);
    await assert.rejects(prepareExternalTransferIssuance(data.context, async () => data.workspace, async () => data.response));
  }
});

test('plano vazio conclui academicamente sem consultar prévia nem gerar', async () => {
  const data = fixture();
  data.context.saved.financeiro.financeiro.itens = [];
  data.row.cicloManual.planoEntrada.itens = [];
  const result = await prepareExternalTransferIssuance(data.context, async () => data.workspace, async () => { throw new Error('não deve consultar'); });
  assert.equal(result, null);
});

test('C1 sem taxa consulta modo OMITIR e confirma somente as mensalidades planejadas', async () => {
  const data = fixture();
  data.context.saved.financeiro.financeiro.itens = data.context.saved.financeiro.financeiro.itens.filter((entry) => entry.tipo !== 'MATRICULA');
  data.row.cicloManual.planoEntrada.itens = clone(data.context.saved.financeiro.financeiro.itens);
  data.response.cicloManual = clone(data.row.cicloManual);
  data.response.preview.modoMatricula = 'OMITIR';
  data.response.preview.itens = data.response.preview.itens.filter((entry) => entry.tipo !== 'MATRICULA');
  const result = await prepareExternalTransferIssuance(data.context, async () => data.workspace, async (input) => {
    assert.equal(input.revisao.modoMatricula, 'OMITIR');
    assert.equal(input.revisao.emitirMatricula, false);
    return data.response;
  });
  assert.equal(result.preview.itens.length, 1);
});

const hooksRuntime = () => {
  const slots = [];
  let index = 0;
  const useRef = (initial) => slots[index++] ||= { current: initial };
  const useState = (initial) => {
    const slot = useRef(initial);
    return [slot.current, (next) => { slot.current = typeof next === 'function' ? next(slot.current) : next; }];
  };
  return { react: { __esModule: true, default: React, useRef, useState }, render: (callback) => { index = 0; return callback(); } };
};

test('handler real registra uma vez e só depois inicia emissão; falha acadêmica não emite', async () => {
  for (const confirmed of [true, false]) {
    const runtime = hooksRuntime();
    const calls = [];
    let release;
    const registration = new Promise((resolve) => { release = resolve; });
    const data = fixture();
    const state = { draft: { studentId: data.context.alunoId }, result: null, canClose: true, canDismiss: () => true,
      confirm: async () => { calls.push('register'); await registration; return confirmed ? data.context.saved : null; } };
    const emission = { run: async (saved) => { assert.equal(saved.matriculaId, data.context.saved.matriculaId); calls.push('issue'); } };
    const component = await compile('ReceiveExternalTransferController.tsx', (name) => {
      if (name === 'react') return runtime.react;
      if (name.endsWith('/useReceiveExternalTransfer')) return { useReceiveExternalTransfer: () => state };
      if (name.endsWith('/useExternalTransferIssuance')) return { useExternalTransferIssuance: () => emission };
      if (name.startsWith('./') || name.startsWith('../')) return { __esModule: true, default: name };
      return nodeRequire(name);
    });
    const tree = runtime.render(() => component.default({ turmaId: data.context.turmaId, poloId: data.context.poloId, canReceive: true,
      onClose: () => {}, onSaved: async () => {} }));
    const modal = React.Children.toArray(tree.props.children).find((entry) => entry.type === './ReceiveExternalTransferModal');
    modal.props.onConfirm(); modal.props.onConfirm();
    assert.deepEqual(calls, ['register']);
    release();
    await new Promise((resolve) => globalThis.setImmediate(resolve));
    assert.deepEqual(calls, confirmed ? ['register', 'issue'] : ['register']);
  }
});

test('hook captura somente C1 ou C2 inicial, materializa revisão e não repete POST após erro ambíguo', async () => {
  for (const cycleNumber of [1, 2]) {
    const data = fixture(cycleNumber);
    const runtime = hooksRuntime();
    const sent = [];
    const confirmation = await readFile(resolve(directory, '../financeiro/manual-technical-cycle-confirmation.ts'), 'utf8');
    const transpiled = await transform(confirmation, { loader: 'ts', format: 'cjs' });
    const confirmModule = { exports: {} };
    new Function('module', 'exports', transpiled.code)(confirmModule, confirmModule.exports);
    const hook = await compile('useExternalTransferIssuance.ts', (name) => {
      if (name === 'react') return runtime.react;
      if (name.endsWith('/external-transfer-issuance')) return { prepareExternalTransferIssuance };
      if (name.endsWith('/manual-technical-cycle-confirmation')) return confirmModule.exports;
      if (name.endsWith('/matricula-tecnica-financeiro.service')) return { matriculaTecnicaFinanceiroService: { getWorkspace: async () => data.workspace } };
      if (name.endsWith('/matricula-tecnica-ciclo-manual.service')) return { matriculaTecnicaCicloManualService: { preview: async () => data.response } };
      if (name.endsWith('/useMatriculaTecnicaCicloManual')) return { useGerarCicloFinanceiroTecnicoManual: () => ({ isPending: false,
        mutateAsync: async (input) => { sent.push(clone(input)); throw new Error('Resposta perdida após envio'); } }) };
      throw new Error(`Importação não prevista: ${name}`);
    });
    const render = () => runtime.render(() => hook.useExternalTransferIssuance(data.context, true));
    const first = render();
    await Promise.all([first.run(data.context.saved), first.run(data.context.saved)]);
    let current = render();
    assert.equal(sent.length, 1);
    assert.notEqual(sent[0].requestId, data.context.saved.requestId);
    assert.equal(sent[0].cicloNumero, cycleNumber);
    assert.equal(sent[0].revisao.itens.length, 2);
    assert.equal(sent[0].expectedCronogramaFingerprint, data.response.preview.cronogramaFingerprint);
    assert.equal(current.progress.requestId, sent[0].requestId);
    assert.equal(current.progress.cicloNumero, cycleNumber);
    assert.equal(current.completed, false);
    assert.match(current.error, /Resposta perdida/);
    data.row.cicloManual.proximoCicloNumero = 2;
    await current.run(data.context.saved);
    current = render();
    assert.equal(sent.length, 1);
    assert.equal(current.progress.cicloNumero, cycleNumber);
  }
});
