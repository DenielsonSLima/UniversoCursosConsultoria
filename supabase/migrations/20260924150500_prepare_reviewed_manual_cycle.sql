begin;

CREATE OR REPLACE FUNCTION public.preparar_emissao_ciclo_financeiro_tecnico_manual_secure(p_matricula_id uuid, p_ciclo_numero integer, p_primeiro_vencimento date, p_request_id uuid, p_expected_regra_fingerprint text, p_expected_politica_fingerprint text, p_expected_cronograma_fingerprint text, p_revisao jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_result jsonb;
  v_receivable jsonb;
  v_receivable_id uuid;
  v_updated integer := 0;
  v_receivables jsonb := '[]'::jsonb;
begin
  v_result := public.gerar_ciclo_financeiro_tecnico_manual_secure(
    p_matricula_id,
    p_ciclo_numero,
    p_primeiro_vencimento,
    p_request_id,
    p_expected_regra_fingerprint,
    p_expected_politica_fingerprint,
    p_expected_cronograma_fingerprint,
    p_revisao
  );

  for v_receivable in
    select item from jsonb_array_elements(v_result -> 'ciclo' -> 'recebiveis')
      as item
  loop
    v_receivable_id := (v_receivable ->> 'id')::uuid;
    update public.contas_receber receivable
    set forma_pagamento = 'BOLETO',
        gateway_payment_method = 'BOLETO',
        updated_at = case
          when receivable.forma_pagamento is distinct from 'BOLETO'
            or receivable.gateway_payment_method is distinct from 'BOLETO'
          then clock_timestamp()
          else receivable.updated_at
        end
    where receivable.id = v_receivable_id
      and receivable.matricula_id = p_matricula_id
      and upper(coalesce(receivable.status, '')) in ('PENDENTE', 'VENCIDO')
      and coalesce(receivable.forma_pagamento, 'BOLETO') = 'BOLETO'
      and coalesce(receivable.gateway_payment_method, 'BOLETO') = 'BOLETO'
      and receivable.gateway_payment_id is null
      and receivable.gateway_payment_link_id is null
      and receivable.gateway_submission_status is null;
    if not found then
      if not exists (
        select 1 from public.contas_receber receivable
        where receivable.id = v_receivable_id
          and receivable.matricula_id = p_matricula_id
          and receivable.forma_pagamento = 'BOLETO'
          and receivable.gateway_payment_method = 'BOLETO'
          and receivable.gateway_provider = 'banese_card'
          and receivable.gateway_environment = 'production'
          and receivable.gateway_submission_status = 'API_REGISTERED'
      ) then
        raise exception 'Recebível do ciclo não pode ser preparado para BolePix.'
          using errcode = '40001';
      end if;
    end if;
    v_updated := v_updated + 1;
    v_receivables := v_receivables || jsonb_build_array(
      (v_receivable - 'emissaoBanese') || jsonb_build_object(
        'emissaoBanese', case
          when exists (
            select 1 from public.contas_receber receivable
            where receivable.id = v_receivable_id
              and receivable.gateway_submission_status = 'API_REGISTERED'
          ) then 'EMITIDO'
          else 'PENDENTE'
        end
      )
    );
  end loop;

  if v_updated <> (v_result -> 'ciclo' ->> 'quantidadeItens')::integer then
    raise exception 'A preparação Banese não cobriu todos os recebíveis.'
      using errcode = 'P0001';
  end if;

  perform public.registrar_turma_financeiro_auditoria(
    p_matricula_id,
    'CICLO_TECNICO_MANUAL_PREPARADO_BANESE',
    jsonb_build_object(
      'cicloNumero', p_ciclo_numero,
      'quantidadeItens', v_updated,
      'requestId', p_request_id,
      'metodo', 'BOLETO',
      'ambienteExigido', 'production'
    ),
    'Confirmação única preparou todos os itens para emissão sequencial BolePix.'
  );

  return jsonb_set(
    jsonb_set(
      v_result,
      '{ciclo,status}',
      to_jsonb('PRONTO_PARA_EMISSAO_BANESE'::text),
      true
    ),
    '{ciclo,recebiveis}',
    v_receivables,
    true
  );
end;
$function$;

revoke all on function public.preparar_emissao_ciclo_financeiro_tecnico_manual_secure(
  uuid, integer, date, uuid, text, text, text, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.preparar_emissao_ciclo_financeiro_tecnico_manual_secure(
  uuid, integer, date, uuid, text, text, text, jsonb
) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
