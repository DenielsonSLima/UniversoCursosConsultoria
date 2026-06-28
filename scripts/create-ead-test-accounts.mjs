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
  if (!supabaseUrl) console.error('Informe SUPABASE_URL, REACT_APP_SUPABASE_URL ou VITE_SUPABASE_URL no ambiente.');
  if (!serviceRoleKey) console.error('Informe SUPABASE_SERVICE_ROLE_KEY no ambiente para criar/atualizar usuários no Auth.');
  process.exit(1);
}

const headers = {
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
  'Content-Type': 'application/json',
};

const matrizPoloId = '44444444-4444-4444-4444-444444444444';

const accounts = [
  {
    tipo: 'Aluno',
    email: 'aluno.ead@universo.com',
    password: 'ead-aluno-2026',
    profileTable: 'parceiros',
    profile: { nome: 'Aluno EAD (teste)', tipo: 'Aluno', status: 'ATIVO' },
  },
  {
    tipo: 'Professor',
    email: 'professor.ead@universo.com',
    password: '1234',
    profileTable: 'parceiros',
    profile: {
      nome: 'Professor EAD (teste)',
      tipo: 'Professor',
      status: 'ATIVO',
      polo_id: matrizPoloId,
      polo_ids: [matrizPoloId],
    },
  },
  {
    tipo: 'Gestor',
    email: 'gestor.ead@universo.com',
    password: 'ead-gestor-2026',
    profileTable: 'usuarios_sistema',
    profile: { nome: 'Gestor EAD (teste)', perfil: 'Gestor', status: 'ATIVO', context: 'global' },
  },
];

const readJson = async (response) => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const request = async (path, init = {}) => {
  const response = await fetch(`${supabaseUrl}${path}`, {
    ...init,
    headers: { ...headers, ...(init.headers || {}) },
  });
  const payload = await readJson(response);
  if (!response.ok) {
    const message = payload?.msg || payload?.message || payload?.error_description || JSON.stringify(payload);
    throw new Error(message);
  }
  return payload;
};

const findAuthUser = async (email) => {
  const payload = await request(`/auth/v1/admin/users?per_page=1000`);
  return (payload?.users || []).find((user) => String(user.email || '').toLowerCase() === email.toLowerCase()) || null;
};

const ensureAuthUser = async ({ email, password, tipo }) => {
  const existing = await findAuthUser(email);
  if (existing?.id) {
    return request(`/auth/v1/admin/users/${existing.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        password,
        email_confirm: true,
        user_metadata: { ...(existing.user_metadata || {}), tipo },
      }),
    });
  }

  return request('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { tipo },
    }),
  });
};

const upsertProfile = async (table, row) => {
  return request(`/rest/v1/${table}`, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(row),
  });
};

for (const account of accounts) {
  const user = await ensureAuthUser(account);
  await upsertProfile(account.profileTable, {
    id: user.id,
    email: account.email,
    ...account.profile,
  });
  console.log(`${account.tipo}: ${account.email} / ${account.password}`);
}

console.log('Acessos EAD criados/atualizados no Supabase Auth e vinculados aos perfis.');
