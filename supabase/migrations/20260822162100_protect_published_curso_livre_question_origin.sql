begin;

create or replace function internal_academic.protect_curso_livre_questao_publicada()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_old_assessment_id uuid := case
    when tg_op in ('UPDATE', 'DELETE') then old.avaliacao_id else null
  end;
  v_new_assessment_id uuid := case
    when tg_op in ('INSERT', 'UPDATE') then new.avaliacao_id else null
  end;
begin
  if exists (
    select 1
    from public.curso_livre_avaliacoes assessment
    where assessment.id in (v_old_assessment_id, v_new_assessment_id)
      and assessment.status = 'PUBLICADA'
  ) then
    raise exception 'Questões de avaliação Livre publicada são imutáveis.'
      using errcode = '55000';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

revoke all on function internal_academic.protect_curso_livre_questao_publicada()
  from public, anon, authenticated, service_role;

commit;
