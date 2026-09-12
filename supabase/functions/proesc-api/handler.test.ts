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
    rpc: (name: string, parameters: Record<string, unknown>) => {
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

Deno.test('credencial nunca é retornada no cadastro e nenhum erro do banco expõe parâmetros', async () => {
  const { admin, calls } = fixture({ result: { token: 'synthetic-token', secret_id: 'secret', configured: true } });
  const response = await createHandler(admin)(request({ action: 'save_token', token: 'Bearer synthetic-token' }));
  assert(response.status === 200);
  assert(calls[0].payload.token === 'synthetic-token');
  assert(!(await response.text()).includes('synthetic-token'));
  for (const action of ['save_token', 'remove_token', 'status', 'class_history']) {
    const failure = await createHandler(fixture({ dbError: true }).admin)(request({ action, token: 'synthetic-token' }));
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
  const { admin, calls } = fixture({ result: { token: 'synthetic-server-token', revision: 'revision-a' } });
  let networkCalls = 0;
  const transport: typeof fetch = (url, options) => {
    networkCalls++;
    assert(String(url).startsWith('https://api.proesc.com/api/v2/'));
    assert(new Headers(options?.headers).get('Authorization') === 'Bearer synthetic-server-token');
    return Promise.resolve(Response.json({ data: [] }));
  };
  const response = await createHandler(admin, transport)(request({ action: 'test_token', token: 'forged-client-token',
    resource: 'debits', p_action: 'commit_page', filters: { start: '2000-01' } }));
  const body = await response.json();
  assert(response.status === 200 && body.ok && networkCalls === 2);
  assert(calls.length === 2 && calls.every((call) => call.action === 'token' && Object.keys(call.payload).length === 0));
  assert(!JSON.stringify(body).includes('synthetic-server-token'));
});

Deno.test('probe interno exige segredo validado pela RPC privada antes de acessar a credencial', async () => {
  for (const key of ['', 'forged', 'a'.repeat(64)]) {
    const { admin, calls } = fixture({ dbError: true });
    let networkCalls = 0;
    const req = request({ action: 'internal_probe', internal: true, role: 'service_role' });
    req.headers.set('X-Proesc-Worker-Secret', key);
    const response = await createHandler(admin, () => { networkCalls++; throw new Error('forbidden'); })(req);
    assert(response.status === 403 && networkCalls === 0);
    assert(!calls.some((call) => call.action === 'token'));
  }
});

Deno.test('sincronização exige segredo próprio e autorização interna antes de obter lote ou token', async () => {
  for (const key of ['', 'forged', 'a'.repeat(64)]) {
    const { admin, calls } = fixture({ dbError: true });
    const req = request({ action: 'internal_sync', internal: true, role: 'service_role' });
    req.headers.set('X-Proesc-Sync-Secret', key);
    const response = await createHandler(admin, () => { throw new Error('Rede proibida'); })(req);
    assert(response.status === 403);
    assert(calls.every((call) => call.name === 'proesc_sync_runtime_service' && call.action === 'authorize'));
    assert(!calls.some((call) => ['token', 'claim'].includes(call.action)));
  }
  const { admin, calls } = fixture();
  const baseRpc = admin.rpc;
  admin.rpc = (name, args) => args.p_action === 'authorize'
    ? Promise.resolve({ data: { actorId: 'worker-actor' } })
    : args.p_action === 'claim' ? Promise.resolve({ data: { claimed: false } }) : baseRpc(name, args);
  const req = request({ action: 'internal_sync' }, false);
  req.headers.set('X-Proesc-Sync-Secret', 'a'.repeat(64));
  const response = await createHandler(admin, () => { throw new Error('Rede proibida'); })(req);
  assert(response.status === 200 && JSON.stringify(await response.json()) === '{"claimed":false}');
  assert(!calls.some((call) => call.action === 'token'));
});
