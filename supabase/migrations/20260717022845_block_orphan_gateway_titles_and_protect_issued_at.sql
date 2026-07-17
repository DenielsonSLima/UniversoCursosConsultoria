begin;

create or replace function internal_academic.assert_no_linked_remote_titles(
  p_matricula_id uuid default null,
  p_turma_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.contas_receber cr
    where (
      (p_matricula_id is not null and cr.matricula_id = p_matricula_id)
      or (p_turma_id is not null and cr.turma_id = p_turma_id)
    )
      and (
        cr.asaas_payment_id is not null
        or cr.asaas_payment_link_id is not null
        or cr.gateway_provider is not null
        or cr.gateway_payment_id is not null
        or cr.gateway_payment_link_id is not null
        or exists (
          select 1
          from public.payment_gateway_transactions gateway_transaction
          where gateway_transaction.receivable_id = cr.id
            and (
              gateway_transaction.remote_payment_id is not null
              or gateway_transaction.remote_payment_link_id is not null
            )
        )
      )
  ) or exists (
    select 1
    from public.inscricoes_online registration
    where (
      (p_matricula_id is not null and registration.matricula_id = p_matricula_id)
      or (p_turma_id is not null and registration.turma_id = p_turma_id)
    )
      and (
        registration.asaas_payment_id is not null
        or registration.asaas_payment_link_id is not null
        or registration.gateway_provider is not null
        or registration.gateway_payment_id is not null
        or registration.gateway_payment_link_id is not null
        or exists (
          select 1
          from public.payment_gateway_transactions gateway_transaction
          where gateway_transaction.inscricao_online_id = registration.id
            and (
              gateway_transaction.remote_payment_id is not null
              or gateway_transaction.remote_payment_link_id is not null
            )
        )
      )
  ) then
    raise exception using
      errcode = '23503',
      message = 'Existe titulo bancario vinculado. Cancele e confirme a baixa no provedor antes de remover a matricula ou a turma.';
  end if;
end;
$$;

revoke all on function internal_academic.assert_no_linked_remote_titles(uuid, uuid)
  from public, anon, authenticated, service_role;

alter function public.remover_matricula_turma(uuid)
  set schema internal_academic;
alter function internal_academic.remover_matricula_turma(uuid)
  rename to unguarded_remover_matricula_turma;

revoke all on function internal_academic.unguarded_remover_matricula_turma(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.remover_matricula_turma(p_matricula_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turma_id uuid;
begin
  select matricula.turma_id
    into v_turma_id
  from public.matriculas matricula
  where matricula.id = p_matricula_id;

  if v_turma_id is null then
    raise exception 'Matrícula não encontrada.';
  end if;

  if coalesce((select auth.role()), '') <> 'service_role'
    and not public.can_write_turma(v_turma_id) then
    raise exception 'Sem permissão para remover esta matrícula.'
      using errcode = '42501';
  end if;

  perform internal_academic.assert_no_linked_remote_titles(
    p_matricula_id,
    null
  );
  return internal_academic.unguarded_remover_matricula_turma(
    p_matricula_id
  );
end;
$$;

revoke execute on function public.remover_matricula_turma(uuid)
  from public, anon;
grant execute on function public.remover_matricula_turma(uuid)
  to authenticated, service_role;

alter function public.excluir_turma_nao_iniciada(uuid)
  set schema internal_academic;
alter function internal_academic.excluir_turma_nao_iniciada(uuid)
  rename to unguarded_excluir_turma_nao_iniciada;

revoke all on function internal_academic.unguarded_excluir_turma_nao_iniciada(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.excluir_turma_nao_iniciada(p_turma_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turma_id uuid;
begin
  select turma.id
    into v_turma_id
  from public.turmas turma
  where turma.id = p_turma_id;

  if v_turma_id is null then
    raise exception 'Turma não encontrada.';
  end if;

  if coalesce((select auth.role()), '') <> 'service_role'
    and not public.can_write_turma(v_turma_id) then
    raise exception 'Você não tem permissão para excluir esta turma.'
      using errcode = '42501';
  end if;

  perform internal_academic.assert_no_linked_remote_titles(
    null,
    v_turma_id
  );
  return internal_academic.unguarded_excluir_turma_nao_iniciada(v_turma_id);
end;
$$;

revoke execute on function public.excluir_turma_nao_iniciada(uuid)
  from public, anon;
grant execute on function public.excluir_turma_nao_iniciada(uuid)
  to authenticated, service_role;

create or replace function public.protect_receivable_boleto_issued_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_trusted_writer boolean :=
    coalesce(auth.role(), '') = 'service_role'
    or current_user in ('postgres', 'supabase_admin');
begin
  if v_trusted_writer then
    return new;
  end if;

  if tg_op = 'INSERT' and new.gateway_boleto_issued_at is not null then
    raise exception using
      errcode = '42501',
      message = 'A data de emissao do boleto somente pode ser gravada pelo servidor.';
  end if;

  if tg_op = 'UPDATE'
    and new.gateway_boleto_issued_at is distinct from old.gateway_boleto_issued_at then
    raise exception using
      errcode = '42501',
      message = 'A data de emissao do boleto somente pode ser alterada pelo servidor.';
  end if;

  return new;
end;
$$;

revoke all on function public.protect_receivable_boleto_issued_at()
  from public, anon, authenticated;
grant execute on function public.protect_receivable_boleto_issued_at()
  to service_role;

drop trigger if exists protect_receivable_boleto_issued_at
  on public.contas_receber;
create trigger protect_receivable_boleto_issued_at
before insert or update of gateway_boleto_issued_at
on public.contas_receber
for each row
execute function public.protect_receivable_boleto_issued_at();

comment on function internal_academic.assert_no_linked_remote_titles(uuid, uuid) is
  'Impede exclusao de matricula ou turma enquanto houver identificador remoto de cobranca vinculado.';

comment on function public.protect_receivable_boleto_issued_at() is
  'Impede clientes autenticados de alterar a data bancaria usada nos documentos Banese.';

commit;
