import { createHandler } from './handler.ts';
import { sha256 } from './sync-observation.ts';

function assert(condition: unknown, message = 'assertion failed'): asserts condition {
  if (!condition) throw new Error(message);
}
function fixture(options: { profile?: string; modules?: string[]; allPolos?: boolean; noAuth?: boolean; dbError?: boolean; result?: unknown } = {}) {
  const calls: Array<{ name: string; action: string; actor: unknown; payload: Record<string, unknown> }> = [];
  const admin = {
    auth: { getUser: () => Promise.resolve(options.noAuth ? { error: true } : { data: { user: { id: 'auth-fixture', email: 'fixture@example.test' } } }) },
    from: () => ({ select: () => ({ ilike: () => ({ maybeSingle: () => Promise.resolve({ data: {
      id: 'gestor-fixture', email: 'fixture@example.test', perfil: options.profile || 'gestor', status: 'ativo',
      permissoes: { modules: options.modules || ['configuracoes'], allPolos: options.allPolos ?? true },
    } }) }) }) }),
    rpc: (name: string, parameters: Record<string, unknown>): Promise<{ data?: unknown; error?: { message: string } }> => {
      if (name === 'portal_identidade_institucional_acesso_liberado') return Promise.resolve({ data: true });
      const action = String(parameters.p_action);
      calls.push({ name, action, actor: parameters.p_actor_id, payload: parameters.p_payload as Record<string, unknown> });
      if (options.dbError) return Promise.resolve({ error: { message: 'SECRET_DATABASE_ARGUMENT' } });
      return Promise.resolve({ data: options.result ?? { configured: true, consultations: [] } });
    },
  };
  return { admin, calls };
}
const request = (body: unknown, authenticated = true) => new Request('https://local.example/proesc', {
  method: 'POST', headers: authenticated ? { Authorization: 'Bearer synthetic-session' } : {}, body: JSON.stringify(body),
});

Deno.test('bloqueia anônimo, sessão inválida, usuário restrito, perfil financeiro e gestor sem Configurações antes da RPC', async () => {
  for (const options of [{ noAuth: true }, { allPolos: false }, { profile: 'financeiro' }, { modules: [] }]) {
    const { admin, calls } = fixture(options);
    const response = await createHandler(admin)(request({ action: 'save_token', token: 'synthetic-token' }));
    assert(response.status >= 400 && calls.length === 0);
  }
  const { admin, calls } = fixture();
  const response = await createHandler(admin)(request({ action: 'status' }, false));
  assert(response.status === 401 && calls.length === 0);
});

Deno.test('configurações versionadas exigem gestor global antes de qualquer RPC ou acesso V2', async () => {
  for (const action of ['connection_status', 'save_connection', 'remove_connection', 'test_connection']) {
    for (const options of [{ noAuth: true }, { allPolos: false }, { profile: 'financeiro' }, { modules: [] }]) {
      const { admin, calls } = fixture(options);
      const response = await createHandler(admin, () => { throw new Error('network prohibited'); })(
        request({ action, version: 'v2', token: 'synthetic-v2-token' }));
      assert(response.status >= 400 && calls.length === 0);
    }
  }
});

Deno.test('endpoint versionado usa serviço próprio e legado não sobrescreve V1 com Bearer V2', async () => {
  const { admin, calls } = fixture({ result: { configured: true, wafConfigured: true, token: 'PRIVATE' } });
  const response = await createHandler(admin)(request({ action: 'connection_status', version: 'v2' }));
  assert(response.status === 200 && calls[0].name === 'proesc_connection_service');
  assert((calls[0].payload as { version: string }).version === 'v2');
  assert(!(await response.text()).includes('PRIVATE'));
  const legacy = fixture();
  const invalid = await createHandler(legacy.admin)(request({ action: 'save_token', token: 'synthetic-v2-token' }));
  assert(invalid.status === 400 && legacy.calls.length === 0);
});

Deno.test('credencial nunca é retornada no cadastro e nenhum erro do banco expõe parâmetros', async () => {
  const { admin, calls } = fixture({ result: { token: 'synthetic-token', secret_id: 'secret', configured: true } });
  const response = await createHandler(admin)(request({ action: 'save_token', token: 'Bearer ' + 'a'.repeat(32) }));
  assert(response.status === 200);
  assert(calls[0].payload.token === 'a'.repeat(32));
  assert(!(await response.text()).includes('synthetic-token'));
  for (const action of ['save_token', 'remove_token', 'status', 'class_history']) {
    const failure = await createHandler(fixture({ dbError: true }).admin)(request({ action, token: 'a'.repeat(32) }));
    assert(failure.status === 409 && !(await failure.text()).includes('SECRET_DATABASE'));
  }
});

Deno.test('ações internas são recusadas com 403 antes de RPC ou rede mesmo com flags de serviço forjadas', async () => {
  let networkCalls = 0;
  const transport: typeof fetch = () => { networkCalls++; throw new Error('Rede proibida'); };
  for (const action of ['start', 'advance', 'page', 'history_t42', 'test', 'token', 'context',
    'commit_page', 'import', 'settle', 'debits/create', 'unknown', '', '__proto__']) {
    const { admin, calls } = fixture();
    const response = await createHandler(admin, transport)(request({ action,
      id: '00000000-0000-0000-0000-000000000001', internal: true, role: 'service_role',
      p_action: 'token', p_actor_id: 'forged', resource: 'invoices',
      filters: { start: '2025-01', end: '2025-12' } }));
    assert(response.status === 403 && calls.length === 0, `Ação exposta: ${action}`);
  }
  assert(networkCalls === 0);
});

Deno.test('status projeta somente configuração e data sem páginas, identificadores ou segredo', async () => {
  const { admin, calls } = fixture({ result: { configured: true, updatedAt: '2026-09-12T12:00:00Z',
    token: 'synthetic-secret', revision: 'private-revision', consultations: [{ id: 'private-run' }], totalConsultations: 42 } });
  const response = await createHandler(admin)(request({ action: 'status', offset: 42, p_action: 'token' }));
  const data = await response.json();
  assert(response.status === 200 && response.headers.get('Cache-Control') === 'no-store');
  assert(JSON.stringify(data) === JSON.stringify({ configured: true, updatedAt: '2026-09-12T12:00:00Z' }));
  assert(calls.length === 1 && calls[0].action === 'status' && Object.keys(calls[0].payload).length === 0);
});

Deno.test('remoção retorna apenas configuração desativada e não repassa payload do cliente', async () => {
  const { admin, calls } = fixture({ result: { configured: false, token: 'synthetic-secret' } });
  const response = await createHandler(admin)(request({ action: 'remove_token', token: 'ignored', p_action: 'token' }));
  assert(JSON.stringify(await response.json()) === '{"configured":false}');
  assert(Object.keys(calls[0].payload).length === 0);
});

Deno.test('histórico usa somente RPC de projeção com ações fixas e ator autenticado', async () => {
  let networkCalls = 0;
  const transport: typeof fetch = () => { networkCalls++; throw new Error('Rede proibida'); };
  const classId = '00000000-0000-0000-0000-000000000001';
  for (const [action, internalAction, payload] of [
    ['class_history', 'list', { offset: 20 }],
    ['class_events', 'events', { classId, offset: 20 }],
  ] as const) {
    const { admin, calls } = fixture({ result: { events: [], total: 0 } });
    const response = await createHandler(admin, transport)(request({ action, classId, offset: 20,
      p_action: 'commit_page', p_actor_id: 'forged', internal: true, token: 'ignored' }));
    assert(response.status === 200 && calls.length === 1);
    assert(calls[0].name === 'proesc_class_history_service' && calls[0].action === internalAction);
    assert(calls[0].actor === 'gestor-fixture');
    assert(JSON.stringify(calls[0].payload) === JSON.stringify(payload));
  }
  assert(networkCalls === 0);
});

Deno.test('valida paginação e UUID antes de consultar histórico', async () => {
  for (const offset of [-1, 0.5, '20', 100001, {}, []]) {
    for (const action of ['class_history', 'class_events']) {
      const { admin, calls } = fixture();
      const response = await createHandler(admin)(request({ action, offset,
        classId: '00000000-0000-0000-0000-000000000001' }));
      assert(response.status === 400 && calls.length === 0);
    }
  }
  for (const classId of ['', null, 1, '00000000---------------------------1',
    '00000000-0000-0000-0000-000000000001-extra']) {
    const { admin, calls } = fixture();
    const response = await createHandler(admin)(request({ action: 'class_events', classId }));
    assert(response.status === 400 && calls.length === 0);
  }
  for (const offset of [0, 100000]) {
    const { admin, calls } = fixture();
    const response = await createHandler(admin)(request({ action: 'class_history', offset }));
    assert(response.status === 200 && calls[0].payload.offset === offset);
  }
});

Deno.test('credenciais inválidas e caracteres de controle nunca chegam à RPC', async () => {
  for (const token of ['', 'short', 'synthetic token', 'synthetic-\u0000token', 'x'.repeat(8193)]) {
    const { admin, calls } = fixture();
    const response = await createHandler(admin)(request({ action: 'save_token', token }));
    assert(response.status === 400 && calls.length === 0);
  }
});

Deno.test('testar token usa credencial do servidor e ignora parâmetros operacionais do cliente', async () => {
  const { admin, calls } = fixture({ result: { token: 'b'.repeat(32), revision: 'revision-a' } });
  let networkCalls = 0;
  const transport: typeof fetch = (url, options) => {
    networkCalls++;
    assert(String(url).startsWith('https://app.proesc.com/api/v1/'));
    assert(new Headers(options?.headers).get('Authorization') === null);
    assert(new URL(String(url)).searchParams.get('token') === 'b'.repeat(32));
    return Promise.resolve(Response.json(networkCalls === 1
      ? { status: 'success', units: [{ id: 1, unidade: 'Synthetic' }], academic_years: [], categories: [] }
      : { status: 'success', data: [] }));
  };
  const response = await createHandler(admin, transport)(request({ action: 'test_token', token: 'forged-client-token',
    resource: 'debits', p_action: 'commit_page', filters: { start: '2000-01' } }));
  const body = await response.json();
  assert(response.status === 200 && body.ok && networkCalls === 2);
  assert(calls.length === 2 && calls.every((call) => call.action === 'token' && Object.keys(call.payload).length === 0));
  assert(!JSON.stringify(body).includes('b'.repeat(32)));
});

Deno.test('probe interno exige segredo validado pela RPC privada antes de acessar a credencial', async () => {
  for (const action of ['internal_probe', 'internal_accounting_probe', 'internal_data_probe']) for (const key of ['', 'forged', 'a'.repeat(64)]) {
    const { admin, calls } = fixture({ dbError: true });
    let networkCalls = 0;
    const req = request({ action, internal: true, role: 'service_role' });
    req.headers.set('X-Proesc-Worker-Secret', key);
    const response = await createHandler(admin, () => { networkCalls++; throw new Error('forbidden'); })(req);
    assert(response.status === 403 && networkCalls === 0);
    assert(!calls.some((call) => call.action === 'token'));
  }
});

Deno.test('probe de dados interno usa V2 pessoas e ignora versão ou operação financeira forjada', async () => {
  const { admin } = fixture();
  admin.rpc = (name, args) => {
    if (name === 'proesc_internal_probe_service') return Promise.resolve({ data: { actorId: 'worker-actor' } });
    assert(name === 'proesc_connection_service' && args.p_actor_id === 'worker-actor');
    assert(args.p_action === 'credential' && (args.p_payload as { version: string }).version === 'v2');
    return Promise.resolve({ data: { token: 'synthetic-v2-token', revision: 'r1', wafHeader: null } });
  };
  let calls = 0;
  const transport: typeof fetch = (input) => {
    calls++;
    assert(new URL(String(input)).pathname === '/api/v2/people');
    return Promise.resolve(Response.json({ data: [] }));
  };
  const req = request({ action: 'internal_data_probe', version: 'v1', resource: 'invoices' }, false);
  req.headers.set('X-Proesc-Worker-Secret', 'a'.repeat(64));
  const response = await createHandler(admin, transport)(req);
  assert(response.status === 200 && (await response.json()).ok && calls === 1);
});

Deno.test('sincronização exige segredo próprio e autorização interna antes de obter lote ou token', async () => {
  for (const key of ['', 'forged', 'a'.repeat(64)]) {
    const { admin, calls } = fixture({ dbError: true });
    let networkCalls = 0;
    const req = request({ action: 'internal_sync', internal: true, role: 'service_role' });
    req.headers.set('X-Proesc-Sync-Secret', key);
    const response = await createHandler(admin, () => { networkCalls++; throw new Error('Rede proibida'); })(req);
    assert(response.status === 403 && networkCalls === 0);
    assert(calls.every((call) => call.name === 'proesc_sync_runtime_service' && call.action === 'authorize'));
    assert(!calls.some((call) => ['token', 'claim'].includes(call.action)));
  }
  const { admin, calls } = fixture();
  const baseRpc = admin.rpc;
  const claims: string[] = [];
  admin.rpc = (name, args) => {
    if (name === 'proesc_sync_runtime_service' && args.p_action === 'authorize') {
      return Promise.resolve({ data: { actorId: 'worker-actor' } });
    }
    if (args.p_action === 'claim') {
      assert(args.p_actor_id === 'worker-actor');
      claims.push(name);
      return Promise.resolve({ data: { claimed: false } });
    }
    return baseRpc(name, args);
  };
  const req = request({ action: 'internal_sync' }, false);
  req.headers.set('X-Proesc-Sync-Secret', 'a'.repeat(64));
  const response = await createHandler(admin, () => { throw new Error('Rede proibida'); })(req);
  assert(response.status === 200
    && JSON.stringify(await response.json()) === '{"claimed":false,"cycleReview":{"claimed":false}}');
  assert(claims.sort().join(',') === 'proesc_cycle_review_runtime_service,proesc_sync_runtime_service');
  assert(!calls.some((call) => call.action === 'token'));
});

Deno.test('falha do worker de ciclos não interrompe a sincronização normal nem expõe erro interno', async () => {
  const { admin } = fixture();
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const token = 'b'.repeat(32);
  const personHash = await sha256('12345678901');
  admin.rpc = (name, args) => {
    calls.push({ name, args });
    if (name === 'proesc_sync_runtime_service' && args.p_action === 'authorize') {
      return Promise.resolve({ data: { actorId: 'worker-actor' } });
    }
    assert(args.p_actor_id === 'worker-actor', 'As duas rotinas devem usar o ator autorizado no servidor');
    if (name === 'proesc_cycle_review_runtime_service') {
      assert(args.p_action === 'claim');
      return Promise.reject(new Error('SECRET_CYCLE_DATABASE_ARGUMENT'));
    }
    if (name === 'proesc_sync_runtime_service' && args.p_action === 'claim') {
      return Promise.resolve({ data: { claimed: true, leaseId: 'sync-lease', lastId: 'link', links: [{
        linkId: 'link', classId: 'class', unitId: '1', sourceClassId: '2', externalKey: '3',
        receivableId: 'receipt', personHash, dueDate: '2025-01-15', principalCents: 10000,
        status: 'PENDENTE', paidCents: 0, paymentDate: null, expectedBefore: 'before-hash',
      }] } });
    }
    if (name === 'proesc_workspace_service') return Promise.resolve({ data: { token, revision: 'one' } });
    if (name === 'proesc_record_financial_snapshot_service') return Promise.resolve({ data: { snapshotId: 'snapshot' } });
    if (name === 'proesc_apply_financial_snapshot_service') return Promise.resolve({ data: { result: 'APPLIED' } });
    assert(name === 'proesc_sync_runtime_service' && args.p_action === 'finish');
    return Promise.resolve({ data: { finished: true } });
  };
  const transport: typeof fetch = (input, init) => {
    const url = new URL(String(input));
    assert(url.origin === 'https://app.proesc.com' && url.pathname === '/api/v1/accounting_data');
    assert(init?.method === 'GET' && init.redirect === 'error' && url.searchParams.get('token') === token);
    const common = { chave_id: '3', unidade_id: '1', turma_id: '2', aluno_cpf: '12345678901',
      data_vencimento: '2025-01-15', registro_cancelado: false, pagamento_renegociacao: false };
    const originalPeriod = url.searchParams.get('ano_letivo') === '2025' && url.searchParams.get('mes') === '01';
    return Promise.resolve(Response.json({ status: 'success', data: originalPeriod ? [
      { ...common, id: 1, valor: '100.00', data_pagamento: null },
      { ...common, id: 2, valor: '100.00', data_pagamento: '2025-01-10' },
    ] : [] }));
  };
  const req = request({ action: 'internal_sync' }, false);
  req.headers.set('X-Proesc-Sync-Secret', 'a'.repeat(64));
  const response = await createHandler(admin, transport)(req);
  const body = await response.json();
  assert(response.status === 200 && body.claimed && body.consulted === 1 && body.applied === 1 && body.failed === 0);
  assert(body.cycleReview.success === false && body.cycleReview.message === 'A consulta automática será retomada.');
  const finish = calls.find((call) => call.name === 'proesc_sync_runtime_service' && call.args.p_action === 'finish');
  const payload = finish?.args.p_payload as Record<string, unknown>;
  assert(payload.success === true && payload.completedCount === 1 && payload.leaseId === 'sync-lease');
  for (const forbidden of [token, '12345678901', 'SECRET_CYCLE_DATABASE_ARGUMENT']) {
    assert(!JSON.stringify(body).includes(forbidden));
  }
});
