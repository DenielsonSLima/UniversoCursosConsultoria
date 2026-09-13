-- Preserve the immutable source while filling the existing operational diary.
alter table public.diario_notas
  add column origem_resultado_historico_id uuid unique
    references internal_academic.diario_resultados_importados(id),
  add column media_parcial_documental numeric check (media_parcial_documental between 0 and 10),
  add column media_final_documental numeric check (media_final_documental between 0 and 10),
  add column instrumentos_documentais jsonb,
  add column resultados_documentais jsonb,
  add constraint diario_notas_documentary_origin check (
    (origem_resultado_historico_id is null and media_parcial_documental is null
      and media_final_documental is null and instrumentos_documentais is null
      and resultados_documentais is null)
    or (origem_resultado_historico_id is not null
      and jsonb_typeof(instrumentos_documentais) is not distinct from 'array')
  );

alter table public.diario_frequencia
  add column origem_resultado_historico_id uuid,
  add column origem_aula_historica_id uuid,
  add column status_documental text,
  add constraint diario_frequencia_documentary_source foreign key (
    origem_resultado_historico_id, origem_aula_historica_id
  ) references internal_academic.diario_frequencias_importadas(resultado_id,aula_id),
  add constraint diario_frequencia_documentary_origin check (
    (origem_resultado_historico_id is null and origem_aula_historica_id is null
      and status_documental is null and status is not null)
    or (origem_resultado_historico_id is not null and origem_aula_historica_id is not null
      and status_documental is not null)
  );
alter table public.diario_frequencia alter column status drop not null;
create unique index diario_frequencia_documentary_identity
  on public.diario_frequencia(origem_resultado_historico_id,origem_aula_historica_id)
  where origem_resultado_historico_id is not null;

-- A private, exact-row transaction claim, never a session flag or broad bypass.
create table internal_academic.diario_documentary_write_claims (
  id uuid primary key default gen_random_uuid(),
  transaction_id xid8 not null,
  backend_pid integer not null,
  target_table text not null check (target_table in ('diario_notas','diario_frequencia')),
  expected_row jsonb not null check (jsonb_typeof(expected_row) = 'object')
);
alter table internal_academic.diario_documentary_write_claims enable row level security;
revoke all on internal_academic.diario_documentary_write_claims
  from public,anon,authenticated,service_role;

create function internal_academic.is_diario_documentary_write_claim(p_table text,p_row jsonb)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select auth.role()),'') = 'service_role'
    and exists (
      select 1 from internal_academic.diario_documentary_write_claims c
      where c.transaction_id = pg_current_xact_id()
        and c.backend_pid = pg_backend_pid()
        and c.target_table = p_table and c.expected_row = p_row - 'created_at'
    );
$$;
revoke all on function internal_academic.is_diario_documentary_write_claim(text,jsonb)
  from public,anon,authenticated,service_role;

-- This reads a declared number, including a prior formula REVIEW. It does not
-- recalculate, interpret a dash as zero, or promote documentary approval.
create function internal_academic.diario_documentary_number(p_field jsonb,p_max numeric default 10)
returns numeric language plpgsql immutable set search_path = '' as $$
declare v_number numeric;
begin
  if jsonb_typeof(p_field -> 'value') is distinct from 'number'
    or jsonb_typeof(p_field -> 'sourceRefs') is distinct from 'array'
    or jsonb_array_length(p_field -> 'sourceRefs') = 0 then return null; end if;
  v_number := (p_field ->> 'value')::numeric;
  if v_number < 0 or v_number > p_max then return null; end if;
  return v_number;
end;
$$;

-- Duplicate/combined/unnamed categories stay in the original column list.
-- Only a uniquely labelled conventional instrument populates a conventional slot.
create function internal_academic.diario_documentary_instrument(p_source jsonb,p_category text)
returns numeric language sql immutable set search_path = '' as $$
  select case when count(*) = 1 then
    max(internal_academic.diario_documentary_number(g -> 'value',10)) end
  from jsonb_array_elements(case when jsonb_typeof(p_source -> 'grades') = 'array'
    then p_source -> 'grades' else '[]'::jsonb end) g
  where upper(btrim(g #>> '{category,value}')) = p_category;
$$;
revoke all on function internal_academic.diario_documentary_number(jsonb,numeric),
  internal_academic.diario_documentary_instrument(jsonb,text)
  from public,anon,authenticated,service_role;
