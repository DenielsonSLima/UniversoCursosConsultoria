-- No mutation or bank call: evaluate the canonical policy on isolated row values.
begin;
set local plpgsql.check_asserts='on';
do $test$
declare v_row public.contas_receber%rowtype; v_bank public.contas_receber%rowtype;
  v_proesc public.contas_receber%rowtype; v_day date:=timezone('America/Maceio',now())::date;
  v_offset integer; v_status text;
begin
  v_row:=jsonb_populate_record(null::public.contas_receber,jsonb_build_object(
    'id',gen_random_uuid(),'status','PENDENTE','valor',100,'data_vencimento',v_day+1));
  assert internal_academic.transfer_receivable_origin(v_row)='LOCAL';
  for v_offset in -1..1 loop
    v_row.data_vencimento:=v_day+v_offset;
    assert internal_academic.transfer_receivable_action(v_row,'EXTERNA_ENVIADA',v_day)=
      case when v_offset>0 then 'CANCELAR_LOCAL' else 'PRESERVAR' end;
    assert internal_academic.transfer_receivable_action(v_row,'INTERNA_TURMA',v_day)='CONTINUAR_ORIGEM';
    assert internal_academic.transfer_receivable_action(v_row,'INTERNA_POLO',v_day)='CONTINUAR_ORIGEM';
  end loop;
  foreach v_status in array array['PAGO','CANCELADO'] loop
    v_row.status:=v_status;
    assert internal_academic.transfer_receivable_action(v_row,'EXTERNA_ENVIADA',v_day)='PRESERVAR';
  end loop;
  v_row.status:='PENDENTE'; v_row.valor_pago:=1;
  assert internal_academic.transfer_receivable_action(v_row,'EXTERNA_ENVIADA',v_day)='PRESERVAR';
  v_row.valor_pago:=null; v_row.gateway_cnab_file_id:=gen_random_uuid(); v_row.gateway_provider:='banese_card';
  assert internal_academic.transfer_receivable_origin(v_row)='BANESE_CNAB';
  assert internal_academic.transfer_receivable_action(v_row,'EXTERNA_ENVIADA',v_day)='REVISAO_EXTERNA';
  select r.* into strict v_proesc from public.contas_receber r
    join internal_proesc.obligation_links l on l.receivable_id=r.id
    where r.status in ('PENDENTE','VENCIDO') and r.data_pagamento is null limit 1;
  v_proesc.data_vencimento:=v_day+1;
  assert internal_academic.transfer_receivable_action(v_proesc,'EXTERNA_ENVIADA',v_day)='REVISAO_EXTERNA';
  v_proesc.data_vencimento:=v_day;
  assert internal_academic.transfer_receivable_action(v_proesc,'EXTERNA_ENVIADA',v_day)='PRESERVAR';
  select r.* into strict v_bank from public.contas_receber r
    where r.gateway_provider='banese_card' and r.gateway_submission_status='API_REGISTERED'
      and r.status in ('PENDENTE','VENCIDO') and r.data_pagamento is null
      and internal_academic.transfer_receivable_action(r,'EXTERNA_ENVIADA',r.data_vencimento-1)='AGUARDAR_BANESE'
    limit 1;
  v_bank.data_vencimento:=v_day+1;
  assert internal_academic.transfer_receivable_action(v_bank,'EXTERNA_ENVIADA',v_day)='AGUARDAR_BANESE';
  v_bank.gateway_payment_id:='inconsistent';
  assert internal_academic.transfer_receivable_action(v_bank,'EXTERNA_ENVIADA',v_day)='REVISAO_EXTERNA';
  v_bank.data_vencimento:=v_day;
  assert internal_academic.transfer_receivable_action(v_bank,'EXTERNA_ENVIADA',v_day)='PRESERVAR';
  assert not has_function_privilege('authenticated',
    'internal_academic.apply_external_transfer_receivable(uuid,uuid)','EXECUTE');
  assert not has_table_privilege('authenticated','internal_academic.transfer_financial_operations','INSERT');
end;
$test$;
rollback;
