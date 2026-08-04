-- Align the student portal opt-in with the canonical origin values enforced by
-- comunicacao_preferencias_origem_check. The UI is only the consent surface;
-- validation and evidence continue to be owned by this backend RPC.

create or replace function public.aluno_push_marketing_preferencia_atualizar(
  p_allowed boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_aluno_id uuid := public.current_aluno_id();
begin
  if v_aluno_id is null then
    raise exception 'ALUNO_IDENTITY_REQUIRED' using errcode = '42501';
  end if;

  if p_allowed is null then
    raise exception 'INVALID_MARKETING_PREFERENCE' using errcode = '22023';
  end if;

  insert into public.comunicacao_preferencias (
    aluno_id,
    canal,
    finalidade,
    permitida,
    origem,
    base_legal,
    politica_versao,
    evidencia,
    consentida_em,
    revogada_em,
    metadata
  ) values (
    v_aluno_id,
    'push',
    'marketing',
    p_allowed,
    'app',
    case when p_allowed then 'consentimento' else null end,
    'push-marketing-v1',
    jsonb_build_object(
      'surface', 'student_notification_center',
      'actorAuthUserId', auth.uid()
    ),
    case when p_allowed then now() else null end,
    case when p_allowed then null else now() end,
    '{}'::jsonb
  )
  on conflict (aluno_id, canal, finalidade) do update
  set permitida = excluded.permitida,
      origem = excluded.origem,
      base_legal = excluded.base_legal,
      politica_versao = excluded.politica_versao,
      evidencia = excluded.evidencia,
      consentida_em = excluded.consentida_em,
      revogada_em = excluded.revogada_em,
      metadata = excluded.metadata;

  return public.aluno_push_marketing_preferencia_obter();
end;
$$;

revoke all on function public.aluno_push_marketing_preferencia_atualizar(boolean)
from public, anon;
grant execute on function public.aluno_push_marketing_preferencia_atualizar(boolean)
to authenticated;
