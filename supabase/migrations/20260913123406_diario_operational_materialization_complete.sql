-- One transaction fills the existing diary and publishes its completion marker.
create table internal_academic.diario_materializacoes (
  importacao_id uuid primary key references internal_academic.diario_importacoes(id),
  request_id uuid not null unique references internal_academic.diario_aulas_materializacao_requests(request_id),
  payload_sha256 text not null check (payload_sha256 ~ '^[a-f0-9]{64}$'),
  response jsonb not null,
  completed_at timestamptz not null default clock_timestamp()
);
alter table internal_academic.diario_materializacoes enable row level security;
revoke all on internal_academic.diario_materializacoes from public,anon,authenticated,service_role;

create function public.materializar_diario_operacional_secure(
  p_request_id uuid,p_importacao_id uuid,p_preview_sha256 text,p_payload_sha256 text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_source internal_academic.diario_importacoes;
  v_lessons jsonb;
  v_records jsonb;
  v_response jsonb;
begin
  if coalesce((select auth.role()),'') <> 'service_role' then
    raise exception 'Materialização restrita ao serviço autorizado.' using errcode='42501';
  end if;
  select * into strict v_source from internal_academic.diario_importacoes where id=p_importacao_id;
  if p_payload_sha256 is distinct from v_source.payload_sha256 then
    raise exception 'A fonte não corresponde à transcrição conferida.' using errcode='23514';
  end if;
  v_lessons:=public.materializar_aulas_diario_importado_secure(
    p_request_id,p_importacao_id,p_preview_sha256);
  v_records:=public.materializar_diario_notas_frequencia(p_importacao_id,p_payload_sha256);
  if (v_records->>'notes')::integer<>(select count(*) from internal_academic.diario_resultados_importados
      where importacao_id=p_importacao_id and ativo)
    or (v_records->>'attendance')::integer<>(select count(*) from internal_academic.diario_frequencias_importadas f
      join internal_academic.diario_resultados_importados r on r.id=f.resultado_id
      where f.importacao_id=p_importacao_id and r.ativo) then
    raise exception 'A transcrição não cobriu todos os registros vinculados.' using errcode='23514';
  end if;
  v_response:=jsonb_build_object('status','MATERIALIZADO','importacaoId',p_importacao_id,
    'lessons',v_lessons,'records',v_records,'unresolvedStudents',
    (select count(*) from jsonb_array_elements(v_source.payload->'students') s
      where coalesce(s#>>'{identity,status}','REVIEW')<>'MATCHED'));
  insert into internal_academic.diario_materializacoes(importacao_id,request_id,payload_sha256,response)
    values(p_importacao_id,p_request_id,p_payload_sha256,v_response)
    on conflict(importacao_id) do nothing;
  if not exists(select 1 from internal_academic.diario_materializacoes
      where importacao_id=p_importacao_id and request_id=p_request_id and payload_sha256=p_payload_sha256) then
    raise exception 'Conclusão existente pertence a outra transcrição.' using errcode='23505';
  end if;
  return v_response;
end;
$$;
revoke all on function public.materializar_diario_operacional_secure(uuid,uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.materializar_diario_operacional_secure(uuid,uuid,text,text) to service_role;
