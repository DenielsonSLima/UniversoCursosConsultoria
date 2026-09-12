import { createHandler } from './handler.ts';

function assert(condition: unknown, message = 'assertion failed'): asserts condition {
  if (!condition) throw new Error(message);
}
function fixture(options: { profile?: string; modules?: string[]; allPolos?: boolean; noAuth?: boolean; dbError?: boolean } = {}) {
  const calls: Array<{ action: string; payload: Record<string, unknown> }> = [];
  const admin = {
    auth: { getUser: () => Promise.resolve(options.noAuth ? { error: true } : { data: { user: { id: 'auth-fixture', email: 'fixture@example.test' } } }) },
    from: () => ({ select: () => ({ ilike: () => ({ maybeSingle: () => Promise.resolve({ data: {
      id: 'gestor-fixture', email: 'fixture@example.test', perfil: options.profile || 'gestor', status: 'ativo',
      permissoes: { modules: options.modules || ['configuracoes'], allPolos: options.allPolos ?? true },
    } }) }) }) }),
    rpc: (name: string, parameters: Record<string, unknown>) => {
      if (name === 'portal_identidade_institucional_acesso_liberado') return Promise.resolve({ data: true });
      const action = String(parameters.p_action);
      calls.push({ action, payload: parameters.p_payload as Record<string, unknown> });
      if (options.dbError) return Promise.resolve({ error: { message: 'SECRET_DATABASE_ARGUMENT' } });
      if (action === 'token') return Promise.resolve({ data: { token: 'synthetic-token', revision: 'revision-1' } });
      return Promise.resolve({ data: { configured: true, consultations: [] } });
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
  const { admin, calls } = fixture();
  const response = await createHandler(admin)(request({ action: 'save_token', token: 'Bearer synthetic-token' }));
  assert(response.status === 200);
  assert(calls[0].payload.token === 'synthetic-token');
  assert(!(await response.text()).includes('synthetic-token'));
  const failure = await createHandler(fixture({ dbError: true }).admin)(request({ action: 'save_token', token: 'synthetic-token' }));
  assert(failure.status === 409 && !(await failure.text()).includes('SECRET_DATABASE'));
});

Deno.test('ações financeiras ou leitura direta de segredo não estão expostas', async () => {
  for (const action of ['token', 'commit_page', 'import', 'settle', 'debits/create']) {
    const { admin, calls } = fixture();
    const response = await createHandler(admin)(request({ action, id: '00000000-0000-0000-0000-000000000001' }));
    assert(response.status === 400 && calls.length === 0);
  }
});

Deno.test('teste consulta pessoas mas não armazena conteúdo nem devolve token', async () => {
  const { admin, calls } = fixture();
  const response = await createHandler(admin, (() => Promise.resolve(Response.json({
    current_page: 1, last_page: 1, data: [{ id: 1, name: 'Pessoa fictícia' }],
  }))) as typeof fetch)(request({ action: 'test' }));
  const text = await response.text();
  assert(response.status === 200 && response.headers.get('Cache-Control') === 'no-store');
  assert(!text.includes('synthetic-token') && !text.includes('Pessoa fictícia'));
  assert(calls.length === 1 && calls[0].action === 'token');
});
