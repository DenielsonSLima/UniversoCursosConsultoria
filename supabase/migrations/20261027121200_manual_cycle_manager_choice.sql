begin;
set local lock_timeout = '5s';

do $drift$ begin
  if md5(pg_get_functiondef('internal_academic.technical_manual_monthly_count(uuid)'::regprocedure))
    <> '9f6b05dfdb3a378068f37b46db1b19c8' then
    raise exception 'Contagem financeira mudou; revisar a migration.';
  end if;
end $drift$;

create or replace function internal_academic.technical_manual_monthly_count(p_matricula_id uuid)
returns integer language sql stable security definer set search_path = '' as $function$
  select (internal_academic.enrollment_financial_context(p_matricula_id)#>>'{mensalidades,emitidas}')::integer;
$function$;



do $drift$ begin
  if md5(pg_get_functiondef('internal_academic.technical_manual_cycle_state(uuid)'::regprocedure))
    <> '07740067ed19a824c035874a925a17af' then
    raise exception 'Projeção de ciclos mudou; revisar a migration.';
  end if;
end $drift$;

create function internal_academic.manual_cycle_manager_options(p_matricula_id uuid,p_base jsonb)
returns jsonb language plpgsql stable security definer set search_path='' as $function$
declare v_cycle integer; v_code text; v_mode text; v_options jsonb:='[]'; v_status text;
begin
  select upper(m.status) into v_status from public.matriculas m where m.id=p_matricula_id;
  for v_cycle in 1..2 loop
    v_code:=null; v_mode:='CRIAR';
    if v_status is null or v_status not in ('ATIVO','PENDENTE') then v_code:='STATUS_ACADEMICO';
    elsif not internal_academic.is_manual_technical_enrollment(p_matricula_id) then v_code:='NAO_HABILITADO';
    elsif not exists(select 1 from public.matriculas_tecnicas_financeiro_config c
      where c.matricula_id=p_matricula_id) then v_code:='SEM_CONFIGURACAO';
    elsif p_base->'correcaoEmissao' is not null and p_base->'correcaoEmissao'<>'null'::jsonb
      and not (p_base#>>'{correcaoEmissao,status}'='COMPLETE'
        and p_base#>>'{correcaoEmissao,historicalCycle2Count}'='0') then v_code:='CORRECAO_EM_ANDAMENTO';
    elsif exists(select 1 from internal_academic.technical_manual_cycle_runs r
      where r.matricula_id=p_matricula_id and r.cycle_number=v_cycle) then
      v_code:='OPERACAO_EXISTENTE'; v_mode:='CONSULTAR';
      if exists(select 1 from internal_academic.technical_manual_cycle_runs r
        where r.matricula_id=p_matricula_id and r.cycle_number=v_cycle and r.state='LOCAL_CREATED') then
        v_mode:='RETOMAR';
      end if;
    elsif v_cycle=1 and p_base#>>'{continuidadeFinanceira,origemCompleta}'='true' then
      v_code:='CONTINUIDADE_NA_MATRICULA_ORIGEM'; v_mode:='CONSULTAR';
    elsif exists(select 1 from internal_academic.technical_imported_cycle_facts f
      where f.matricula_id=p_matricula_id and f.cycle_number=v_cycle)
      or exists(select 1 from internal_academic.technical_external_cycle_coverage c
        where c.matricula_id=p_matricula_id and (v_cycle=2 or c.scope='CONTRATO_COMPLETO')) then
      v_code:=case when internal_academic.technical_imported_cycle_has_conflict(p_matricula_id)
        then 'HISTORICO_EM_REVISAO' else 'CICLO_EXTERNO_EXISTENTE' end; v_mode:='CONSULTAR';
    elsif internal_academic.technical_imported_cycle_has_conflict(p_matricula_id) then
      v_code:='IDENTIDADE_HISTORICA_EM_REVISAO'; v_mode:='CONSULTAR';
    elsif exists(select 1 from public.contas_receber r where r.matricula_id=p_matricula_id
      and r.status<>'CANCELADO' and (r.regra_financeira_tecnica_snapshot#>>'{cicloManual,cicloNumero}'=v_cycle::text
        or r.origem_cronograma_id like 'ciclo-'||v_cycle||'-parc-%'
        or (v_cycle=1 and r.origem_cronograma_id='matricula')
        or (v_cycle=2 and r.origem_cronograma_id='ciclo-1-rematricula'))) then
      v_code:='COBRANCAS_EXISTENTES'; v_mode:='CONSULTAR';
    elsif p_base#>>'{planoEntrada,versao}'='3' and not exists(
      select 1 from jsonb_array_elements(p_base#>'{planoEntrada,itens}') i
      where i->>'cicloNumero'=v_cycle::text) then v_code:='SEM_COBRANCAS_PLANEJADAS';
    elsif p_base->'planoEntrada' is not null and p_base->'planoEntrada'<>'null'::jsonb
      and p_base#>>'{planoEntrada,versao}' is distinct from '3'
      and v_cycle<(p_base#>>'{planoEntrada,cicloInicial}')::integer then
      v_code:='CICLO_FORA_DO_PLANO_INDIVIDUAL';
    elsif p_base#>>'{planoEntrada,cobrarMensalidades}'='false'
      and not coalesce((p_base#>>(case when v_cycle=1
        then '{planoEntrada,condicoes,cobrarMatricula}'::text[]
        else '{planoEntrada,condicoes,cobrarRematricula}'::text[] end))::boolean,false) then
      v_code:='SEM_COBRANCAS_PLANEJADAS';
    end if;
    v_options:=v_options||jsonb_build_array(jsonb_build_object('cicloNumero',v_cycle,
      'acao',v_mode,'podeGerar',v_code is null,'motivo',v_code));
  end loop;
  return jsonb_build_object('versao',1,'naoEmitirPermitido',true,'opcoes',v_options);
end;
$function$;

create function internal_academic.technical_manual_cycle_manager_state(p_matricula_id uuid,p_cycle integer)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_state jsonb; v_decision jsonb; v_option jsonb; v_next integer; v_policy text; v_pending boolean;
begin
  v_state:=internal_academic.technical_manual_cycle_state_before_manager_decision(p_matricula_id);
  v_decision:=internal_academic.manual_cycle_manager_options(p_matricula_id,v_state);
  select exists(select 1 from internal_academic.technical_manual_cycle_runs r
    join public.contas_receber c on c.id=any(r.receivable_ids)
    where r.matricula_id=p_matricula_id and r.state='LOCAL_CREATED' and c.status<>'CANCELADO'
      and not coalesce(internal_academic.manual_cycle_local_receivable_complete(c)
        or internal_academic.technical_manual_banese_receivable_complete(c)
        or internal_academic.technical_manual_banese_receivable_paid_issued(c),false)) into v_pending;
  if p_cycle is null and not v_pending then
    select (o->>'cicloNumero')::integer into v_next from jsonb_array_elements(v_decision->'opcoes') o
      where o->>'podeGerar'='true'
      order by case when o->>'cicloNumero'=v_state->>'proximoCicloNumero' then 0 else 1 end,
        (o->>'cicloNumero')::integer limit 1;
  else v_next:=p_cycle; end if;
  select o into v_option from jsonb_array_elements(v_decision->'opcoes') o
    where o->>'cicloNumero'=v_next::text;
  v_state:=(v_state-'conferenciaProesc')||jsonb_build_object(
    'financeiroMatricula',internal_academic.enrollment_financial_context(p_matricula_id),
    'decisaoGestor',v_decision);
  if v_option->>'podeGerar'='true' then
    v_policy:=encode(extensions.digest(jsonb_build_object('version',1,
      'base',v_state#>>'{politica,fingerprint}','matriculaId',p_matricula_id,
      'cycle',v_next,'decision','MANAGER_EXPLICIT')::text,'sha256'),'hex');
    return v_state||jsonb_build_object('habilitado',true,'modo','MANUAL','estado','ELEGIVEL',
      'podeGerar',true,'proximoCicloNumero',v_next,'cicloMaximo',2,
      'cicloBaseHistorico',coalesce((v_state->>'cicloBaseHistorico')::integer,0),
      'criterioElegibilidade','MANUAL_DECISAO_GESTOR','bloqueio',null,
      'politica',jsonb_build_object('revisao',coalesce((v_state#>>'{politica,revisao}')::integer,1),
        'fingerprint',v_policy));
  end if;
  if p_cycle is not null then
    return v_state||jsonb_build_object('podeGerar',false,'proximoCicloNumero',null,
      'bloqueio',jsonb_build_object('codigo',coalesce(v_option->>'motivo','CICLO_INVALIDO'),
        'mensagem','Consulte a operação existente ou revise a configuração desta matrícula.'));
  end if;
  return v_state||jsonb_build_object('podeGerar',false,'proximoCicloNumero',null);
end;
$function$;

create or replace function internal_academic.technical_manual_cycle_state(p_matricula_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $function$
begin
  return internal_academic.technical_manual_cycle_manager_state(p_matricula_id,null);
exception when data_exception or no_data_found then
  return jsonb_build_object('habilitado',false,'modo',null,'estado','NAO_HABILITADO','podeGerar',false,
    'cicloBaseHistorico',null,'cicloMaximo',null,'proximoCicloNumero',null,
    'primeiroVencimentoSugerido',null,'criterioElegibilidade',null,'politica',null,
    'cicloGerado',null,'bloqueio',null,
    'diagnosticoFinanceiro','Dados desta matrícula exigem conferência; os demais alunos permanecem disponíveis.');
end;
$function$;

revoke all on function internal_academic.manual_cycle_manager_options(uuid,jsonb),
  internal_academic.technical_manual_cycle_manager_state(uuid,integer),
  internal_academic.technical_manual_cycle_state(uuid) from public,anon,authenticated,service_role;


do $patch$
declare v_source text; v_from text; v_to text;
begin
  v_source:=pg_get_functiondef('internal_academic.technical_manual_cycle_reviewed_preview(uuid,integer,date,jsonb)'::regprocedure);
  if md5(v_source)<>'40f8de7439051a4a60bb25d6e1fc4649' then
    raise exception 'Contrato mudou: internal_academic.technical_manual_cycle_reviewed_preview(uuid,integer,date,jsonb)';
  end if;
  v_from:=$old$  perform internal_proesc.assert_fresh_cycle_generation(p_matricula_id);
$old$;
  v_to:=$new$$new$;
  if length(v_source)-length(replace(v_source,v_from,''))<>length(v_from) then
    raise exception 'Fronteira canônica não encontrada: internal_academic.technical_manual_cycle_reviewed_preview(uuid,integer,date,jsonb)';
  end if;
  v_source:=replace(v_source,v_from,v_to);
  v_from:=$old$internal_academic.technical_manual_cycle_state(p_matricula_id)$old$;
  v_to:=$new$internal_academic.technical_manual_cycle_manager_state(p_matricula_id,p_cycle_number)$new$;
  if length(v_source)-length(replace(v_source,v_from,''))<>length(v_from) then
    raise exception 'Fronteira canônica não encontrada: internal_academic.technical_manual_cycle_reviewed_preview(uuid,integer,date,jsonb)';
  end if;
  v_source:=replace(v_source,v_from,v_to);
  execute v_source;

  v_source:=pg_get_functiondef('internal_academic.technical_manual_cycle_reviewed_preview_before_transfer_entry(uuid,integer,date,jsonb)'::regprocedure);
  if md5(v_source)<>'2adfa7680d7901338ca4c219bd2d08e0' then
    raise exception 'Contrato mudou: internal_academic.technical_manual_cycle_reviewed_preview_before_transfer_entry(uuid,integer,date,jsonb)';
  end if;
  v_from:=$old$  perform internal_proesc.assert_fresh_cycle_generation(p_matricula_id);
$old$;
  v_to:=$new$$new$;
  if length(v_source)-length(replace(v_source,v_from,''))<>length(v_from) then
    raise exception 'Fronteira canônica não encontrada: internal_academic.technical_manual_cycle_reviewed_preview_before_transfer_entry(uuid,integer,date,jsonb)';
  end if;
  v_source:=replace(v_source,v_from,v_to);
  v_from:=$old$internal_academic.technical_manual_cycle_state(p_matricula_id)$old$;
  v_to:=$new$internal_academic.technical_manual_cycle_manager_state(p_matricula_id,p_cycle_number)$new$;
  if length(v_source)-length(replace(v_source,v_from,''))<>length(v_from) then
    raise exception 'Fronteira canônica não encontrada: internal_academic.technical_manual_cycle_reviewed_preview_before_transfer_entry(uuid,integer,date,jsonb)';
  end if;
  v_source:=replace(v_source,v_from,v_to);
  execute v_source;

  v_source:=pg_get_functiondef('internal_academic.technical_manual_cycle_preview_before_automatic_proesc(uuid,integer,date)'::regprocedure);
  if md5(v_source)<>'b6e0dd600262f12095fe1c5e6a889fc8' then
    raise exception 'Contrato mudou: internal_academic.technical_manual_cycle_preview_before_automatic_proesc(uuid,integer,date)';
  end if;
  v_from:=$old$internal_academic.technical_manual_cycle_state(p_matricula_id)$old$;
  v_to:=$new$internal_academic.technical_manual_cycle_manager_state(p_matricula_id,p_cycle_number)$new$;
  if length(v_source)-length(replace(v_source,v_from,''))<>length(v_from) then
    raise exception 'Fronteira canônica não encontrada: internal_academic.technical_manual_cycle_preview_before_automatic_proesc(uuid,integer,date)';
  end if;
  v_source:=replace(v_source,v_from,v_to);
  execute v_source;

  v_source:=pg_get_functiondef('public.gerar_ciclo_financeiro_tecnico_manual_secure(uuid,integer,date,uuid,text,text,text,jsonb)'::regprocedure);
  if md5(v_source)<>'b3d2fff8895913b86659b39bc5e892e3' then
    raise exception 'Contrato mudou: public.gerar_ciclo_financeiro_tecnico_manual_secure(uuid,integer,date,uuid,text,text,text,jsonb)';
  end if;
  v_from:=$old$  v_stored_response jsonb;$old$;
  v_to:=$new$  v_stored_response jsonb;
  v_manager_decision jsonb;$new$;
  if length(v_source)-length(replace(v_source,v_from,''))<>length(v_from) then
    raise exception 'Fronteira canônica não encontrada: public.gerar_ciclo_financeiro_tecnico_manual_secure(uuid,integer,date,uuid,text,text,text,jsonb)';
  end if;
  v_source:=replace(v_source,v_from,v_to);
  v_from:=$old$  insert into internal_academic.technical_manual_cycle_runs($old$;
  v_to:=$new$  v_manager_decision:=jsonb_build_object('version',1,'matriculaId',p_matricula_id,
    'turmaId',v_turma_id,'alunoId',v_aluno_id,
    'poloId',(select polo_id from public.turmas where id=v_turma_id),
    'cycleNumber',p_ciclo_numero,'requestId',p_request_id,'actorId',auth.uid(),
    'ruleFingerprint',p_expected_regra_fingerprint,'policyFingerprint',p_expected_politica_fingerprint,
    'scheduleFingerprint',p_expected_cronograma_fingerprint,
    'reviewHash',encode(extensions.digest((v_preview->'itens')::text,'sha256'),'hex'));
  insert into internal_academic.technical_manual_cycle_runs($new$;
  if length(v_source)-length(replace(v_source,v_from,''))<>length(v_from) then
    raise exception 'Fronteira canônica não encontrada: public.gerar_ciclo_financeiro_tecnico_manual_secure(uuid,integer,date,uuid,text,text,text,jsonb)';
  end if;
  v_source:=replace(v_source,v_from,v_to);
  v_from:=$old$    total_amount, created_by, reviewed_items$old$;
  v_to:=$new$    total_amount, created_by, reviewed_items, manager_decision$new$;
  if length(v_source)-length(replace(v_source,v_from,''))<>length(v_from) then
    raise exception 'Fronteira canônica não encontrada: public.gerar_ciclo_financeiro_tecnico_manual_secure(uuid,integer,date,uuid,text,text,text,jsonb)';
  end if;
  v_source:=replace(v_source,v_from,v_to);
  v_from:=$old$    auth.uid(), v_preview -> 'itens'$old$;
  v_to:=$new$    auth.uid(), v_preview -> 'itens', v_manager_decision$new$;
  if length(v_source)-length(replace(v_source,v_from,''))<>length(v_from) then
    raise exception 'Fronteira canônica não encontrada: public.gerar_ciclo_financeiro_tecnico_manual_secure(uuid,integer,date,uuid,text,text,text,jsonb)';
  end if;
  v_source:=replace(v_source,v_from,v_to);
  v_from:=$old$      'revisao', p_revisao,$old$;
  v_to:=$new$      'revisao', p_revisao,
      'decisaoGestor', v_manager_decision,$new$;
  if length(v_source)-length(replace(v_source,v_from,''))<>length(v_from) then
    raise exception 'Fronteira canônica não encontrada: public.gerar_ciclo_financeiro_tecnico_manual_secure(uuid,integer,date,uuid,text,text,text,jsonb)';
  end if;
  v_source:=replace(v_source,v_from,v_to);
  execute v_source;

  v_source:=pg_get_functiondef('internal_academic.guard_technical_manual_cycle_insert()'::regprocedure);
  if md5(v_source)<>'6c3c21a6294bc12373975dd959a2b922' then
    raise exception 'Contrato mudou: internal_academic.guard_technical_manual_cycle_insert()';
  end if;
  v_from:=$old$    if internal_proesc.enrollment_financial_block(new.matricula_id) is not null
      or new.origem_pagamento='SISTEMA_ANTERIOR' then$old$;
  v_to:=$new$    if (internal_proesc.enrollment_financial_block(new.matricula_id) is not null
      and not internal_academic.manual_cycle_manager_creation_claim(new))
      or new.origem_pagamento='SISTEMA_ANTERIOR' then$new$;
  if length(v_source)-length(replace(v_source,v_from,''))<>length(v_from) then
    raise exception 'Fronteira canônica não encontrada: internal_academic.guard_technical_manual_cycle_insert()';
  end if;
  v_source:=replace(v_source,v_from,v_to);
  v_from:=$old$  if new.matricula_id is not null
    and upper$old$;
  v_to:=$new$  if new.matricula_id is not null
    and not internal_academic.manual_cycle_manager_creation_claim(new)
    and upper$new$;
  if length(v_source)-length(replace(v_source,v_from,''))<>length(v_from) then
    raise exception 'Fronteira canônica não encontrada: internal_academic.guard_technical_manual_cycle_insert()';
  end if;
  v_source:=replace(v_source,v_from,v_to);
  v_from:=$old$  if internal_academic.is_technical_manual_cycle_protected(new.matricula_id)
$old$;
  v_to:=$new$  if internal_academic.is_technical_manual_cycle_protected(new.matricula_id)
    and not internal_academic.manual_cycle_manager_creation_claim(new)
$new$;
  if length(v_source)-length(replace(v_source,v_from,''))<>length(v_from) then
    raise exception 'Fronteira canônica não encontrada: internal_academic.guard_technical_manual_cycle_insert()';
  end if;
  v_source:=replace(v_source,v_from,v_to);
  execute v_source;

  v_source:=pg_get_functiondef('internal_proesc.guard_fresh_cycle_generation_insert()'::regprocedure);
  if md5(v_source)<>'9fbf770d03d43eb7c62432841a36241d' then
    raise exception 'Contrato mudou: internal_proesc.guard_fresh_cycle_generation_insert()';
  end if;
  v_from:=$old$  perform internal_proesc.assert_fresh_cycle_generation(new.matricula_id);$old$;
  v_to:=$new$  if not internal_academic.manual_cycle_manager_creation_claim(new) then
    perform internal_proesc.assert_fresh_cycle_generation(new.matricula_id);
  end if;$new$;
  if length(v_source)-length(replace(v_source,v_from,''))<>length(v_from) then
    raise exception 'Fronteira canônica não encontrada: internal_proesc.guard_fresh_cycle_generation_insert()';
  end if;
  v_source:=replace(v_source,v_from,v_to);
  execute v_source;

  v_source:=pg_get_functiondef('public.authorize_technical_manual_receivable_issuance_secure(uuid,uuid)'::regprocedure);
  if md5(v_source)<>'3cad6685913547a810e706ea8305d636' then
    raise exception 'Contrato mudou: public.authorize_technical_manual_receivable_issuance_secure(uuid,uuid)';
  end if;
  v_from:=$old$  ) and not internal_academic
    .technical_imported_c1_receivable_is_local_c2($old$;
  v_to:=$new$  ) and not internal_academic.manual_cycle_manager_receivable_valid(v_receivable.id,v_receivable.matricula_id)
    and not internal_academic
    .technical_imported_c1_receivable_is_local_c2($new$;
  if length(v_source)-length(replace(v_source,v_from,''))<>length(v_from) then
    raise exception 'Fronteira canônica não encontrada: public.authorize_technical_manual_receivable_issuance_secure(uuid,uuid)';
  end if;
  v_source:=replace(v_source,v_from,v_to);
  execute v_source;

  v_source:=pg_get_functiondef('internal_academic.guard_manual_technical_receivable_first_bank_claim()'::regprocedure);
  if md5(v_source)<>'4259b04ad2ddb8c3f7e8df425bcd5789' then
    raise exception 'Contrato mudou: internal_academic.guard_manual_technical_receivable_first_bank_claim()';
  end if;
  v_from:=$old$  if v_protected_enrollment and not internal_academic
$old$;
  v_to:=$new$  if v_first_claim
    and internal_academic.manual_cycle_manager_receivable_valid(new.id,new.matricula_id)
    and not internal_academic.manual_cycle_manager_first_post_allowed(new.id,new.matricula_id) then
    raise exception 'Nova prova externa ou conflito de identidade exige revisão antes do primeiro POST.' using errcode='42501';
  end if;
  if v_protected_enrollment
    and not internal_academic.manual_cycle_manager_receivable_valid(new.id,new.matricula_id)
    and not internal_academic
$new$;
  if length(v_source)-length(replace(v_source,v_from,''))<>length(v_from) then
    raise exception 'Fronteira canônica não encontrada: internal_academic.guard_manual_technical_receivable_first_bank_claim()';
  end if;
  v_source:=replace(v_source,v_from,v_to);
  execute v_source;

  v_source:=pg_get_functiondef('internal_academic.guard_protected_technical_bank_post()'::regprocedure);
  if md5(v_source)<>'dbc80847ff658fc87c8d8d52982f3004' then
    raise exception 'Contrato mudou: internal_academic.guard_protected_technical_bank_post()';
  end if;
  v_from:=$old$  if internal_academic.is_technical_manual_cycle_protected(new.matricula_id)
$old$;
  v_to:=$new$  if internal_academic.is_technical_manual_cycle_protected(new.matricula_id)
    and not internal_academic.manual_cycle_manager_receivable_valid(new.id,new.matricula_id)
$new$;
  if length(v_source)-length(replace(v_source,v_from,''))<>length(v_from) then
    raise exception 'Fronteira canônica não encontrada: internal_academic.guard_protected_technical_bank_post()';
  end if;
  v_source:=replace(v_source,v_from,v_to);
  execute v_source;

  v_source:=pg_get_functiondef('internal_academic.is_individual_manual_cycle_receivable(public.contas_receber,boolean)'::regprocedure);
  if md5(v_source)<>'4c0a4f7dd114ec6739eb81ae2ee04874' then
    raise exception 'Contrato mudou: internal_academic.is_individual_manual_cycle_receivable(public.contas_receber,boolean)';
  end if;
  v_from:=$old$  select internal_academic.technical_local_cycle_eligible((p_receivable).matricula_id)$old$;
  v_to:=$new$  select (internal_academic.technical_local_cycle_eligible((p_receivable).matricula_id)
    or (p_creating and internal_academic.manual_cycle_manager_creation_claim(p_receivable))
    or (not p_creating and exists(select 1 from internal_academic.technical_manual_cycle_runs r
      where r.state='LOCAL_CREATED' and p_receivable.id=any(r.receivable_ids)
        and internal_academic.manual_cycle_manager_decision_valid(r))))$new$;
  if length(v_source)-length(replace(v_source,v_from,''))<>length(v_from) then
    raise exception 'Fronteira canônica não encontrada: internal_academic.is_individual_manual_cycle_receivable(public.contas_receber,boolean)';
  end if;
  v_source:=replace(v_source,v_from,v_to);
  execute v_source;

end;
$patch$;
commit;
