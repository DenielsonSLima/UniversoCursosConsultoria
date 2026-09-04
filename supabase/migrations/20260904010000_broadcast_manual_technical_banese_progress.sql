begin;

create or replace function internal_academic.broadcast_technical_financial_title()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_matricula_id uuid := coalesce(new.matricula_id, old.matricula_id);
  v_turma_id uuid;
begin
  if v_matricula_id is null then return coalesce(new, old); end if;

  select config.turma_id
  into v_turma_id
  from public.matriculas_tecnicas_financeiro_config config
  where config.matricula_id = v_matricula_id;

  if v_turma_id is not null then
    perform internal_academic.send_technical_financial_changed(
      'title-changed', v_turma_id, v_matricula_id
    );
  end if;
  return coalesce(new, old);
end;
$function$;

revoke all on function internal_academic.broadcast_technical_financial_title()
  from public, anon, authenticated, service_role;

drop trigger if exists broadcast_technical_financial_title_update
  on public.contas_receber;

create trigger broadcast_technical_financial_title_update
after update of
  status,
  valor,
  data_vencimento
on public.contas_receber
for each row execute function internal_academic.broadcast_technical_financial_title();

drop trigger if exists broadcast_technical_financial_title_gateway_progress
  on public.contas_receber;

create trigger broadcast_technical_financial_title_gateway_progress
after update of gateway_submission_status
on public.contas_receber
for each row
when (
  old.gateway_submission_status is distinct from new.gateway_submission_status
  and new.gateway_submission_status in ('API_REGISTERED', 'API_REVIEW')
)
execute function internal_academic.broadcast_technical_financial_title();

commit;
