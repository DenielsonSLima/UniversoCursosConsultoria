begin;
set local lock_timeout='5s';

-- The worker locks this enrollment before persisting CANCEL_INTENT. The row
-- lock serializes status changes even outside the transfer RPC. An expired
-- network lease does not prove that the bank cancellation did not happen.
create function internal_academic.guard_academic_exit_during_banese_reissue()
returns trigger language plpgsql security definer set search_path='' as $function$
begin
  if new.status is distinct from old.status
    and upper(coalesce(new.status,'')) not in ('ATIVO','PENDENTE')
    and exists(
      select 1 from internal_academic.technical_manual_banese_reissue_jobs job
      where job.matricula_id=old.id
        and (
          job.status in ('CANCEL_INTENT','CANCEL_CONFIRMED')
          or (job.status='RESET_COMPLETE' and not exists(
            select 1 from public.contas_receber r where r.id=job.receivable_id
              and (r.status in ('PAGO','CANCELADO')
                or coalesce(internal_academic.technical_manual_banese_receivable_complete(r),false)
                or coalesce(internal_academic.technical_manual_banese_receivable_paid_issued(r),false))
          ))
        )
    )
  then
    raise exception 'Há uma substituição de boleto aguardando confirmação bancária. Conclua a conciliação antes de alterar a situação acadêmica.'
      using errcode='PT409';
  end if;
  return new;
end;
$function$;
revoke all on function internal_academic.guard_academic_exit_during_banese_reissue()
  from public,anon,authenticated,service_role;
create trigger guard_academic_exit_during_banese_reissue
before update of status on public.matriculas
for each row execute function internal_academic.guard_academic_exit_during_banese_reissue();

comment on function internal_academic.guard_academic_exit_during_banese_reissue() is
  'Serializa saída acadêmica com intenção bancária durável; timeout não autoriza ignorar cancelamento incerto.';
commit;
