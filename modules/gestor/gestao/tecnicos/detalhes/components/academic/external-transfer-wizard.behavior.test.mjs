import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TransferHookRuntime, createModalRuntime, domain, findButton, settleAction } from './external-transfer-test-runtime.mjs';

const uuid = (value) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const turmaId = uuid(1);
const grade = { versao: 1, turmaId, cursoId: uuid(2), cursoNome: 'Curso de teste', modulos: [
  { id: uuid(3), nome: 'Módulo inicial', ordem: 1, disciplinas: [{ id: uuid(4), nome: 'Disciplina Z', ordem: 1, cargaHoraria: 40 }] },
  { id: uuid(5), nome: 'Módulo seguinte', ordem: 2, disciplinas: [{ id: uuid(6), nome: 'Disciplina A', ordem: 1, cargaHoraria: 60 }] },
  { id: uuid(7), nome: 'Módulo final', ordem: 3, disciplinas: [{ id: uuid(8), nome: 'Disciplina B', ordem: 1, cargaHoraria: 20 }] },
] };
const row = (id, cycle, type, order) => ({ itemId: uuid(id), cicloNumero: cycle, tipo: type, ordem: order,
  vencimento: cycle === 1 ? '2100-01-10' : '2101-01-10', valor: type === 'PARCELA' ? '200.00' : '150.00',
  descontoPontualidade: '0.00', jurosAtrasoPercentual: '0.000000', multaAtrasoPercentual: '0.000000',
});
const preview = (items) => ({
  versao: 3, regraFingerprint: 'regra-canonica', quantidadeMaxima: 60, maxCiclos: 2,
  financeiro: { versao: 3, itens: globalThis.structuredClone(items) },
  totais: { porCiclo: [1, 2].map((cycle) => ({ cicloNumero: cycle,
    totalNominal: items.filter((item) => item.cicloNumero === cycle).reduce((sum, item) => sum + Number(item.valor), 0).toFixed(2),
    quantidadeParcelas: items.filter((item) => item.cicloNumero === cycle && item.tipo === 'PARCELA').length,
    quantidadeItens: items.filter((item) => item.cicloNumero === cycle).length,
  })), totalNominal: items.reduce((sum, item) => sum + Number(item.valor), 0).toFixed(2) },
  regra: { valorMatricula: '150.00', valorMensalidade: '200.00', valorRematricula: '150.00',
    encargos: { descontoPontualidade: '0.00', jurosAtrasoPercentual: '0.000000', multaAtrasoPercentual: '0.000000' },
    aplicacao: { matricula: { desconto: false, multaJuros: false }, mensalidade: { desconto: false, multaJuros: false }, rematricula: { desconto: false, multaJuros: false } },
  }, avisos: [],
});
const defaults = preview([
  row(10, 1, 'MATRICULA', 1), ...Array.from({ length: 12 }, (_, index) => row(11 + index, 1, 'PARCELA', index + 2)),
  row(30, 2, 'REMATRICULA', 1), ...Array.from({ length: 12 }, (_, index) => row(31 + index, 2, 'PARCELA', index + 2)),
]);
const options = { turmaId, canReceive: true, initialStudent: { id: uuid(9), nome: 'Aluno sintético', cpf_cnpj: null }, onSaved: async () => {} };
const props = (state) => ({ ...state,
  onChange: state.change, studentFixed: true, destinationLabel: 'Curso de teste — Turma sintética',
  canConfirm: state.ready, onClose: () => {}, onConfirm: state.confirm,
  onRetry: state.retry, onRetryAcademic: state.retryAcademic, onRetryFinancial: state.retryFinancial,
  onBackToConfiguration: state.syncConfigurations, onFinancialConfigurationAdvance: state.configurePlan,
  onFinancialScheduleAdvance: state.reviewPlan, configurationSection: React.createElement('div', null, 'Configuração controlada'),
  scheduleSection: React.createElement('div', null, 'Lista editável'),
});
const setup = async (rpc, matrix = grade, context = defaults) => {
  const runtime = new TransferHookRuntime(options, matrix, context, rpc);
  await runtime.initialize();
  runtime.state.change('institution', 'Escola sintética');
  runtime.state.change('reason', 'Continuidade dos estudos');
  runtime.state.change('transferDate', '2000-01-01');
  return { runtime, state: runtime.render() };
};

test('footer real gera lista no avanço, preserva C1 quando C2 falha e permite retry/conferência automática', async () => {
  const calls = [];
  let rejectC2 = true;
  const { runtime } = await setup(async (name, args) => {
    calls.push({ name, args: globalThis.structuredClone(args) });
    const adjustment = args.p_ajuste;
    if (adjustment?.cicloNumero === 2 && rejectC2) {
      rejectC2 = false;
      return { data: null, error: { code: 'P0001', message: 'Falha simulada em C2' } };
    }
    let items = args.p_financeiro?.itens || defaults.financeiro.itens;
    if (adjustment?.quantidadeParcelas !== undefined) items = items.filter((item) => item.cicloNumero !== adjustment.cicloNumero
      || item.tipo !== 'PARCELA' || item.ordem <= adjustment.quantidadeParcelas + 1);
    return { data: preview(items), error: null };
  });
  runtime.state.change('credits', { [uuid(4)]: { selected: true, mediaFinal: '0', frequenciaPercent: '90', situacao: 'EQUIVALENCIA' } });
  let state = runtime.render();
  state.changeConfiguration(1, 'quantidadeParcelas', '5');
  state.changeConfiguration(1, 'periodicidade', 'DIAS_CORRIDOS_30');
  state.changeConfiguration(2, 'quantidadeParcelas', '7');
  state = runtime.render();
  const modal = await createModalRuntime();
  modal.step = 2;
  let tree = modal.render(props(state));
  assert.equal(findButton(tree, 'Gerar lista de cobranças').props.disabled, false);
  assert.equal(findButton(tree, 'Conferir cronograma financeiro'), undefined);
  findButton(tree, 'Gerar lista de cobranças').props.onClick();
  await settleAction();
  state = runtime.render();
  assert.equal(modal.step, 2);
  assert.match(state.error, /Falha simulada/);
  assert.equal(state.draft.items.filter((item) => item.cicloNumero === 1 && item.tipo === 'PARCELA').length, 5);
  assert.equal(state.draft.items.filter((item) => item.cicloNumero === 2 && item.tipo === 'PARCELA').length, 12);
  assert.deepEqual(state.configurations[1].changedKeys, []);
  assert.deepEqual(state.configurations[2].changedKeys, ['quantidadeParcelas']);
  tree = modal.render(props(state));
  assert.equal(findButton(tree, 'Gerar lista de cobranças').props.disabled, false);
  findButton(tree, 'Gerar lista de cobranças').props.onClick();
  await settleAction();
  state = runtime.render();
  assert.equal(modal.step, 3);
  assert.equal(calls.filter((call) => call.args.p_ajuste?.cicloNumero === 1).length, 1);
  assert.equal(calls.filter((call) => call.args.p_ajuste?.cicloNumero === 2).length, 2);
  assert.equal(state.draft.credits[uuid(4)].mediaFinal, '0');
  findButton(modal.render(props(state)), 'Conferir e revisar').props.onClick();
  await settleAction();
  state = runtime.render();
  assert.equal(modal.step, 4);
  assert.equal(calls.at(-1).args.p_ajuste, null);
  assert.equal(state.ready, true);
  state.change('items', domain.updateExternalTransferItem(state.draft.items, uuid(11), { valor: '75.00' }));
  state = runtime.render();
  assert.equal(state.review, null);
  assert.equal(state.ready, false);
  assert.equal(state.confirmationIssue.recovery, 'REVIEW');
  assert.equal(findButton(modal.render(props(state)), 'Registrar recebimento e plano').props.disabled, true);
});

test('avanço sem alterações consulta o cronograma; lista inválida tem caminho de reparo sem perder notas', async () => {
  const calls = [];
  const { runtime } = await setup(async (name, args) => {
    calls.push({ name, args }); return { data: preview(args.p_financeiro?.itens || defaults.financeiro.itens), error: null };
  });
  assert.equal(await runtime.state.configurePlan(), true);
  let state = runtime.render();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].args.p_ajuste, null);
  state.change('items', domain.updateExternalTransferItem(state.draft.items, uuid(11), { valor: '' }));
  state = runtime.render();
  state.syncConfigurations();
  state = runtime.render();
  const modal = await createModalRuntime();
  modal.step = 2;
  const tree = modal.render(props(state));
  assert.equal(findButton(tree, 'Gerar lista de cobranças').props.disabled, true);
  assert.equal(findButton(tree, 'Voltar à lista para corrigir').props.disabled, false);
  findButton(tree, 'Voltar à lista para corrigir').props.onClick();
  assert.equal(modal.step, 3);
  assert.equal(state.draft.institution, 'Escola sintética');
  assert.equal(state.draft.items.find((item) => item.itemId === uuid(11)).valor, '');
});

test('grade vazia confirmada permite seguir sem notas; falha concorrente aparece na revisão com recuperação', async () => {
  const empty = { ...grade, modulos: [] };
  const { runtime } = await setup(async (_, args) => ({ data: preview(args.p_financeiro?.itens || defaults.financeiro.itens), error: null }), empty);
  const modal = await createModalRuntime();
  modal.step = 1;
  assert.equal(findButton(modal.render(props(runtime.state)), 'Continuar para configuração').props.disabled, false);
  assert.equal(await runtime.state.reviewPlan(), true);
  let state = runtime.render();
  assert.equal(state.ready, true);
  const query = [...runtime.queries.values()].find((item) => item.data === empty);
  query.isError = true;
  query.error = new Error('Consulta recusada');
  state = runtime.render();
  assert.equal(state.ready, false);
  modal.step = 4;
  assert.equal(findButton(modal.render(props(state)), 'Recarregar e conferir as notas').props.disabled, false);
  assert.match(state.confirmationIssue.message, /Consulta recusada/);
});

test('notas exibem todos os módulos na ordem da matriz, preservam nota zero e explicitam módulo vazio', () => {
  const draft = domain.createExternalTransferDraft(uuid(9), '2000-01-01');
  draft.credits[uuid(4)] = { selected: true, mediaFinal: '0', frequenciaPercent: '90', situacao: 'EQUIVALENCIA' };
  const html = renderToStaticMarkup(React.createElement(domain.NotesFields, { draft, modules: grade.modulos,
    loading: false, error: null, disabled: false, onChange: () => {}, onRetry: () => {},
  }));
  assert.match(html, /3 módulos · 3 disciplinas/);
  assert.ok(html.indexOf('Módulo inicial') < html.indexOf('Módulo seguinte'));
  assert.ok(html.indexOf('Disciplina Z') < html.indexOf('Disciplina A'));
  assert.match(html, /value="0"/);
  assert.match(html, /value="90"/);
  const empty = renderToStaticMarkup(React.createElement(domain.NotesFields, { draft: { ...draft, credits: {} },
    modules: [{ ...grade.modulos[0], disciplinas: [] }], loading: false, error: null, disabled: false, onChange: () => {}, onRetry: () => {},
  }));
  assert.match(empty, /seguir sem aproveitamentos/);
  assert.match(empty, /Este módulo não possui disciplinas/);
});

test('rejeição definitiva recarrega a matriz e permite remover somente aproveitamentos que saíram da grade', async () => {
  const changedGrade = { ...grade, modulos: [{ ...grade.modulos[0], disciplinas: [] }, ...grade.modulos.slice(1)] };
  const calls = [];
  const { runtime } = await setup(async (name, args) => {
    calls.push(name);
    if (name === 'receber_transferencia_tecnica_v3_secure') return { data: null, error: { code: 'P0001', message: 'Disciplina saiu da matriz' } };
    if (name === 'get_grade_recebimento_transferencia_tecnica_secure') return { data: changedGrade, error: null };
    return { data: preview(args.p_financeiro?.itens || defaults.financeiro.itens), error: null };
  });
  const credit = { selected: true, mediaFinal: '0', frequenciaPercent: '90', situacao: 'EQUIVALENCIA' };
  runtime.state.change('credits', { [uuid(4)]: credit, [uuid(6)]: { ...credit, mediaFinal: '8.5' } });
  let state = runtime.render();
  await state.reviewPlan();
  state = runtime.render();
  assert.equal(state.ready, true);
  await state.confirm();
  await settleAction();
  state = runtime.render();
  assert.ok(calls.includes('get_grade_recebimento_transferencia_tecnica_secure'));
  assert.equal(state.ready, false);
  assert.equal(state.confirmationIssue.recovery, 'GRADE');
  const tree = domain.NotesFields({ draft: state.draft, modules: state.modules,
    loading: false, error: null, disabled: false, onChange: state.change, onRetry: state.retryAcademic,
  });
  findButton(tree, 'Remover somente os aproveitamentos fora da grade').props.onClick();
  state = runtime.render();
  assert.deepEqual(Object.keys(state.draft.credits), [uuid(6)]);
  assert.equal(state.draft.credits[uuid(6)].mediaFinal, '8.5');
  assert.equal(state.draft.institution, 'Escola sintética');
});

test('reselecionar o mesmo aluno preserva o recebimento conferido; trocar aluno reinicia os dados', async () => {
  const runtime = new TransferHookRuntime({ ...options, initialStudent: undefined }, grade, defaults,
    async (_, args) => ({ data: preview(args.p_financeiro?.itens || defaults.financeiro.itens), error: null }));
  await runtime.initialize();
  runtime.state.change('studentId', uuid(9));
  let state = runtime.render();
  state.change('institution', 'Escola sintética');
  state.change('reason', 'Continuidade dos estudos');
  state.change('notes', 'Observação individual');
  state.change('transferDate', '2000-01-01');
  state.change('credits', { [uuid(4)]: { selected: true, mediaFinal: '0', frequenciaPercent: '90', situacao: 'EQUIVALENCIA' } });
  state.change('items', domain.updateExternalTransferItem(state.draft.items, uuid(11), { valor: '123.45' }));
  state.changeConfiguration(1, 'periodicidade', 'DIAS_CORRIDOS_30');
  state = runtime.render();
  assert.equal(await state.configurePlan(), true);
  state = runtime.render();
  state.syncConfigurations();
  state = runtime.render();
  assert.equal(await state.reviewPlan(), true);
  state = runtime.render();
  assert.equal(state.ready, true);
  const before = globalThis.structuredClone({ draft: state.draft, configurations: state.configurations, review: state.review });
  const tree = domain.AcademicFields({ draft: state.draft, onChange: state.change,
    students: [options.initialStudent], studentFixed: false, loading: false, loadError: false, disabled: false, onRetry: () => {},
  });
  const picker = React.Children.toArray(tree.props.children).find((child) => child.props?.label === 'Aluno cadastrado');
  picker.props.onChange(uuid(9));
  state = runtime.render();
  assert.deepEqual({ draft: state.draft, configurations: state.configurations, review: state.review }, before);
  assert.equal(state.ready, true);
  assert.equal(state.canConfigure, true);
  assert.equal(state.canReview, true);
  assert.equal(state.confirmationIssue, null);

  state.change('studentId', uuid(90));
  state = runtime.render();
  assert.equal(state.draft.studentId, uuid(90));
  assert.equal(state.draft.institution, '');
  assert.equal(state.draft.reason, '');
  assert.equal(state.draft.notes, '');
  assert.deepEqual(state.draft.credits, {});
  assert.deepEqual(state.draft.items, defaults.financeiro.itens);
  assert.deepEqual(state.configurations, domain.createExternalTransferFinancialConfigurations(defaults));
  assert.equal(state.review, null);
  assert.equal(state.ready, false);
});

test('retorno JSONB mantém a revisão, inclusive sem cobranças; valor, data ou regra alterados bloqueiam registro', async () => {
  const jsonbPreview = (items) => ({ ...preview(items), financeiro: {
    itens: items.map((item) => Object.fromEntries(Object.entries(item).reverse())), versao: 3,
  } });
  for (const items of [defaults.financeiro.itens, []]) {
    const context = jsonbPreview(items);
    const { runtime } = await setup(async (_, args) => ({ data: jsonbPreview(args.p_financeiro.itens), error: null }), grade, context);
    const modal = await createModalRuntime();
    modal.step = 3;
    findButton(modal.render(props(runtime.state)), 'Conferir e revisar').props.onClick();
    await settleAction();
    let state = runtime.render();
    assert.equal(modal.step, 4);
    assert.ok(state.review, 'A ordem das chaves JSONB não deve invalidar o plano conferido.');
    assert.equal(state.ready, true);
    assert.equal(state.confirmationIssue, null);
    assert.equal(findButton(modal.render(props(state)), 'Registrar recebimento e plano').props.disabled, false);
    if (items.length) {
      const original = globalThis.structuredClone(state.draft.items);
      state.change('items', domain.updateExternalTransferItem(original, uuid(11), { valor: '200.01' }));
      state = runtime.render();
      assert.equal(state.review, null);
      assert.equal(state.ready, false);
      state.change('items', domain.updateExternalTransferItem(original, uuid(11), { vencimento: '2100-01-11' }));
      state = runtime.render();
      assert.equal(state.review, null);
      assert.equal(state.ready, false);
      state.change('items', original);
      state = runtime.render();
      assert.equal(state.ready, true);
    }
    const query = [...runtime.queries.entries()].find(([key]) => key.includes('recebimento-financeiro-v3'))[1];
    query.data = { ...query.data, regraFingerprint: 'regra-alterada' };
    state = runtime.render();
    assert.equal(state.ready, false);
    assert.equal(state.confirmationIssue.recovery, 'REVIEW');
  }
});
