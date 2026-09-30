-- Run via MCP Supabase. Audit current T42 states without issuing any charge.
-- Enrollment counts are observations, not immutable eligibility rules.
begin read only;
do $verify_t42$
declare
  v_count integer := 0;
  v_eligible integer := 0;
  v_blocked integer := 0;
  v_protected integer := 0;
  v_state jsonb;
  v_row record;
  v_preview jsonb;
  v_item jsonb;
  v_items jsonb;
  v_due date := (timezone('America/Maceio', now()))::date + 30;
begin
  for v_row in select enrollment.id, enrollment.status from public.matriculas enrollment
    join public.turmas class on class.id = enrollment.turma_id
    where class.codigo = 'ENF-T42-INT-MAT'
  loop
    v_count := v_count + 1;
    v_state := internal_academic.technical_manual_cycle_state(v_row.id);
    assert v_state ->> 'cicloBaseHistorico' = '1'
      and v_state ->> 'cicloMaximo' = '2', 'A política T42 mudou.';
    if v_state ->> 'estado' = 'ELEGIVEL' then
      v_eligible := v_eligible + 1;
      assert upper(v_row.status) = 'ATIVO'
        and v_state ->> 'podeGerar' = 'true'
        and v_state ->> 'proximoCicloNumero' = '2'
        and v_state ->> 'criterioElegibilidade' = 'HISTORICO_EXTERNO',
        'Elegibilidade T42 incompatível com a política importada.';
      assert internal_proesc.is_t42_durable_imported_c1(v_row.id)
        and not (v_state ? 'conferenciaProesc'),
        'C1 confirmado ainda depende de conferência online.';
      v_preview := internal_academic.technical_manual_cycle_preview(
        v_row.id, 2, v_due
      );
      if v_preview -> 'preview' ->> 'cicloNumero' is distinct from '2'
        or (v_preview -> 'preview' ->> 'quantidadeItens')::integer is distinct from 13
        or (v_preview -> 'preview' ->> 'quantidadeBancaria')::integer is distinct from 13
        or (v_preview -> 'preview' ->> 'quantidadeLocal')::integer is distinct from 0
      then raise exception 'Prévia do segundo ciclo incompatível.'; end if;
      v_items := v_preview #> '{preview,itens}';
      assert jsonb_array_length(v_items) = 13
        and (select count(distinct item ->> 'chave') from jsonb_array_elements(v_items) item) = 13
        and (select count(distinct (item ->> 'numero')::integer)
          from jsonb_array_elements(v_items) item) = 13
        and (select count(*) from jsonb_array_elements(v_items) item
          where item ->> 'tipo' = 'REMATRICULA' and item ->> 'numero' = '0') = 1
        and (select count(*) from jsonb_array_elements(v_items) item
          where item ->> 'tipo' = 'PARCELA'
            and (item ->> 'numero')::integer between 1 and 12) = 12,
        'C2 deve conter uma rematrícula e doze mensalidades únicas.';
      for v_item in select value from jsonb_array_elements(v_items)
      loop
        assert v_item ->> 'destinoCobranca' = 'BANESE',
          'Uma cobrança futura foi destinada a outro sistema.';
        assert (v_item ->> 'vencimento')::date =
          (v_due + make_interval(months => (v_item ->> 'numero')::integer))::date,
          'Vencimento C2 divergiu da sequência mensal.';
      end loop;
    else
      assert v_state ->> 'podeGerar' = 'false',
        'Estado não elegível permitiu geração.';
      if v_state ->> 'estado' = 'BLOQUEADO' then
        v_blocked := v_blocked + 1;
        assert v_state #>> '{bloqueio,codigo}' is not null,
          'Bloqueio sem motivo canônico.';
      elsif v_state ->> 'estado' in ('JA_GERADO', 'PROTEGIDO_EXISTENTE') then
        v_protected := v_protected + 1;
      else
        raise exception 'Estado T42 não contemplado pelo contrato.';
      end if;
      begin
        perform internal_academic.technical_manual_cycle_preview(v_row.id, 2, v_due);
        raise exception 'Histórico protegido ou bloqueado aceitou nova prévia.' using errcode = 'P9001';
      exception when invalid_parameter_value or insufficient_privilege then null;
      end;
    end if;
    begin
      perform internal_academic.technical_manual_cycle_preview(v_row.id, 1, v_due);
      raise exception 'O primeiro ciclo não pode ser gerado.' using errcode = 'P9001';
    exception when invalid_parameter_value or insufficient_privilege then null;
    end;
    begin
      perform internal_academic.technical_manual_cycle_preview(v_row.id, 3, v_due);
      raise exception 'O terceiro ciclo não pode ser gerado.' using errcode = 'P9001';
    exception when invalid_parameter_value or insufficient_privilege then null;
    end;
  end loop;
  assert v_count > 0 and v_eligible > 0,
    'Não foi possível exercer a turma e ao menos uma prévia elegível.';
  assert v_count = v_eligible + v_blocked + v_protected,
    'A auditoria não cobriu toda a turma.';
end;
$verify_t42$;


do $authorization_check$
declare
  v_id uuid;
  v_role text;
  v_helper text;
begin
  select enrollment.id into v_id from public.matriculas enrollment
  join public.turmas class on class.id=enrollment.turma_id
  where class.codigo='ENF-T42-INT-MAT' limit 1;
  perform set_config('request.jwt.claims', '{}', true);
  perform set_config('request.jwt.claim.role', '', true);
  begin
    perform public.preview_ciclo_financeiro_tecnico_manual_secure(v_id, 2, current_date + 30);
    raise exception 'A prévia exige autorização financeira.' using errcode='P9001';
  exception when insufficient_privilege then null;
  end;
  foreach v_role in array array['anon', 'authenticated'] loop
    foreach v_helper in array array[
      'internal_academic.technical_manual_cycle_state(uuid)',
      'internal_academic.technical_manual_cycle_policy_projection(uuid)',
      'internal_academic.technical_manual_cycle_preview(uuid,integer,date)',
      'internal_proesc.is_t42_durable_imported_c1(uuid)'
    ] loop
      assert not has_function_privilege(v_role, v_helper, 'EXECUTE'),
        'Helpers internos não podem ser expostos: ' || v_role || ' / ' || v_helper;
    end loop;
  end loop;
end;
$authorization_check$;
select 'T42: todas as matrículas auditadas; somente C2 confirmado tem prévia Banese.' as result;
rollback;
