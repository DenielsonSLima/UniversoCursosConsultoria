begin;
create function internal_academic.transfer_schedule_reviewed_items(
  p_entry internal_academic.technical_transfer_entry_plans,p_cycle integer,p_review jsonb,
  p_class_code text,p_class_name text
)
returns jsonb language plpgsql stable set search_path='' as $function$
declare v_items jsonb:='[]'; v_omitted jsonb:='null'; v_edits jsonb:=coalesce(p_review->'itens','[]');
  v_item jsonb; v_edit jsonb; v_row jsonb; v_rule jsonb; v_kind text; v_mode text;
  v_key text; v_number integer:=0; v_count integer; v_has_fee boolean; v_description text;
  v_today date:=timezone('America/Maceio',now())::date;
begin
  select count(*) filter(where i->>'tipo'='PARCELA'),bool_or(i->>'tipo'='MATRICULA')
    into v_count,v_has_fee from jsonb_array_elements(p_entry.financial_plan->'itens') i
    where (i->>'cicloNumero')::integer=p_cycle;
  v_has_fee:=coalesce(v_has_fee,false);
  v_mode:=case when p_cycle=1 and not v_has_fee and p_review is null then 'OMITIR'
    else internal_academic.manual_cycle_enrollment_mode(p_review) end;
  if (p_cycle=1 and not v_has_fee and v_mode<>'OMITIR')
    or (p_cycle=2 and v_mode<>'BOLETO') then
    raise exception 'O tratamento da matrícula não corresponde ao cronograma recebido.' using errcode='22023'; end if;
  if p_review is not null and (jsonb_typeof(p_review) is distinct from 'object'
    or exists(select 1 from jsonb_object_keys(p_review) k where k not in ('modoMatricula','emitirMatricula','itens'))
    or jsonb_typeof(v_edits) is distinct from 'array'
    or jsonb_array_length(v_edits)>61
    or exists(select 1 from jsonb_array_elements(v_edits) e
      where jsonb_typeof(e) is distinct from 'object' or jsonb_typeof(e->'chave') is distinct from 'string'
        or exists(select 1 from jsonb_object_keys(e) k where k not in ('chave','valor','vencimento',
          'descontoPontualidade','jurosAtrasoPercentual','multaAtrasoPercentual')))
    or (select count(*) from jsonb_array_elements(v_edits))<>
      (select count(distinct e->>'chave') from jsonb_array_elements(v_edits) e)) then
    raise exception 'A revisão contém campos inválidos ou itens repetidos.' using errcode='22023'; end if;
  for v_row in select i from jsonb_array_elements(p_entry.financial_plan->'itens') i
    where (i->>'cicloNumero')::integer=p_cycle order by (i->>'ordem')::integer loop
    if v_row->>'tipo'='PARCELA' then
      v_number:=v_number+1; v_key:='ciclo-'||p_cycle||'-parc-'||v_number;
      v_description:='Mensalidade '||v_number||'/'||v_count||' - Ciclo '||p_cycle||' - '||p_class_name;
    elsif v_row->>'tipo'='MATRICULA' then
      v_key:='matricula'; v_description:='Matrícula - Ciclo 1 - '||p_class_name;
    else
      v_key:='ciclo-1-rematricula'; v_description:='Rematrícula - Ciclo 2 - '||p_class_name;
    end if;
    select e into v_edit from jsonb_array_elements(v_edits) e where e->>'chave'=v_key;
    if v_edit is not null then
      v_row:=v_row||(v_edit-'chave');
      if not (v_edit ?& array['valor','vencimento','descontoPontualidade','jurosAtrasoPercentual','multaAtrasoPercentual']) then
        raise exception 'Preencha valor, vencimento e encargos de cada item revisado.' using errcode='22023'; end if;
    end if;
    -- A revisão permite datas independentes, mas conserva identidade, tipo e ciclo.
    v_row:=internal_academic.normalize_transfer_schedule(p_entry.rule_snapshot,
      jsonb_build_object('versao',3,'itens',jsonb_build_array(v_row)),false)#>'{itens,0}';
    v_kind:=case v_row->>'tipo' when 'MATRICULA' then 'matricula'
      when 'REMATRICULA' then 'rematricula' else 'mensalidade' end;
    v_rule:=jsonb_set(p_entry.rule_snapshot,'{encargos}',jsonb_build_object(
      'descontoPontualidade',v_row->>'descontoPontualidade',
      'jurosAtrasoPercentual',v_row->>'jurosAtrasoPercentual',
      'multaAtrasoPercentual',v_row->>'multaAtrasoPercentual'));
    v_rule:=jsonb_set(v_rule,array['aplicacao',v_kind],jsonb_build_object(
      'desconto',(v_row->>'descontoPontualidade')::numeric>0,
      'multaJuros',(v_row->>'jurosAtrasoPercentual')::numeric>0 or (v_row->>'multaAtrasoPercentual')::numeric>0));
    v_item:=jsonb_build_object('itemId',v_row->>'itemId','chave',v_key,'tipo',v_row->>'tipo',
      'numero',case when v_row->>'tipo'='PARCELA' then v_number else 0 end,
      'descricao',v_description,'valor',v_row->>'valor','vencimento',v_row->>'vencimento',
      'aplicacao',v_rule#>array['aplicacao',v_kind],
      'destinoCobranca',case when v_row->>'tipo'='MATRICULA' and v_mode='REGISTRO_SEM_BOLETO'
        then 'LOCAL' else 'BANESE' end,
      'detalhesBoleto',internal_academic.technical_manual_cycle_boleto_details(
        (v_row->>'valor')::numeric,(v_row->>'vencimento')::date,v_rule,upper(v_kind),
        v_description,p_class_code,p_class_name));
    if v_row->>'tipo'='MATRICULA' and v_mode='OMITIR' then
      v_omitted:=v_item; continue; end if;
    if not internal_academic.manual_cycle_due_is_allowed(v_row->>'tipo',
      (v_row->>'vencimento')::date,v_mode,v_today) then
      raise exception 'Revise o vencimento individual: cobranças entre hoje e cinco anos; matrícula local admite até cinco anos anteriores.' using errcode='22023'; end if;
    v_items:=v_items||jsonb_build_array(v_item);
  end loop;
  if exists(select 1 from jsonb_array_elements(v_edits) e where not exists(
    select 1 from jsonb_array_elements(v_items||case when v_omitted='null'::jsonb
      then '[]'::jsonb else jsonb_build_array(v_omitted) end) i where i->>'chave'=e->>'chave')) then
    raise exception 'A revisão contém cobrança que não pertence ao ciclo recebido.' using errcode='22023'; end if;
  if jsonb_array_length(v_items)=0 then
    raise exception 'Selecione ao menos uma cobrança do cronograma recebido.' using errcode='22023'; end if;
  return jsonb_build_object('itens',v_items,'matriculaSemBoleto',v_omitted,'modoMatricula',v_mode,
    'quantidadeBancaria',(select count(*) from jsonb_array_elements(v_items) i where i->>'destinoCobranca'='BANESE'),
    'quantidadeLocal',(select count(*) from jsonb_array_elements(v_items) i where i->>'destinoCobranca'='LOCAL'));
end;
$function$;

alter function internal_academic.technical_manual_cycle_reviewed_preview(uuid,integer,date,jsonb)
  rename to technical_manual_cycle_reviewed_preview_before_transfer_schedule;
create function internal_academic.technical_manual_cycle_reviewed_preview(
  p_matricula_id uuid,p_cycle_number integer,p_first_due_date date,p_review jsonb
)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_entry internal_academic.technical_transfer_entry_plans%rowtype;
  v_enrollment public.matriculas%rowtype; v_class public.turmas%rowtype;
  v_state jsonb; v_rule jsonb; v_reviewed jsonb; v_items jsonb;
  v_rule_fingerprint text; v_policy_fingerprint text; v_schedule_fingerprint text;
  v_first date; v_origin date; v_source text; v_total numeric; v_monthly boolean;
begin
  select * into v_entry from internal_academic.technical_transfer_entry_plans where matricula_id=p_matricula_id;
  if not found or v_entry.financial_plan->'versao' is distinct from '3'::jsonb then
    return internal_academic.technical_manual_cycle_reviewed_preview_before_transfer_schedule(
      p_matricula_id,p_cycle_number,p_first_due_date,p_review);
  end if;
  perform internal_proesc.assert_fresh_cycle_generation(p_matricula_id);
  select * into strict v_enrollment from public.matriculas where id=p_matricula_id;
  select * into strict v_class from public.turmas where id=v_enrollment.turma_id;
  v_state:=internal_academic.technical_manual_cycle_state(p_matricula_id);
  if not coalesce((v_state->>'habilitado')::boolean,false)
    or p_cycle_number is distinct from (v_state->>'proximoCicloNumero')::integer then
    raise exception 'Ciclo técnico manual inválido para esta matrícula.' using errcode='22023'; end if;
  if not coalesce((v_state->>'podeGerar')::boolean,false) then
    raise exception '%',coalesce(v_state#>>'{bloqueio,mensagem}','Ciclo indisponível.') using errcode='P0001'; end if;
  v_rule:=internal_academic.technical_financial_effective_rule(p_matricula_id);
  v_rule_fingerprint:=v_rule#>>'{identidade,efetivaFingerprint}';
  v_policy_fingerprint:=v_state#>>'{politica,fingerprint}';
  v_reviewed:=internal_academic.transfer_schedule_reviewed_items(v_entry,p_cycle_number,p_review,v_class.codigo,v_class.nome);
  v_items:=v_reviewed->'itens';
  v_first:=(v_items#>>'{0,vencimento}')::date;
  v_origin:=coalesce(p_first_due_date,(v_state->>'primeiroVencimentoSugerido')::date,v_first);
  v_source:=case when p_first_due_date is null and p_cycle_number=1 then 'TURMA' else 'INDIVIDUAL' end;
  select sum((i->>'valor')::numeric),bool_or(i->>'tipo'='PARCELA') into v_total,v_monthly
    from jsonb_array_elements(v_items) i;
  -- O parâmetro de data legado não redistribui um cronograma explícito.
  v_schedule_fingerprint:=encode(extensions.digest(jsonb_build_object('matriculaId',p_matricula_id,
    'cicloNumero',p_cycle_number,'sourceVencimento',v_source,'dataOrigem',v_origin,
    'primeiroVencimento',v_first,'itens',v_items,'matriculaSemBoleto',v_reviewed->'matriculaSemBoleto',
    'regraEfetivaFingerprint',v_rule_fingerprint,'politicaFingerprint',v_policy_fingerprint,
    'cronogramaEntradaFingerprint',internal_academic.transfer_schedule_fingerprint(v_entry.financial_plan))::text,'sha256'),'hex');
  return jsonb_build_object('matriculaId',p_matricula_id,'turmaId',v_enrollment.turma_id,'cicloManual',v_state,
    'preview',jsonb_build_object('cicloNumero',p_cycle_number,'sourceVencimento',v_source,
      'dataOrigem',v_origin,'primeiroVencimento',v_first,'quantidadeItens',jsonb_array_length(v_items),
      'modoMatricula',v_reviewed->>'modoMatricula','quantidadeBancaria',v_reviewed->'quantidadeBancaria',
      'quantidadeLocal',v_reviewed->'quantidadeLocal','total',to_char(v_total,'FM999999999990.00'),
      'termos',internal_academic.technical_manual_cycle_terms(v_rule),'itens',v_items,
      'matriculaSemBoleto',v_reviewed->'matriculaSemBoleto','mensalidadesHabilitadas',coalesce(v_monthly,false),
      'regraEfetivaFingerprint',v_rule_fingerprint,'politicaFingerprint',v_policy_fingerprint,
      'cronogramaFingerprint',v_schedule_fingerprint,'cronogramaEntradaVersao',3,
      'cronogramaEntradaFingerprint',internal_academic.transfer_schedule_fingerprint(v_entry.financial_plan)));
end;
$function$;
revoke all on function internal_academic.transfer_schedule_reviewed_items(
    internal_academic.technical_transfer_entry_plans,integer,jsonb,text,text),
  internal_academic.technical_manual_cycle_reviewed_preview(uuid,integer,date,jsonb),
  internal_academic.technical_manual_cycle_reviewed_preview_before_transfer_schedule(uuid,integer,date,jsonb)
  from public,anon,authenticated,service_role;
commit;
