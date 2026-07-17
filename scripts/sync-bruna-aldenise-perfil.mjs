import fs from 'node:fs';

const env = {};
for (const file of ['.env.local', '.env']) {
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, 'utf8').split(/\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) env[match[1]] = match[2];
  }
}

const supabaseUrl = env.SUPABASE_URL || env.REACT_APP_SUPABASE_URL || env.VITE_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Informe SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente.');
  process.exit(1);
}

const headers = {
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
  'Content-Type': 'application/json',
};

const TARGET_CPF = '07001707589';
const TARGET_EMAIL = process.argv[2] || null;
const TARGET_PASSWORD = process.argv[3] || null;

const onlyDigits = (value) => String(value || '').replace(/\D/g, '');
const request = async (path, init = {}) => {
  const response = await fetch(`${supabaseUrl}${path}`, {
    ...init,
    headers: { ...headers, ...(init.headers || {}) },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.message || payload?.msg || payload?.error || JSON.stringify(payload);
    throw new Error(message);
  }
  return payload;
};

const findUsersByCpf = async (cpf) => {
  const cpfDigits = onlyDigits(cpf);
  return request(`/rest/v1/usuarios_sistema?select=id,nome,email,cpf,context,polo_ids,perfil,permissoes,perfil_acesso_id&cpf=ilike.*${encodeURIComponent(cpfDigits)}*&limit=5`);
};

const findPerfilFromAldenise = async () => {
  const users = await request('/rest/v1/usuarios_sistema?select=id,nome,email,perfil_acesso_id&or=(nome.ilike.*Aldenise*,email.ilike.*aldenise*)&limit=5');
  const match = (users || []).find((u) => String(u.perfil_acesso_id || '').trim().length > 0);
  if (match?.perfil_acesso_id) return match.perfil_acesso_id;
  return null;
};

const findAuthUser = async (email) => {
  const users = await request('/auth/v1/admin/users?per_page=1000');
  const emailNormalized = String(email || '').toLowerCase();
  return (users?.users || []).find((u) => String(u.email || '').toLowerCase() === emailNormalized);
};

const main = async () => {
  const [brunaUsers, perfilId] = await Promise.all([
    findUsersByCpf(TARGET_CPF),
    findPerfilFromAldenise(),
  ]);

  if (!perfilId) {
    console.error('Perfil de acesso da Aldenise não encontrado (sem perfil vinculado).');
    process.exit(1);
  }

  const existingBruna = (brunaUsers || [])[0];
  if (existingBruna?.id) {
    await request(`/rest/v1/usuarios_sistema?id=eq.${existingBruna.id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        perfil_acesso_id: perfilId,
        nome: 'Bruna Alves',
        cpf: TARGET_CPF,
      }),
    });
    console.log('Perfil da Bruna atualizado para o mesmo perfil de acesso da Aldenise:', existingBruna.id);

    if (!TARGET_PASSWORD) {
      console.log('Aviso: senha não foi enviada. Usuário não foi criado no auth, apenas perfil atualizado.');
    }
    return;
  }

  if (!TARGET_EMAIL) {
    console.error('Bruna não existe em usuarios_sistema e não recebeu e-mail para criação.');
    process.exit(1);
  }

  if (!TARGET_PASSWORD) {
    console.error('Informe a senha da Bruna como terceiro argumento do script.');
    process.exit(1);
  }

  const auth = await request('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      email: TARGET_EMAIL,
      password: TARGET_PASSWORD,
      email_confirm: true,
      user_metadata: { nome: 'Bruna Alves', origem: 'usuarios_sistema' },
    }),
  });

  const authId = auth?.user?.id;
  await request('/rest/v1/usuarios_sistema', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({
      id: authId,
      nome: 'Bruna Alves',
      email: TARGET_EMAIL,
      cpf: TARGET_CPF,
      status: 'Ativo',
      perfil: 'Gestor',
      context: 'global',
      polo_ids: [],
      permissoes: { modules: ['inicio'], allPolos: true },
      perfil_acesso_id: perfilId,
    }),
  });

  console.log('Usuário Bruna criado e vinculado ao perfil de Aldenise com sucesso.');
};

main().catch((err) => {
  console.error('Erro ao sincronizar Bruna:', err?.message || String(err));
  process.exit(1);
});
