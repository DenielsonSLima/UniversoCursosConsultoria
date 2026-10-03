import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCandidatePageV2 } from './renegociacoes.candidates.ts';
import { renegociacoesQueryKeys } from './renegociacoes.queryKeys.ts';
import { renegociacaoErrorMessage } from './renegociacoes.presentation.ts';
import { withRenegociacaoReadDeadline } from './renegociacoes.read-request.ts';

const group = {
  poloId: 'polo-1', alunoId: 'aluno-1', alunoNome: 'Aluno de teste',
  matriculaId: 'matricula-1', matriculaCodigo: 'M-1', turmaId: 'turma-1', turmaNome: 'Turma de teste',
  courseType: 'TECNICO', policyKind: 'TECNICO', openCount: 6, eligibilityPending: true,
  eligibleCount: null, blockedCount: null, overdueCount: 4, futureCount: 2,
  principalCents: 60000, accruedInterestCents: null, accruedPenaltyCents: null, grossDebtCents: null,
  oldestDueDate: '2026-06-10', nextDueDate: '2026-10-10',
};
const page = () => ({
  version: 2, asOf: '2026-10-03', pageBy: 'STUDENT', page: 1, pageSize: 20,
  groups: [{ ...group }], totalGroups: 31, totalStudents: 28,
  filterOptions: {
    courseTypes: [{ id: 'TECNICO', label: 'Técnico' }],
    turmas: [{ id: 'turma-1', label: 'Turma de teste', courseType: 'TECNICO' }],
  },
});

test('listagem v2 preserva paginação por aluno e não inventa elegibilidade nem encargos', () => {
  const parsed = parseCandidatePageV2(page());
  assert.equal(parsed.totalStudents, 28);
  assert.equal(parsed.totalGroups, 31);
  assert.equal(parsed.pageBy, 'STUDENT');
  assert.equal(parsed.groups[0].openCount, 6);
  assert.equal(parsed.groups[0].eligibleCount, null);
  assert.equal(parsed.groups[0].grossDebtCents, null);
  assert.equal(parsed.groups[0].principalCents, 60000);
  assert.equal(parsed.filterOptions?.turmas[0].id, 'turma-1');
});

test('retorno vazio é válido e mantém opções completas dos filtros', () => {
  const raw = { ...page(), groups: [], totalStudents: 0, totalGroups: 0 };
  const parsed = parseCandidatePageV2(raw);
  assert.deepEqual(parsed.groups, []);
  assert.equal(parsed.filterOptions?.turmas.length, 1);
});

test('parser rejeita retorno antigo, metadados ausentes e valores não canônicos', () => {
  assert.throws(() => parseCandidatePageV2({ ...page(), version: 1 }), /por aluno/);
  assert.throws(() => parseCandidatePageV2({ ...page(), totalStudents: undefined }), /total de alunos/);
  assert.throws(() => parseCandidatePageV2({ ...page(), filterOptions: {} }), /tipos de curso/);
  assert.throws(() => parseCandidatePageV2({ ...page(), groups: [{ ...group, principalCents: null }] }), /principal/);
  assert.throws(() => parseCandidatePageV2({ ...page(), groups: [{ ...group, courseType: 'OUTRO' }] }), /tipo de curso/);
  assert.throws(() => parseCandidatePageV2({ ...page(), groups: [{ ...group, eligibleCount: 0 }] }), /elegibilidade/);
});

test('chaves isolam página, busca, polo, tipo e turma sem reaproveitar lista v1', () => {
  const key = renegociacoesQueryKeys.candidates('p1', 'Ana', 1, { courseType: 'TECNICO', turmaId: 't1' });
  for (const other of [
    renegociacoesQueryKeys.candidates('p2', 'Ana', 1, { courseType: 'TECNICO', turmaId: 't1' }),
    renegociacoesQueryKeys.candidates('p1', 'Bia', 1, { courseType: 'TECNICO', turmaId: 't1' }),
    renegociacoesQueryKeys.candidates('p1', 'Ana', 2, { courseType: 'TECNICO', turmaId: 't1' }),
    renegociacoesQueryKeys.candidates('p1', 'Ana', 1, { courseType: 'LIVRE', turmaId: 't1' }),
    renegociacoesQueryKeys.candidates('p1', 'Ana', 1, { courseType: 'TECNICO', turmaId: 't2' }),
  ]) assert.notDeepEqual(key, other);
  assert.ok(key.includes('v2'));
});

test('leitura tem prazo finito mesmo se o transporte não concluir', async () => {
  let captured: AbortSignal | undefined;
  const request = { abortSignal: (signal: AbortSignal) => {
    captured = signal;
    return new Promise<never>(() => {});
  } };
  await assert.rejects(withRenegociacaoReadDeadline(request, undefined, 5), /demorou/);
  assert.equal(captured?.aborted, true);
});

test('troca de filtro cancela transporte anterior e uma resposta rápida é preservada', async () => {
  const controller = new AbortController();
  let captured: AbortSignal | undefined;
  const pending = withRenegociacaoReadDeadline({ abortSignal: (signal) => {
    captured = signal;
    return new Promise<never>(() => {});
  } }, controller.signal);
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(captured?.aborted, true);
  assert.equal(await withRenegociacaoReadDeadline({ abortSignal: async () => 'ok' }), 'ok');
});

test('timeout do servidor e RPC ausente produzem erro acionável sem lista vazia falsa', () => {
  assert.match(renegociacaoErrorMessage({ code: '57014', message: 'canceling statement due to statement timeout' }), /tempo permitido/);
  assert.match(renegociacaoErrorMessage({ code: 'PGRST202' }), /consulta atualizada/);
});
