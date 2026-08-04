begin;

-- O acesso do aluno e um ciclo separado do cadastro academico. Estes campos
-- registram somente o estado tecnico do acesso, sem armazenar senha, token,
-- link de recuperacao ou qualquer outro segredo do Auth.
alter table public.parceiros
  add column if not exists acesso_status text not null default 'sem_acesso',
  add column if not exists acesso_erro text,
  add column if not exists convite_enviado_em timestamptz,
  add column if not exists acesso_ativado_em timestamptz;

alter table public.parceiros
  drop constraint if exists parceiros_acesso_status_check;

alter table public.parceiros
  add constraint parceiros_acesso_status_check
  check (
    acesso_status in (
      'sem_acesso',
      'pendente',
      'processando',
      'convite_enviado',
      'ativo',
      'erro'
    )
  );

comment on column public.parceiros.acesso_status is
  'Estado canonico do acesso do aluno: sem_acesso, pendente, processando, convite_enviado, ativo ou erro.';
comment on column public.parceiros.acesso_erro is
  'Resumo operacional da ultima falha de provisionamento; nunca deve conter senha, token, link ou dado pessoal.';
comment on column public.parceiros.convite_enviado_em is
  'Instante do ultimo convite de acesso efetivamente enviado.';
comment on column public.parceiros.acesso_ativado_em is
  'Instante em que o Auth confirmado e com senha tornou o acesso utilizavel.';

-- Uma identidade Auth nao pode representar dois perfis canonicos. Interrompa a
-- migration antes do backfill se um ambiente divergente ja possuir duplicidade,
-- para que a equipe revise os vinculos em vez de escolher uma pessoa no escuro.
do $$
begin
  if exists (
    select 1
    from public.parceiros as parceiro
    where parceiro.auth_user_id is not null
    group by parceiro.auth_user_id
    having count(*) > 1
  ) then
    raise exception
      'Existem identidades Auth vinculadas a mais de um parceiro. Revise os vínculos antes de aplicar esta migration.'
      using errcode = '23505';
  end if;
end;
$$;

drop index if exists public.idx_parceiros_auth_user_id;
create unique index if not exists uq_parceiros_auth_user_id
  on public.parceiros (auth_user_id)
  where auth_user_id is not null;

-- Vincula apenas alunos ainda sem identidade canonica quando existe exatamente
-- um aluno e exatamente um usuario Auth para o e-mail normalizado. Ambiguidades
-- ficam intocadas para revisao manual, evitando associar duas pessoas ao mesmo
-- usuario. auth_login_email tem precedencia sobre o e-mail de contato.
with aluno_email as (
  select
    parceiro.id,
    lower(
      btrim(
        coalesce(
          nullif(parceiro.auth_login_email, ''),
          nullif(parceiro.email, '')
        )
      )
    ) as email_normalizado
  from public.parceiros as parceiro
  where parceiro.tipo = 'Aluno'
    and parceiro.auth_user_id is null
),
aluno_unico as (
  select email_normalizado, min(id) as parceiro_id
  from aluno_email
  where email_normalizado is not null
    and email_normalizado <> ''
  group by email_normalizado
  having count(*) = 1
),
auth_email as (
  select
    lower(btrim(auth_user.email)) as email_normalizado,
    min(auth_user.id) as auth_user_id
  from auth.users as auth_user
  where auth_user.email is not null
    and btrim(auth_user.email) <> ''
    and not exists (
      select 1
      from public.parceiros as vinculo_existente
      where vinculo_existente.auth_user_id = auth_user.id
    )
    and not exists (
      select 1
      from public.usuarios_sistema as usuario_sistema
      where usuario_sistema.auth_user_id = auth_user.id
    )
  group by lower(btrim(auth_user.email))
  having count(*) = 1
),
vinculo_unico as (
  select aluno_unico.parceiro_id, auth_email.auth_user_id
  from aluno_unico
  join auth_email using (email_normalizado)
)
update public.parceiros as parceiro
set
  auth_user_id = vinculo_unico.auth_user_id,
  updated_at = now()
from vinculo_unico
where parceiro.id = vinculo_unico.parceiro_id
  and parceiro.auth_user_id is null;

-- Backfill somente a partir de evidencias do Auth. Ausencia de usuario continua
-- como sem_acesso; um convite so recebe data quando auth.users.invited_at existe.
-- A data de confirmacao e usada como melhor evidencia historica de ativacao,
-- pois o Auth nao expoe o instante em que o hash inicial foi criado.
update public.parceiros as parceiro
set
  acesso_status = case
    when auth_user.id is null then 'sem_acesso'
    when coalesce(auth_user.encrypted_password, '') <> ''
      and coalesce(auth_user.email_confirmed_at, auth_user.confirmed_at) is not null
      then 'ativo'
    when auth_user.invited_at is not null then 'convite_enviado'
    else 'pendente'
  end,
  acesso_erro = null,
  convite_enviado_em = case
    when auth_user.invited_at is not null
      then coalesce(parceiro.convite_enviado_em, auth_user.invited_at)
    else parceiro.convite_enviado_em
  end,
  acesso_ativado_em = case
    when coalesce(auth_user.encrypted_password, '') <> ''
      and coalesce(auth_user.email_confirmed_at, auth_user.confirmed_at) is not null
      then coalesce(
        parceiro.acesso_ativado_em,
        auth_user.email_confirmed_at,
        auth_user.confirmed_at
      )
    else parceiro.acesso_ativado_em
  end,
  troca_senha_obrigatoria = case
    when coalesce(auth_user.encrypted_password, '') <> ''
      and coalesce(auth_user.email_confirmed_at, auth_user.confirmed_at) is not null
      then false
    else parceiro.troca_senha_obrigatoria
  end,
  updated_at = now()
from (
  select
    parceiro_aluno.id as parceiro_id,
    auth_user.id,
    auth_user.encrypted_password,
    auth_user.email_confirmed_at,
    auth_user.confirmed_at,
    auth_user.invited_at
  from public.parceiros as parceiro_aluno
  left join auth.users as auth_user
    on auth_user.id = parceiro_aluno.auth_user_id
  where parceiro_aluno.tipo = 'Aluno'
) as auth_user
where parceiro.id = auth_user.parceiro_id
  and parceiro.tipo = 'Aluno';

create index if not exists idx_parceiros_aluno_acesso_status
  on public.parceiros (acesso_status)
  where tipo = 'Aluno';

-- Clientes autenticados podem editar os dados permitidos do proprio perfil,
-- mas nao podem trocar a identidade Auth nem fabricar o estado operacional de
-- acesso. Service Role e atualizacoes disparadas por triggers internos seguem
-- autorizadas. Dois triggers preservam a ordem: a validacao de INSERT ocorre
-- antes dos preenchimentos automaticos, e a de UPDATE depois deles.
create or replace function public.protect_student_access_control_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_service_role boolean := coalesce(auth.role(), '') = 'service_role';
  v_is_internal_trigger boolean := pg_trigger_depth() > 1;
begin
  if v_is_service_role or v_is_internal_trigger then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.auth_user_id is not null
      or new.acesso_status <> 'sem_acesso'
      or new.acesso_erro is not null
      or new.convite_enviado_em is not null
      or new.acesso_ativado_em is not null
    then
      raise exception
        'A identidade e o estado de acesso sao controlados pelo fluxo seguro de autenticacao.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.auth_user_id is distinct from old.auth_user_id
    or new.auth_login_email is distinct from old.auth_login_email
    or new.troca_senha_obrigatoria is distinct from old.troca_senha_obrigatoria
    or new.acesso_status is distinct from old.acesso_status
    or new.acesso_erro is distinct from old.acesso_erro
    or new.convite_enviado_em is distinct from old.convite_enviado_em
    or new.acesso_ativado_em is distinct from old.acesso_ativado_em
  then
    raise exception
      'A identidade e o estado de acesso sao controlados pelo fluxo seguro de autenticacao.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.protect_student_access_control_fields()
  from public, anon, authenticated;
grant execute on function public.protect_student_access_control_fields()
  to service_role;

drop trigger if exists trg_00_protect_student_access_insert on public.parceiros;
create trigger trg_00_protect_student_access_insert
before insert on public.parceiros
for each row
execute function public.protect_student_access_control_fields();

drop trigger if exists trg_zz_protect_student_access_update on public.parceiros;
create trigger trg_zz_protect_student_access_update
before update on public.parceiros
for each row
execute function public.protect_student_access_control_fields();

-- O linker legado nao deve reaproveitar silenciosamente a conta de um gestor
-- nem aceitar no navegador uma identidade diferente da sessão atual. O
-- cadastro público pode vincular somente auth.uid(); Service Role pode operar
-- os fluxos internos, sempre verificando se a identidade ainda está livre.
create or replace function public.link_parceiro_auth_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_login_email text;
  v_session_auth_user_id uuid := auth.uid();
begin
  if new.auth_user_id is not null
    or new.tipo not in ('Aluno', 'Professor')
  then
    return new;
  end if;

  v_login_email := coalesce(
    nullif(btrim(new.auth_login_email), ''),
    nullif(btrim(new.email), '')
  );
  if v_login_email is null then
    return new;
  end if;

  select auth_user.id
  into new.auth_user_id
  from auth.users as auth_user
  where lower(btrim(auth_user.email)) = lower(v_login_email)
    and (
      coalesce(auth.role(), '') = 'service_role'
      or auth_user.id = v_session_auth_user_id
    )
    and not exists (
      select 1
      from public.parceiros as parceiro_vinculado
      where parceiro_vinculado.id <> new.id
        and parceiro_vinculado.auth_user_id = auth_user.id
    )
    and not exists (
      select 1
      from public.usuarios_sistema as usuario_sistema
      where usuario_sistema.auth_user_id = auth_user.id
    )
  limit 1;

  return new;
end;
$$;

revoke all on function public.link_parceiro_auth_identity()
  from public, anon, authenticated;
grant execute on function public.link_parceiro_auth_identity()
  to service_role;

-- Uma senha definida e um e-mail confirmado ativam o acesso no banco, inclusive
-- quando o navegador fecha antes de concluir o PATCH do primeiro acesso. O
-- vinculo canonico por auth_user_id sempre vence; o fallback por e-mail so e
-- usado quando existe exatamente um aluno sem vinculo para aquele login.
create or replace function public.sync_aluno_password_reset_completion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated_count integer := 0;
  v_fallback_id uuid;
  v_email_normalizado text;
begin
  if coalesce(new.encrypted_password, '') = ''
    or coalesce(new.email_confirmed_at, new.confirmed_at) is null
  then
    return new;
  end if;

  if tg_op = 'UPDATE'
    and old.encrypted_password is not distinct from new.encrypted_password
    and old.email_confirmed_at is not distinct from new.email_confirmed_at
    and old.confirmed_at is not distinct from new.confirmed_at
  then
    return new;
  end if;

  update public.parceiros as parceiro
  set
    troca_senha_obrigatoria = false,
    acesso_status = 'ativo',
    acesso_erro = null,
    acesso_ativado_em = coalesce(
      parceiro.acesso_ativado_em,
      new.email_confirmed_at,
      new.confirmed_at,
      now()
    ),
    updated_at = now()
  where parceiro.tipo = 'Aluno'
    and parceiro.auth_user_id = new.id;

  get diagnostics v_updated_count = row_count;
  if v_updated_count > 0 or new.email is null then
    return new;
  end if;

  v_email_normalizado := lower(btrim(new.email));

  select min(parceiro.id)
  into v_fallback_id
  from public.parceiros as parceiro
  where parceiro.tipo = 'Aluno'
    and parceiro.auth_user_id is null
    and lower(
      btrim(
        coalesce(
          nullif(parceiro.auth_login_email, ''),
          nullif(parceiro.email, '')
        )
      )
    ) = v_email_normalizado
  having count(*) = 1;

  if v_fallback_id is not null then
    update public.parceiros as parceiro
    set
      auth_user_id = new.id,
      troca_senha_obrigatoria = false,
      acesso_status = 'ativo',
      acesso_erro = null,
      acesso_ativado_em = coalesce(
        parceiro.acesso_ativado_em,
        new.email_confirmed_at,
        new.confirmed_at,
        now()
      ),
      updated_at = now()
    where parceiro.id = v_fallback_id
      and parceiro.auth_user_id is null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_aluno_password_reset_completion on auth.users;
create trigger trg_sync_aluno_password_reset_completion
after update of encrypted_password, email_confirmed_at
on auth.users
for each row
execute function public.sync_aluno_password_reset_completion();

revoke all on function public.sync_aluno_password_reset_completion()
  from public, anon, authenticated;
grant execute on function public.sync_aluno_password_reset_completion()
  to service_role;

-- Exclui o Auth somente depois que o parceiro foi removido com sucesso. O ID
-- canonico cobre inclusive alunos sem e-mail de contato; o fallback de e-mail
-- existe apenas para cadastros legados ainda sem auth_user_id. Outros parceiros
-- ou gestores que usem a identidade fazem a limpeza recuar com seguranca.
create or replace function public.delete_partner_auth_user_on_partner_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth_user_id uuid := old.auth_user_id;
  v_login_email text := lower(
    nullif(
      btrim(
        coalesce(
          nullif(old.auth_login_email, ''),
          nullif(old.email, '')
        )
      ),
      ''
    )
  );
begin
  if old.tipo not in ('Aluno', 'Professor') then
    return old;
  end if;

  if v_auth_user_id is null and v_login_email is not null then
    select auth_user.id
    into v_auth_user_id
    from auth.users as auth_user
    where lower(btrim(auth_user.email)) = v_login_email
    limit 1;
  end if;

  if v_auth_user_id is null then
    return old;
  end if;

  if exists (
    select 1
    from public.parceiros as parceiro
    where parceiro.auth_user_id = v_auth_user_id
      or (
        parceiro.auth_user_id is null
        and v_login_email is not null
        and lower(
          btrim(
            coalesce(
              nullif(parceiro.auth_login_email, ''),
              nullif(parceiro.email, '')
            )
          )
        ) = v_login_email
      )
  ) or exists (
    select 1
    from public.usuarios_sistema as usuario_sistema
    where usuario_sistema.auth_user_id = v_auth_user_id
      or (
        usuario_sistema.auth_user_id is null
        and v_login_email is not null
        and lower(btrim(usuario_sistema.email)) = v_login_email
        and public.is_active_status(usuario_sistema.status)
      )
  ) then
    return old;
  end if;

  delete from auth.users as auth_user
  where auth_user.id = v_auth_user_id;

  return old;
end;
$$;

drop trigger if exists trg_delete_partner_auth_user_on_partner_delete
  on public.parceiros;
create trigger trg_delete_partner_auth_user_on_partner_delete
after delete on public.parceiros
for each row
execute function public.delete_partner_auth_user_on_partner_delete();

revoke all on function public.delete_partner_auth_user_on_partner_delete()
  from public, anon, authenticated;
grant execute on function public.delete_partner_auth_user_on_partner_delete()
  to service_role;

-- A justificativa da conferencia sem anexo aparece ao gestor, mas e opcional.
-- Vazio e espacos sao persistidos como NULL; quando informado, o texto continua
-- limitado a 1000 caracteres no banco, independentemente do cliente.
alter table public.documentos_aluno_recebimentos_sem_anexo
  alter column motivo drop not null;

alter table public.documentos_aluno_recebimentos_sem_anexo
  drop constraint if exists documentos_recebimentos_motivo_chk;

alter table public.documentos_aluno_recebimentos_sem_anexo
  add constraint documentos_recebimentos_motivo_chk
  check (
    motivo is null
    or length(btrim(motivo)) between 1 and 1000
  );

create or replace function public.marcar_documento_recebido_sem_anexo(
  p_documento_id uuid,
  p_motivo text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_documento public.documentos_aluno%rowtype;
  v_recebimento public.documentos_aluno_recebimentos_sem_anexo%rowtype;
  v_usuario_id uuid;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  if auth.uid() is null then
    raise exception 'Autenticação obrigatória.' using errcode = '42501';
  end if;

  if length(v_motivo) > 1000 then
    raise exception 'A justificativa deve ter no máximo 1000 caracteres.'
      using errcode = '22023';
  end if;

  select *
  into v_documento
  from public.documentos_aluno
  where id = p_documento_id
  for update;

  if v_documento.id is null
    or not public.gestor_pode_gerenciar_documento_aluno(v_documento.aluno_id)
  then
    raise exception 'Documento não encontrado ou fora do escopo do gestor.'
      using errcode = '42501';
  end if;

  if v_documento.versao_atual_id is not null
    or nullif(v_documento.arquivo_url, '') is not null
    or v_documento.arquivo_bucket is not null
    or v_documento.arquivo_path is not null
  then
    raise exception
      'Este item possui arquivo ou versão; use o fluxo normal de revisão.'
      using errcode = '22023';
  end if;

  select *
  into v_recebimento
  from public.documentos_aluno_recebimentos_sem_anexo
  where documento_id = v_documento.id
    and revogado_em is null
  for update;

  if v_recebimento.id is null then
    v_usuario_id := public.documentos_aluno_usuario_atual_id();

    insert into public.documentos_aluno_recebimentos_sem_anexo (
      documento_id,
      aluno_id,
      origem,
      motivo,
      recebido_por_auth_uid,
      recebido_por_usuario_id
    )
    values (
      v_documento.id,
      v_documento.aluno_id,
      'GESTOR_CONFIRMACAO_SEM_ANEXO',
      v_motivo,
      auth.uid(),
      v_usuario_id
    )
    returning * into v_recebimento;

    update public.documentos_aluno
    set
      status = 'aprovado',
      observacao = case
        when v_motivo is null
          then 'Documento entregue e conferido sem anexo.'
        else 'Documento entregue e conferido sem anexo: ' || v_motivo
      end,
      revisado_por = v_usuario_id,
      revisado_em = v_recebimento.recebido_em,
      updated_at = now()
    where id = v_documento.id;

    insert into public.documentos_aluno_eventos (
      aluno_id,
      documento_id,
      evento,
      ator_auth_uid,
      ator_usuario_id,
      detalhes
    )
    values (
      v_documento.aluno_id,
      v_documento.id,
      'documento_recebido_sem_anexo',
      auth.uid(),
      v_usuario_id,
      jsonb_build_object(
        'recebimentoId', v_recebimento.id,
        'origem', v_recebimento.origem,
        'motivo', v_motivo
      )
    );
  end if;

  return jsonb_build_object(
    'id', v_recebimento.id,
    'documentoId', v_recebimento.documento_id,
    'alunoId', v_recebimento.aluno_id,
    'origem', v_recebimento.origem,
    'motivo', v_recebimento.motivo,
    'recebidoEm', v_recebimento.recebido_em
  );
end;
$$;

revoke all on function public.marcar_documento_recebido_sem_anexo(uuid, text)
  from public, anon;
grant execute on function public.marcar_documento_recebido_sem_anexo(uuid, text)
  to authenticated, service_role;

commit;
