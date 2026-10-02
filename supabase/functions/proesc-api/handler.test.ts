import { createHandler } from './handler.ts';

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

Deno.test('histórico técnico exige sessão e gestor global de Configurações antes de buscar arquivo', async () => {
  for (const options of [{ noAuth: true }, { allPolos: false }, { profile: 'financeiro' }, { modules: [] }]) {
    const { admin, calls } = fixture(options);
    const response = await createHandler(admin)(request({ action: 'technical_history',
      runId: '11111111-1111-4111-8111-111111111111' }));
    assert(response.status >= 400 && calls.length === 0);
  }
});

Deno.test('histórico técnico usa ator autenticado e não repassa parâmetros de serviço forjados', async () => {
  const runId = '11111111-1111-4111-8111-111111111111';
  const { admin, calls } = fixture({ result: { runId, poloId: null, items: [], http: [], reusedCounts: [] } });
  const response = await createHandler(admin)(request({ action: 'technical_history', runId,
    p_actor_id: 'forged', p_payload_text: 'forged', bucket: 'public' }));
  assert(response.status === 200 && calls.length === 1);
  assert(calls[0].name === 'proesc_technical_history_service' && calls[0].actor === 'gestor-fixture');
  const body = await response.json();
  assert(body.runId === runId && body.archive === undefined && response.headers.get('Cache-Control') === 'no-store');
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
  assert(invalid.status === 410 && legacy.calls.length === 0);
});

Deno.test('credencial nunca é retornada no cadastro e nenhum erro do banco expõe parâmetros', async () => {
  const { admin, calls } = fixture({ result: { token: 'synthetic-token', secret_id: 'secret', configured: true } });
  const response = await createHandler(admin)(request({ action: 'save_connection', version: 'v2', token: 'Bearer synthetic-v2-token' }));
  assert(response.status === 200);
  assert(calls[0].payload.token === 'synthetic-v2-token');
  assert(!(await response.text()).includes('synthetic-token'));
  for (const action of ['save_connection', 'remove_connection', 'status', 'class_history']) {
    const failure = await createHandler(fixture({ dbError: true }).admin)(request({ action, version: 'v2', token: 'synthetic-v2-token' }));
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
  assert(calls.length === 1 && calls[0].name === 'proesc_connection_service' && calls[0].action === 'status');
  assert(JSON.stringify(calls[0].payload) === '{"version":"v2"}');
});

Deno.test('remoção retorna apenas configuração desativada e não repassa payload do cliente', async () => {
  const { admin, calls } = fixture({ result: { configured: false, token: 'synthetic-secret' } });
  const response = await createHandler(admin)(request({ action: 'remove_connection', version: 'v2', token: 'ignored', p_action: 'token' }));
  assert(JSON.stringify(await response.json()) === '{"version":"v2","configured":false}');
  assert(JSON.stringify(calls[0].payload) === '{"version":"v2"}');
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
    const response = await createHandler(admin)(request({ action: 'save_connection', version: 'v2', token }));
    assert(response.status === 400 && calls.length === 0);
  }
});

Deno.test('testar token usa credencial do servidor e ignora parâmetros operacionais do cliente', async () => {
  const { admin, calls } = fixture({ result: { token: 'synthetic-v2-token', revision: 'revision-a' } });
  let networkCalls = 0;
  const transport: typeof fetch = (url, options) => {
    networkCalls++;
    assert(String(url).startsWith('https://api.proesc.com/api/v2/people'));
    assert(new Headers(options?.headers).get('Authorization') === 'Bearer synthetic-v2-token');
    assert(!new URL(String(url)).searchParams.has('token'));
    return Promise.resolve(Response.json({ data: [] }));
  };
  const response = await createHandler(admin, transport)(request({ action: 'test_token', token: 'forged-client-token',
    resource: 'debits', p_action: 'commit_page', filters: { start: '2000-01' } }));
  const body = await response.json();
  assert(response.status === 200 && body.ok && body.version === 'v2' && networkCalls === 1);
  assert(calls.length === 2 && calls.every((call) => call.action === 'credential' && call.payload.version === 'v2'));
  assert(!JSON.stringify(body).includes('synthetic-v2-token'));
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
    const req = request({ action: 'internal_v2_sync', internal: true, role: 'service_role' });
    req.headers.set('X-Proesc-Sync-Secret', key);
    const response = await createHandler(admin, () => { networkCalls++; throw new Error('Rede proibida'); })(req);
    assert(response.status === 403 && networkCalls === 0);
    assert(calls.every((call) => call.name === 'proesc_v2_worker_service' && call.action === 'authorize'));
    assert(!calls.some((call) => ['token', 'claim'].includes(call.action)));
  }
  const { admin, calls } = fixture();
  const baseRpc = admin.rpc;
  const claims: string[] = [];
  admin.rpc = (name, args) => {
    if (name === 'proesc_v2_worker_service' && args.p_action === 'authorize') {
      return Promise.resolve({ data: { actorId: 'worker-actor' } });
    }
    if (args.p_action === 'claim') {
      assert(args.p_actor_id === 'worker-actor');
      claims.push(name);
      return Promise.resolve({ data: { claimed: false } });
    }
    return baseRpc(name, args);
  };
  const req = request({ action: 'internal_v2_sync' }, false);
  req.headers.set('X-Proesc-Sync-Secret', 'a'.repeat(64));
  const response = await createHandler(admin, () => { throw new Error('Rede proibida'); })(req);
  const body = await response.json();
  assert(response.status === 200 && body.version === 'v2' && body.claimed === false && body.failed === 0);
  assert(claims.join(',') === 'proesc_v2_runtime_service');
  assert(!calls.some((call) => call.action === 'token'));
});

Deno.test('falha SQL do worker V2 fica sanitizada e nenhuma rotina V1 é executada', async () => {
  const { admin } = fixture();
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  admin.rpc = (name, args) => {
    calls.push({ name, args });
    if (name === 'proesc_v2_worker_service' && args.p_action === 'authorize') {
      return Promise.resolve({ data: { actorId: 'worker-actor' } });
    }
    assert(args.p_actor_id === 'worker-actor' && name === 'proesc_v2_runtime_service');
    assert(args.p_action === 'claim');
    return Promise.reject(new Error('SECRET_CYCLE_DATABASE_ARGUMENT'));
  };
  const transport: typeof fetch = () => { throw new Error('Network prohibited'); };
  const req = request({ action: 'internal_v2_sync' }, false);
  req.headers.set('X-Proesc-Sync-Secret', 'a'.repeat(64));
  const response = await createHandler(admin, transport)(req);
  const body = await response.json();
  assert(response.status === 200 && body.version === 'v2' && body.pages === 0 && body.failed === 1);
  assert(calls.length === 2 && !JSON.stringify(body).includes('SECRET_CYCLE_DATABASE_ARGUMENT'));
});

Deno.test('ações V1 aposentadas retornam410 sem obtercredencial ou consultarfornecedor', async () => {
  for (const action of ['save_token', 'remove_token', 'internal_sync', 'internal_accounting_probe']) {
    const { admin, calls } = fixture({ result: { actorId: 'retirement-actor' } });
    let requests = 0;
    const req = request({ action });
    req.headers.set('X-Proesc-Sync-Secret', 'a'.repeat(64));
    req.headers.set('X-Proesc-Worker-Secret', 'a'.repeat(64));
    const response = await createHandler(admin, () => { requests++; throw new Error('No network'); })(req);
    assert(response.status === 410 && requests === 0);
    assert(calls.every((call) => call.action === 'authorize'));
  }
});

Deno.test('ciclosV2 usa RPC da matrícula/turma com ator real semrede nem necessidade gestorglobal', async () => {
  const scopeId = '00000000-0000-4000-8000-000000000999';
  for (const action of ['review_cycles', 'review_class_cycles']) {
    const { admin } = fixture({ allPolos: false, modules: ['academico'] });
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const rpc = admin.rpc;
    admin.rpc = (name, args) => {
      if (name === 'portal_identidade_institucional_acesso_liberado') return rpc(name, args);
      calls.push({ name, args });
      return Promise.resolve({ data: { reviewed: true } });
    };
    const response = await createHandler(admin, () => { throw new Error('Network prohibited'); })(request({
      action, matriculaId: scopeId, turmaId: scopeId, p_actor_id: 'forged', p_action: 'import',
    }));
    assert(response.status === 200 && calls.length === 1);
    assert(calls[0].name === (action === 'review_cycles' ? 'proesc_v2_cycle_review_service' : 'proesc_v2_class_cycle_review_service'));
    assert(calls[0].args.p_actor_id === 'gestor-fixture');
    assert(Object.keys(calls[0].args).length === 2);
  }
});
