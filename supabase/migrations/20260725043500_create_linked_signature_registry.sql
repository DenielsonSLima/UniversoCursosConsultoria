begin;

create table if not exists public.assinaturas_pessoas (
  id uuid primary key default gen_random_uuid(),
  categoria text not null
    check (categoria in ('SECRETARIA', 'COORDENADOR_CURSO', 'PROFESSOR')),
  parceiro_id uuid references public.parceiros(id) on delete cascade,
  nome text not null check (length(trim(nome)) between 2 and 180),
  cargo text not null default '' check (length(cargo) <= 180),
  assinatura_url text check (assinatura_url is null or length(assinatura_url) <= 2048),
  assinatura_path text check (assinatura_path is null or length(assinatura_path) <= 1024),
  chave_legada text
    check (chave_legada is null or chave_legada in ('diretoriaGeral', 'secretaria', 'coordenacao')),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assinaturas_pessoas_professor_vinculado_check check (
    (categoria = 'PROFESSOR' and parceiro_id is not null)
    or (categoria <> 'PROFESSOR' and parceiro_id is null)
  ),
  constraint assinaturas_pessoas_chave_categoria_check check (
    chave_legada is null
    or (chave_legada in ('diretoriaGeral', 'secretaria') and categoria = 'SECRETARIA')
    or (chave_legada = 'coordenacao' and categoria = 'COORDENADOR_CURSO')
  )
);

create unique index if not exists assinaturas_pessoas_professor_unique_idx
  on public.assinaturas_pessoas (parceiro_id)
  where categoria = 'PROFESSOR';

create unique index if not exists assinaturas_pessoas_chave_legada_unique_idx
  on public.assinaturas_pessoas (chave_legada)
  where chave_legada is not null;

create index if not exists assinaturas_pessoas_categoria_ativo_idx
  on public.assinaturas_pessoas (categoria, ativo, nome);

create or replace function public.touch_assinaturas_pessoas_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists touch_assinaturas_pessoas_updated_at on public.assinaturas_pessoas;
create trigger touch_assinaturas_pessoas_updated_at
before update on public.assinaturas_pessoas
for each row execute function public.touch_assinaturas_pessoas_updated_at();

alter table public.assinaturas_pessoas enable row level security;

drop policy if exists assinaturas_pessoas_select on public.assinaturas_pessoas;
create policy assinaturas_pessoas_select
on public.assinaturas_pessoas
for select
to authenticated
using (
  public.gestor_has_module('configuracoes')
  or parceiro_id = (select public.current_professor_id())
);

drop policy if exists assinaturas_pessoas_insert_gestor on public.assinaturas_pessoas;
create policy assinaturas_pessoas_insert_gestor
on public.assinaturas_pessoas
for insert
to authenticated
with check (public.gestor_has_module('configuracoes'));

drop policy if exists assinaturas_pessoas_update_gestor on public.assinaturas_pessoas;
create policy assinaturas_pessoas_update_gestor
on public.assinaturas_pessoas
for update
to authenticated
using (public.gestor_has_module('configuracoes'))
with check (public.gestor_has_module('configuracoes'));

drop policy if exists assinaturas_pessoas_delete_gestor on public.assinaturas_pessoas;
create policy assinaturas_pessoas_delete_gestor
on public.assinaturas_pessoas
for delete
to authenticated
using (public.gestor_has_module('configuracoes'));

grant select, insert, update, delete on public.assinaturas_pessoas to authenticated;

create or replace function public.salvar_minha_assinatura_professor(p_assinatura_path text)
returns public.assinaturas_pessoas
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_professor_id uuid := public.current_professor_id();
  v_professor_nome text;
  v_result public.assinaturas_pessoas;
begin
  if v_professor_id is null then
    raise exception 'Professor autenticado não identificado.';
  end if;

  if p_assinatura_path is null
     or p_assinatura_path <> ('professores/' || v_professor_id::text || '/assinatura') then
    raise exception 'Caminho da assinatura inválido.';
  end if;

  select p.nome
    into v_professor_nome
  from public.parceiros p
  where p.id = v_professor_id
    and p.tipo = 'Professor'
    and public.is_active_status(p.status);

  if v_professor_nome is null then
    raise exception 'Cadastro de professor ativo não encontrado.';
  end if;

  insert into public.assinaturas_pessoas (
    categoria,
    parceiro_id,
    nome,
    cargo,
    assinatura_url,
    assinatura_path,
    ativo
  )
  values (
    'PROFESSOR',
    v_professor_id,
    v_professor_nome,
    'Professor(a)',
    null,
    p_assinatura_path,
    true
  )
  on conflict (parceiro_id) where categoria = 'PROFESSOR'
  do update set
    nome = excluded.nome,
    cargo = excluded.cargo,
    assinatura_url = null,
    assinatura_path = excluded.assinatura_path,
    ativo = true,
    updated_at = now()
  returning * into v_result;

  return v_result;
end;
$$;

revoke all on function public.salvar_minha_assinatura_professor(text) from public;
grant execute on function public.salvar_minha_assinatura_professor(text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'assinaturas',
  'assinaturas',
  false,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp']::text[]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.can_write_assinatura_storage_object(p_name text)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select public.gestor_has_module('configuracoes')
    or (
      public.current_professor_id() is not null
      and p_name = 'professores/' || public.current_professor_id()::text || '/assinatura'
    );
$$;

create or replace function public.can_delete_assinatura_storage_object()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select public.gestor_has_module('configuracoes');
$$;

revoke all on function public.can_write_assinatura_storage_object(text) from public;
revoke all on function public.can_delete_assinatura_storage_object() from public;
grant execute on function public.can_write_assinatura_storage_object(text) to authenticated;
grant execute on function public.can_delete_assinatura_storage_object() to authenticated;

drop policy if exists assinaturas_objects_select on storage.objects;
create policy assinaturas_objects_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'assinaturas'
  and (
    public.gestor_has_module('configuracoes')
    or name = 'professores/' || (select public.current_professor_id())::text || '/assinatura'
  )
);

drop policy if exists assinaturas_objects_insert on storage.objects;
create policy assinaturas_objects_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'assinaturas'
  and public.can_write_assinatura_storage_object(name)
);

drop policy if exists assinaturas_objects_update on storage.objects;
create policy assinaturas_objects_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'assinaturas'
  and public.can_write_assinatura_storage_object(name)
)
with check (
  bucket_id = 'assinaturas'
  and public.can_write_assinatura_storage_object(name)
);

drop policy if exists assinaturas_objects_delete on storage.objects;
create policy assinaturas_objects_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'assinaturas'
  and public.can_delete_assinatura_storage_object()
);

with legacy as (
  select conteudo
  from public.documentos_templates
  where id = 'assinaturas'
)
insert into public.assinaturas_pessoas (
  categoria,
  nome,
  cargo,
  assinatura_url,
  chave_legada
)
select
  item.categoria,
  item.nome,
  item.cargo,
  nullif(item.assinatura_url, ''),
  item.chave_legada
from legacy
cross join lateral (
  values
    (
      'SECRETARIA',
      coalesce(nullif(trim(legacy.conteudo ->> 'diretoriaGeralNome'), ''), 'Diretoria Geral'),
      coalesce(nullif(trim(legacy.conteudo ->> 'diretoriaGeralCargo'), ''), 'Diretora Geral'),
      coalesce(legacy.conteudo ->> 'diretoriaGeral', ''),
      'diretoriaGeral'
    ),
    (
      'SECRETARIA',
      coalesce(nullif(trim(legacy.conteudo ->> 'secretariaNome'), ''), 'Secretaria'),
      coalesce(nullif(trim(legacy.conteudo ->> 'secretariaCargo'), ''), 'Secretária Escolar'),
      coalesce(legacy.conteudo ->> 'secretaria', ''),
      'secretaria'
    ),
    (
      'COORDENADOR_CURSO',
      coalesce(nullif(trim(legacy.conteudo ->> 'coordenacaoNome'), ''), 'Coordenação'),
      coalesce(nullif(trim(legacy.conteudo ->> 'coordenacaoCargo'), ''), 'Coordenador(a) de Curso'),
      coalesce(legacy.conteudo ->> 'coordenacao', ''),
      'coordenacao'
    )
) as item(categoria, nome, cargo, assinatura_url, chave_legada)
on conflict (chave_legada) where chave_legada is not null
do update set
  nome = excluded.nome,
  cargo = excluded.cargo,
  assinatura_url = coalesce(excluded.assinatura_url, public.assinaturas_pessoas.assinatura_url),
  ativo = true,
  updated_at = now();

update public.documentos_templates
set
  conteudo = case
    when jsonb_typeof(conteudo -> 'contracapaCampos') = 'array' then
      jsonb_set(
        conteudo
          - 'diretorNome'
          - 'diretorCargo'
          - 'secretarioNome'
          - 'secretarioCargo'
          - 'diretorAssinaturaRole'
          - 'secretarioAssinaturaRole'
          - 'assinatura1Origem'
          - 'assinatura2Origem',
        '{contracapaCampos}',
        coalesce(
          (
            select jsonb_agg(field)
            from jsonb_array_elements(conteudo -> 'contracapaCampos') field
            where field ->> 'id' not in (
              'signature_diretor',
              'signature_secretario',
              'contracapaDiretor',
              'contracapaSecretario'
            )
          ),
          '[]'::jsonb
        ),
        true
      )
    else
      conteudo
        - 'diretorNome'
        - 'diretorCargo'
        - 'secretarioNome'
        - 'secretarioCargo'
        - 'diretorAssinaturaRole'
        - 'secretarioAssinaturaRole'
        - 'assinatura1Origem'
        - 'assinatura2Origem'
  end,
  updated_at = now()
where id in ('diario_TECNICO', 'diario_LIVRE', 'diario_ESPECIALIZACAO');

commit;
