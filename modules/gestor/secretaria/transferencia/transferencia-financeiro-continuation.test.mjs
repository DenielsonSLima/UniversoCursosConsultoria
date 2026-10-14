import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { transform } from 'esbuild';
import React from 'react';

const nodeRequire = createRequire(import.meta.url);
const academic = '../../gestao/tecnicos/detalhes/components/academic/';
const compile = async (path, resolve) => {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const { code } = await transform(source, { loader: 'tsx', format: 'cjs' });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(resolve, module, module.exports);
  return module.exports.default;
};
const defaultModule = (value) => ({ __esModule: true, default: value });
const elements = (node) => !React.isValidElement(node) ? []
  : [node, ...React.Children.toArray(node.props.children).flatMap(elements)];
const text = (node) => React.isValidElement(node)
  ? React.Children.toArray(node.props.children).map(text).join('') : String(node ?? '');
const button = (tree, label) => elements(tree).find((node) => node.type === 'button' && text(node).includes(label));
const Stub = () => null;
const List = () => null;
const target = { poloId: 'polo-alvo', turmaId: 'turma-alvo', alunoId: 'aluno-alvo',
  matriculaId: 'matricula-salva', cursoNome: 'Curso sintético' };
const row = { matriculaId: target.matriculaId, alunoId: target.alunoId, alunoNome: 'Aluno sintético',
  matriculaExibicao: 'SINTETICA', totais: { total: '500.00', recebido: '100.00', inadimplencia: '0.00' } };
const workspace = () => ({
  turma: { turmaId: target.turmaId, poloId: target.poloId, nome: 'Turma sintética', codigo: 'SINT' },
  aluno: { alunoId: target.alunoId, nome: row.alunoNome }, matriculas: [structuredClone(row)],
  regra: { fingerprint: 'regra-canonica' },
  resumo: { total: '99999.00', recebido: '999.00', inadimplencia: '999.00',
    recebidoPercentual: '1.00', inadimplenciaPercentual: '1.00' },
});

const createPanel = async (data = workspace(), { allowed = true, settle = false, error = false } = {}) => {
  const calls = [];
  const query = { data, isLoading: false, isError: error, isFetching: false,
    refetch: async () => { calls.push(['retry', target.turmaId, target.alunoId]); } };
  const Panel = await compile('./SecretariaTransferenciaFinanceiro.tsx', (name) => {
    if (name === 'react') return { ...defaultModule(React), useState: () => [false, () => {}] };
    if (name === 'lucide-react') return nodeRequire(name);
    if (name.endsWith('external-transfer-access')) return { canReceivePlannedExternalTransfer: () => allowed };
    if (name.endsWith('FinanceiroAlunosList')) return defaultModule(List);
    if (name.endsWith('ciclo-manual-settlement-account')) return { canUseManualEnrollmentSettlement: () => settle };
    if (name.endsWith('useMatriculaTecnicaFinanceiro')) return {
      useMatriculaTecnicaFinanceiroWorkspace: (...args) => { calls.push(['workspace', ...args]); return query; },
    };
    if (name.endsWith('useMatriculaTecnicaFinanceiroRealtime')) return {
      useMatriculaTecnicaFinanceiroRealtime: (id) => calls.push(['realtime', id]),
    };
    throw new Error('Importação não isolada: ' + name);
  });
  const tree = Panel({ target, permissions: {}, onBack: () => calls.push(['back']) });
  return { tree, calls, query, list: elements(tree).find((item) => item.type === List) };
};

test('continuação individual reutiliza a lista canônica apenas com a matrícula salva e seus próprios totais', async () => {
  const data = workspace();
  const { tree, calls, list } = await createPanel(data);
  assert.deepEqual(calls, [['workspace', target.turmaId, target.alunoId, true], ['realtime', target.turmaId]]);
  assert.ok(list);
  assert.deepEqual(list.props.alunos, [data.matriculas[0]]);
  assert.strictEqual(list.props.resumo, data.matriculas[0].totais);
  assert.notStrictEqual(list.props.resumo, data.resumo);
  assert.equal(list.props.canSettleEnrollment, false);
  assert.equal(list.props.initialMatriculaId, undefined, 'Não oferecer mostrar todos os alunos no painel individual.');
  assert.equal(list.props.turma.poloId, target.poloId);
  assert.equal(list.props.turma.id, target.turmaId);
  assert.equal(list.props.valuesVisible, false);
  list.props.onRetry();
  button(tree, 'Concluir e voltar').props.onClick();
  assert.deepEqual(calls.slice(-2), [['retry', target.turmaId, target.alunoId], ['back']]);
  const permitted = await createPanel(workspace(), { settle: true });
  assert.equal(permitted.list.props.canSettleEnrollment, true);
});

test('resposta de outra identidade, matrícula ausente ou múltipla bloqueia todas as ações financeiras', async () => {
  const mutations = [
    (data) => { data.turma.turmaId = 'outra-turma'; },
    (data) => { data.turma.poloId = 'outro-polo'; },
    (data) => { data.aluno.alunoId = 'outro-aluno'; },
    (data) => { data.aluno = null; },
    (data) => { data.matriculas[0].alunoId = 'outro-aluno'; },
    (data) => { data.matriculas[0].matriculaId = 'outra-matricula'; },
    (data) => { data.matriculas = []; },
    (data) => { data.matriculas.push({ ...row, matriculaId: 'outra-matricula' }); },
  ];
  for (const mutate of mutations) {
    const data = workspace();
    mutate(data);
    const { tree, list } = await createPanel(data);
    assert.equal(list, undefined);
    assert.match(text(tree), /não corresponde à matrícula/);
  }
});

test('falha de leitura com cache não libera emissão e retry permanece na consulta individual', async () => {
  const { tree, calls, list } = await createPanel(workspace(), { error: true });
  assert.equal(list, undefined);
  assert.match(text(tree), /Atualize a consulta antes de continuar/);
  await button(tree, 'Tentar novamente').props.onClick();
  assert.deepEqual(calls.at(-1), ['retry', target.turmaId, target.alunoId]);
  const denied = await createPanel(workspace(), { allowed: false });
  assert.equal(denied.list, undefined);
  assert.deepEqual(denied.calls, [['workspace', target.turmaId, target.alunoId, false], ['realtime', '']]);
});

test('sucesso da transferência oferece emissão por matrícula persistida e emitir depois sem iniciar operação bancária', async () => {
  const calls = [];
  const result = { matriculaId: target.matriculaId, financeiro: {
    financeiro: { itens: Array.from({ length: 18 }, (_, index) => ({ itemId: String(index) })) },
    totais: { porCiclo: [{ cicloNumero: 1, quantidadeItens: 6 }, { cicloNumero: 2, quantidadeItens: 12 }] },
  } };
  const Controller = await compile(academic + 'ReceiveExternalTransferController.tsx', (name) => {
    if (name === 'react' || name === 'lucide-react') return nodeRequire(name);
    if (name.endsWith('useReceiveExternalTransfer')) return {
      useReceiveExternalTransfer: () => ({ result, canClose: true, canDismiss: () => true }),
    };
    return defaultModule(Stub);
  });
  const tree = Controller({ turmaId: target.turmaId, canReceive: true, onSaved: async () => {},
    onClose: () => calls.push(['close']), onOpenFinanceiro: (id) => calls.push(['open', id]) });
  assert.deepEqual(calls, []);
  assert.match(text(tree), /18 cobranças planejadas/);
  assert.match(text(tree), /1º ciclo: 6 cobranças planejadas/);
  assert.match(text(tree), /2º ciclo: 12 cobranças planejadas/);
  button(tree, 'Conferir e emitir BolePix').props.onClick();
  button(tree, 'Emitir depois').props.onClick();
  assert.deepEqual(calls, [['open', target.matriculaId], ['close']]);
});

test('Secretaria entrega o vínculo salvo ao painel e invalida o workspace financeiro da turma', async () => {
  const Controller = () => null;
  const Panel = () => null;
  const student = { id: target.alunoId, nome: row.alunoNome, cpf: null };
  const turma = { id: target.turmaId, nome: 'Turma sintética', codigo: 'SINT',
    cursoNome: target.cursoNome, cursoId: 'curso-alvo' };
  const states = ['receber', '', '', student, turma.cursoId, turma.id, { student, turma }, null];
  const refs = [];
  let stateIndex = 0;
  let refIndex = 0;
  const invalidated = [];
  const permissions = { marker: 'normalized-permissions' };
  const Page = await compile('./SecretariaTransferenciaPage.tsx', (name) => {
    if (name === 'react') return { ...defaultModule(React), Suspense: React.Suspense,
      lazy: (loader) => String(loader).includes('./SecretariaTransferenciaFinanceiro') ? Panel : Stub,
      useEffect: () => {}, useMemo: (fn) => fn(),
      useRef: (initial) => refs[refIndex++] ||= { current: initial },
      useState: () => {
        const index = stateIndex++;
        return [states[index], (next) => { states[index] = typeof next === 'function' ? next(states[index]) : next; }];
      },
    };
    if (name === 'lucide-react') return nodeRequire(name);
    if (name === '@tanstack/react-query') return {
      useQueryClient: () => ({ invalidateQueries: async (input) => { invalidated.push(input.queryKey); } }),
      useQuery: () => ({ data: [turma], isFetching: false, isError: false }),
    };
    if (name.endsWith('access-control')) return { normalizeGestorPermissions: () => permissions };
    if (name.endsWith('external-transfer-access')) return { canReceivePlannedExternalTransfer: () => true };
    if (name.endsWith('ReceiveExternalTransferController')) return defaultModule(Controller);
    if (name.endsWith('SecretariaTransferenciaFinanceiro')) return defaultModule(Panel);
    if (name.endsWith('academic-lifecycle.keys')) return { academicLifecycleKeys: { turma: (id) => ['academic', id] } };
    if (name.endsWith('matricula-tecnica-financeiro.keys')) return {
      matriculaTecnicaFinanceiroKeys: { turma: (id) => ['matricula-tecnica-financeiro', 'turma', id] },
    };
    if (name.endsWith('secretaria-documentos.keys')) return { secretariaDocumentosKeys: { all: ['secretaria-documentos'] } };
    if (name.endsWith('secretaria-documentos.catalogo')) return { secretariaDocumentosCatalogo: {} };
    if (name.endsWith('secretaria-documentos.definitions')) return { secretariaDocumentoDefinitions: {} };
    if (name.endsWith('secretaria-error')) return { getSecretariaErrorMessage: () => '' };
    if (name.endsWith('transferencia-destinos')) return {
      transferenciaCursoOptions: () => [], transferenciaTurmaOptions: () => [], transferenciaTurmasDoCurso: () => [],
    };
    return defaultModule(Stub);
  });
  const render = () => { stateIndex = 0; refIndex = 0; return Page({ poloId: target.poloId, gestorPermissions: {} }); };
  const receipt = elements(render()).find((item) => item.type === Controller);
  assert.ok(receipt);
  await receipt.props.onSaved();
  assert.ok(invalidated.some((key) => JSON.stringify(key) === JSON.stringify(['matricula-tecnica-financeiro', 'turma', target.turmaId])));
  receipt.props.onOpenFinanceiro(target.matriculaId);
  const next = elements(render()).find((item) => item.type === Panel);
  assert.ok(next);
  assert.deepEqual(next.props.target, target);
  assert.strictEqual(next.props.permissions, permissions);
  assert.equal(states[6], null, 'A transferência registrada não deve continuar aberta para outro registro.');
});
