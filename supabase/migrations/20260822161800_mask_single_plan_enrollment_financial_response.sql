begin;

alter function public.matricular_aluno_plano_financeiro_unico_v2_secure(
  uuid, uuid, uuid, integer, text, jsonb, boolean, text, text, text
) rename to matricular_aluno_plano_financeiro_unico_v2_core_20260822;

revoke all on function public.matricular_aluno_plano_financeiro_unico_v2_core_20260822(
  uuid, uuid, uuid, integer, text, jsonb, boolean, text, text, text
) from public, anon, authenticated, service_role;

create or replace function public.matricular_aluno_plano_financeiro_unico_v2_secure(
  p_request_id uuid,
  p_turma_id uuid,
  p_aluno_id uuid,
  p_expected_revisao integer,
  p_expected_fingerprint text,
  p_ajuste jsonb,
  p_gerar_agora boolean,
  p_codigo text default null,
  p_motivo text default null,
  p_justificativa text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_response jsonb;
  v_can_view_finance boolean;
begin
  v_response := public.matricular_aluno_plano_financeiro_unico_v2_core_20260822(
    p_request_id, p_turma_id, p_aluno_id,
    p_expected_revisao, p_expected_fingerprint,
    p_ajuste, p_gerar_agora, p_codigo, p_motivo, p_justificativa
  );
  v_can_view_finance := internal_academic.is_service_financial_actor()
    or public.gestor_has_tab('gestao', 'financeiro');
  if not v_can_view_finance then
    v_response := jsonb_set(v_response, '{regra}', 'null'::jsonb, true);
    v_response := jsonb_set(v_response, '{parcelas}', '[]'::jsonb, true);
    v_response := jsonb_set(v_response, '{parcelasInseridas}', '0'::jsonb, true);
    v_response := jsonb_set(v_response, '{parcelasGeradas}', '0'::jsonb, true);
  end if;
  return v_response;
end;
$function$;

revoke all on function public.matricular_aluno_plano_financeiro_unico_v2_secure(
  uuid, uuid, uuid, integer, text, jsonb, boolean, text, text, text
) from public, anon;
grant execute on function public.matricular_aluno_plano_financeiro_unico_v2_secure(
  uuid, uuid, uuid, integer, text, jsonb, boolean, text, text, text
) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
