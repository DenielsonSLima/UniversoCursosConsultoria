import { readFileSync } from 'node:fs';

export const sqlFile = (name) => readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
export const migrations = [
  '20261101030426_lgpd_internal_chat_scope.sql',
  '20261101030430_lgpd_chat_contact_directory.sql',
];
export const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export async function fixture(db) {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create schema storage;
    grant usage on schema auth, storage to authenticated, service_role;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('test.actor', true), '')::uuid;
    $$;
    create function auth.role() returns text language sql stable as $$
      select coalesce(nullif(current_setting('test.auth_role', true), ''), 'authenticated');
    $$;
    create table public.usuarios_sistema (
      id uuid primary key, auth_user_id uuid, nome text, email text, status text,
      polo_comunicacao_id uuid, setor_comunicacao text default 'todos',
      pode_visualizar_todos_setores boolean default false,
      pode_visualizar_todos_polos boolean default false, comm boolean default true,
      created_at timestamptz default now()
    );
    create table public.parceiros (
      id uuid primary key, nome text, tipo text, status text, cidade text,
      polo_id uuid, polo_ids uuid[] default '{}'
    );
    create table public.polos (id uuid primary key);
    insert into public.polos(id) values ('00000000-0000-4000-8000-000000000001'),
      ('00000000-0000-4000-8000-000000000002');
    create function public.current_aluno_id() returns uuid language sql stable as $$
      select case when current_setting('test.kind', true) = 'aluno' then auth.uid() end;
    $$;
    create function public.current_professor_id() returns uuid language sql stable as $$
      select case when current_setting('test.kind', true) = 'professor' then auth.uid() end;
    $$;
    create function public.is_active_status(text) returns boolean language sql immutable as $$
      select upper($1) in ('ATIVO', 'ACTIVE');
    $$;
    create function public.is_gestor() returns boolean language sql stable as $$
      select current_setting('test.kind', true) = 'gestor';
    $$;
    create function public.gestor_has_tab(text, text) returns boolean
    language sql stable security definer set search_path = '' as $$
      select coalesce((select comm from public.usuarios_sistema where auth_user_id = auth.uid()), false);
    $$;
    create function public.auth_email() returns text
    language sql stable security definer set search_path = '' as $$
      select email from public.usuarios_sistema where auth_user_id = auth.uid();
    $$;
    create table public.comunicacao_categorias (
      id uuid primary key, nome text, ativo boolean default true
    );
    create table public.comunicacao_chats (
      id uuid primary key default gen_random_uuid(), remetente_id uuid,
      remetente_nome text, remetente_tipo text, categoria_id uuid,
      status text default 'pendente', ultimo_texto text, ultima_data timestamptz default now(),
      created_at timestamptz default now(), updated_at timestamptz default now(),
      deleted_by_aluno boolean default false, origem text default 'app', polo_id uuid,
      setor text, atendente_id uuid, assunto text, protocolo text,
      primeira_resposta_em timestamptz, encerrado_em timestamptz,
      notificar_resposta boolean default false, public_access_hash text,
      public_access_expires_at timestamptz, public_request_id uuid
    );
    create table public.comunicacao_mensagens (
      id uuid primary key default gen_random_uuid(),
      chat_id uuid references public.comunicacao_chats(id) on delete cascade,
      remetente_id uuid, remetente_nome text, remetente_tipo text, conteudo text,
      anexo_url text, anexo_path text, lida boolean default false,
      created_at timestamptz default now()
    );
    create table storage.objects (
      id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid
    );
    alter table public.comunicacao_chats enable row level security;
    alter table public.comunicacao_mensagens enable row level security;
    alter table storage.objects enable row level security;
    grant select, insert, update, delete on public.comunicacao_chats,
      public.comunicacao_mensagens, storage.objects to authenticated, service_role;
    create policy portal_comunicacao_chats_access on public.comunicacao_chats
      for all to authenticated using (public.gestor_has_tab('comunicacao', 'comunicacao-mensagem'));
    create policy portal_comunicacao_mensagens_select on public.comunicacao_mensagens
      for select to authenticated using (true);
  `);
  await db.exec(migrations.map(sqlFile).join('\n'));
  await db.exec(`
    create trigger guard_comunicacao_mensagem_write
      before insert or update or delete on public.comunicacao_mensagens
      for each row execute function public.guard_comunicacao_mensagem_write();
    create policy portal_anexos_select on storage.objects for select to authenticated
      using (bucket_id = 'anexos' and (public.can_read_anexo_storage_object(name)
        or public.can_upload_anexo_storage_object(name)));
    create policy portal_anexos_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'anexos' and public.can_upload_anexo_storage_object(name));
    create policy portal_anexos_update on storage.objects for update to authenticated
      using (bucket_id = 'anexos' and owner = auth.uid() and public.can_upload_anexo_storage_object(name))
      with check (bucket_id = 'anexos' and owner = auth.uid() and public.can_upload_anexo_storage_object(name));
  `);
  for (const [n, type, polo] of [[11, 'Aluno', 1], [12, 'Aluno', 2], [13, 'Professor', 1]]) {
    await db.query('insert into parceiros(id,nome,tipo,status,polo_id) values($1,$2,$3,$4,$5)',
      [id(n), 'Pessoa sintética', type, 'ATIVO', id(polo)]);
  }
  await db.query('insert into comunicacao_categorias(id,nome) values($1,$2),($3,$4)',
    [id(21), 'Financeira', id(22), 'Secretaria']);
  for (const [n, polo, sector, allSectors, allPolos, comm, status] of [
    [31, 1, 'financeiro', false, false, true, 'ATIVO'],
    [32, 2, 'financeiro', false, false, true, 'ATIVO'],
    [33, null, 'todos', true, true, true, 'ATIVO'],
    [34, null, 'financeiro', false, true, true, 'ATIVO'],
    [35, null, 'todos', false, false, true, 'ATIVO'],
    [36, 1, 'todos', false, false, false, 'ATIVO'],
    [37, 1, 'todos', true, true, true, 'INATIVO'],
    [38, 1, 'secretaria', false, false, true, 'ATIVO'],
  ]) {
    await db.query(`insert into usuarios_sistema(id,auth_user_id,nome,email,status,polo_comunicacao_id,
      setor_comunicacao,pode_visualizar_todos_setores,pode_visualizar_todos_polos,comm)
      values($1,$1,'Gestor sintético',$2,$3,$4,$5,$6,$7,$8)`,
    [id(n), `test-${n}@example.test`, status, polo ? id(polo) : null, sector, allSectors, allPolos, comm]);
  }
  // Dados sintéticos anteriores ao patch, inclusive null e setor desconhecido.
  await db.exec("select set_config('test.auth_role','service_role',false)");
  for (const [n, partner, polo, sector] of [
    [41, 11, 1, 'financeiro'], [42, 12, 2, 'financeiro'],
    [43, 11, 1, 'secretaria'], [44, 13, 1, 'financeiro'],
    [45, 11, null, null], [46, 11, 1, 'invalido'],
  ]) {
    await db.query(`insert into comunicacao_chats(id,remetente_id,remetente_nome,remetente_tipo,
      polo_id,setor,categoria_id) values($1,$2,'Pessoa sintética',$3,$4,$5,$6)`,
    [id(n), id(partner), partner === 13 ? 'Professor' : 'Aluno', polo ? id(polo) : null, sector, id(21)]);
    const path = `comunicacao/chats/${id(n)}/gestor/sintetico.pdf`;
    await db.query(`insert into comunicacao_mensagens(chat_id,remetente_tipo,conteudo,anexo_path)
      values($1,'gestor','Mensagem sintética',$2)`, [id(n), path]);
    await db.query(`insert into storage.objects(bucket_id,name,owner) values('anexos',$1,$2)`, [path,id(33)]);
  }
  await db.exec("select set_config('test.auth_role','authenticated',false)");
}

export async function actor(db, n, kind = 'gestor', role = 'authenticated') {
  await db.exec('reset role');
  await db.query("select set_config('test.actor',$1,false),set_config('test.kind',$2,false),set_config('test.auth_role',$3,false)", [n ? id(n) : '',kind,role]);
  await db.exec(`set role ${role}`);
}
