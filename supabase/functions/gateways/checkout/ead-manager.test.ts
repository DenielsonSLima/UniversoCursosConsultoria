import assert from 'node:assert/strict';
import { buildEadCheckoutContext } from './ead-context.ts';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [courseId, alunoId, turmaId, poloId, actorId, matriculaId, attemptId, receivableId, tokenId] =
  Array.from({ length: 9 }, (_, n) => id(n + 1));

const runtime = (overrides: Record<string, unknown> = {}) => {
  const calls: any[] = [];
  const fixture: any = {
    staff: true, financial: true, polo: poloId, private: true, active: true,
    turma: turmaId, pix: true, ...overrides,
  };
  const resultFor = (table: string) => {
    if (table === 'usuarios_sistema') return fixture.staff ? {
      id: actorId, email: 'gestor@example.com', perfil: fixture.profile || 'gestor', status: fixture.staffStatus || 'ativo',
      polo_ids: fixture.global ? [] : [fixture.polo], permissoes: {
        modules: fixture.modules || (fixture.financial ? ['gestao', 'financeiro'] : ['gestao']),
        allPolos: fixture.global === true,
        ...(fixture.tabs ? { tabs: fixture.tabs } : {}),
      },
    } : null;
    if (table === 'cursos') return { id: courseId, nome: 'Curso sintético', modalidade: fixture.modalidade || 'EAD',
      valor: 129.9, publicar_site: !fixture.private, status: fixture.active ? 'ATIVO' : 'INATIVO',
      financeiro_config: { metodosRecebimento: { pix: fixture.pix, boleto: true, cartao: false } } };
    if (table === 'parceiros') return { id: alunoId, tipo: 'Aluno' };
    if (table === 'turmas') return [{ id: fixture.turma, curso_id: courseId, polo_id: poloId, matriculas: [] }];
    if (table === 'payment_gateway_runtime_config') return { enabled: true, active_environment: 'sandbox' };
    if (table === 'payment_gateway_routes') return [{ provider_code: 'banese_card', enabled: true,
      credential_id: id(20), environment: 'sandbox' }];
    throw new Error(`Tabela inesperada: ${table}`);
  };
  const query = (table: string) => {
    const response = { data: resultFor(table), error: null };
    const q: any = { select: () => q, eq: (key: string) => {
      if (table === 'parceiros' && key === 'auth_user_id') response.data = null;
      return q;
    }, neq: () => q, ilike: () => q, order: () => q,
      limit: () => q, maybeSingle: async () => response,
      then: (yes: any, no: any) => Promise.resolve(response).then(yes, no) };
    return q;
  };
  const value: any = {
    body: { courseId, alunoId, turmaId, method: 'BOLETO', managerEnrollment: true },
    req: new Request('https://example.com/checkout', { headers: { Authorization: 'Bearer synthetic' } }),
    admin: { from: query, auth: { getUser: async () => ({ data: { user: { id: actorId, email: 'gestor@example.com' } }, error: null }) },
      rpc: async (name: string, args: any) => {
        if (name === 'portal_identidade_institucional_acesso_liberado') return { data: true, error: null };
        calls.push({ name, args });
        return { data: { action: 'CREATE', matriculaId, attemptId, receivableId, inscricaoId: id(12), creationToken: tokenId,
          receivable: { id: receivableId, matricula_id: matriculaId, ead_checkout_attempt_id: attemptId,
            gateway_creation_token: tokenId, gateway_status: 'CREATING', valor: args.p_amount,
            data_vencimento: args.p_due_date, descricao: args.p_description } }, error: null };
      } },
  };
  return { value, calls };
};

Deno.test('gestor autorizado cobra curso EAD privado na turma selecionada e usa preço do backend', async () => {
  const { value, calls } = runtime();
  value.body.valor = 0.01;
  const context = await buildEadCheckoutContext(value);
  assert.equal(context?.managerEnrollment, true);
  assert.equal(context?.turma.id, turmaId);
  assert.equal(context?.charge.value, 129.9);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].args.p_manager_enrollment, true);
  assert.equal(calls[0].args.p_turma_id, turmaId);
  assert.equal(calls[0].args.p_aluno_id, alunoId);
});

Deno.test('gestor sem Financeiro, com Gestão/Alunos, reserva cobrança obrigatória pelo preço canônico', async () => {
  const { value, calls } = runtime({ financial: false, tabs: { gestao: ['alunos'] } });
  value.body.mode = 'SEM_COBRANCA';
  value.body.valor = 0;
  const context = await buildEadCheckoutContext(value);
  assert.equal(context?.managerEnrollment, true);
  assert.equal(context?.charge.value, 129.9);
  assert.equal(context?.matricula.id, matriculaId);
  assert.equal(context?.checkoutAttempt?.receivableId, receivableId);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].args.p_amount, 129.9);
  assert.equal(calls[0].args.p_manager_enrollment, true);
});

Deno.test('gestor global sem Financeiro pode matricular com cobrança na turma escolhida', async () => {
  const { value, calls } = runtime({ financial: false, global: true, tabs: { gestao: ['alunos'] } });
  const context = await buildEadCheckoutContext(value);
  assert.equal(context?.turma.id, turmaId);
  assert.equal(context?.checkoutAttempt?.receivableId, receivableId);
  assert.equal(calls[0].args.p_amount, 129.9);
  assert.equal(calls[0].args.p_turma_id, turmaId);
});

for (const [label, fixture, message] of [
  ['aluno não ganha privilégio enviando flag', { staff: false }, /interno ativo/],
  ['Financeiro isolado sem Gestão', { modules: ['financeiro'] }, /gestao nao autorizado/],
  ['Caixa isolado sem Gestão', { modules: ['caixa'] }, /gestao nao autorizado/],
  ['Gestão sem aba Alunos', { tabs: { gestao: ['resumo'] } }, /alunos.*nao autorizado/],
  ['Gestão com abas explicitamente vazias', { tabs: { gestao: [] } }, /alunos.*nao autorizado/],
  ['perfil não autorizado', { profile: 'professor' }, /alunos.*nao autorizado/],
  ['gestor inativo', { staffStatus: 'inativo' }, /interno ativo/],
  ['outra modalidade com a flag EAD', { modalidade: 'LIVRE' }, /exige um curso EAD/],
  ['polo de outra unidade', { polo: id(50) }, /polo/],
  ['curso inativo', { active: false }, /indisponivel/],
  ['turma diferente da selecionada', { turma: id(51) }, /turma selecionada/],
] as const) {
  Deno.test(`matrícula gestor bloqueia ${label} antes de reservar cobrança`, async () => {
    const { value, calls } = runtime(fixture);
    await assert.rejects(() => buildEadCheckoutContext(value), message);
    assert.equal(calls.length, 0);
  });
}

Deno.test('sem modo de matrícula EAD não amplia checkout de terceiro para gestor acadêmico', async () => {
  const { value, calls } = runtime({ financial: false, private: false });
  delete value.body.managerEnrollment;
  await assert.rejects(() => buildEadCheckoutContext(value), /movimentacao financeira/);
  assert.equal(calls.length, 0);
});

Deno.test('flag sem turma explícita não pode escolher outra turma automaticamente', async () => {
  const { value, calls } = runtime();
  delete value.body.turmaId;
  await assert.rejects(() => buildEadCheckoutContext(value), /aluno e a turma/);
  assert.equal(calls.length, 0);
});

Deno.test('aluno comum continua bloqueado para curso privado sem flag', async () => {
  const { value, calls } = runtime({ staff: false });
  delete value.body.managerEnrollment;
  await assert.rejects(() => buildEadCheckoutContext(value), /indisponivel/);
  assert.equal(calls.length, 0);
});

Deno.test('curso sem Pix permite boleto configurado para matrícula pelo gestor', async () => {
  const { value } = runtime({ pix: false });
  assert.equal((await buildEadCheckoutContext(value))?.charge.method, 'BOLETO');
});
