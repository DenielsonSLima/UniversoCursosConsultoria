begin;

-- Resolve a parte contratante somente para modelos que a solicitam explicitamente.
-- Responsável cadastral opcional de aluno adulto não é procuração nem assunção
-- de dívida. O cadastro de responsável continua preservado no snapshot do aluno.
create or replace function internal_academic.contract_party_snapshot(
  p_snapshot jsonb,
  p_reference_date date
)
returns jsonb
language plpgsql
immutable
security invoker
set search_path = ''
as $function$
declare
  v_student jsonb := p_snapshot -> 'aluno';
  v_responsible jsonb := p_snapshot #> '{aluno,responsavel}';
  v_birth date;
  v_party jsonb;
  v_cpf text;
  v_key text;
begin
  if p_reference_date is null or jsonb_typeof(v_student) is distinct from 'object'
    or coalesce(v_student ->> 'nascimento', '') !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'Informe a data de nascimento do aluno antes de emitir o contrato.'
      using errcode = '22023';
  end if;
  v_birth := (v_student ->> 'nascimento')::date;
  if v_birth > p_reference_date then
    raise exception 'A data de nascimento do aluno não pode ser posterior à emissão.'
      using errcode = '22023';
  end if;

  if v_birth <= (p_reference_date - interval '18 years')::date then
    v_party := jsonb_build_object(
      'tipo', 'ALUNO', 'qualificacao', 'Próprio aluno',
      'nome', v_student ->> 'nome', 'cpf', v_student ->> 'cpf',
      'telefone', v_student ->> 'telefone'
    );
  else
    v_party := jsonb_build_object(
      'tipo', 'RESPONSAVEL_LEGAL', 'qualificacao', 'Responsável legal pelo aluno menor de idade',
      'nome', v_responsible ->> 'nome', 'cpf', v_responsible ->> 'cpf',
      'telefone', v_responsible ->> 'telefone', 'parentesco', v_responsible ->> 'parentesco'
    );
  end if;

  foreach v_key in array array['nome', 'cpf', 'telefone', 'parentesco'] loop
    if lower(btrim(coalesce(v_party ->> v_key, ''))) in (
      '', '-', '—', 'não informado', 'nao informado', 'n/a', 'null'
    ) then
      v_party := jsonb_set(v_party, array[v_key], 'null'::jsonb);
    else
      v_party := jsonb_set(v_party, array[v_key], to_jsonb(btrim(v_party ->> v_key)));
    end if;
  end loop;

  v_cpf := regexp_replace(coalesce(v_party ->> 'cpf', ''), '[^0-9]', '', 'g');
  if v_party ->> 'nome' is null or length(v_cpf) <> 11 then
    raise exception 'Informe nome e CPF do contratante (%), antes de emitir o contrato.',
      lower(v_party ->> 'qualificacao') using errcode = '22023';
  end if;
  v_party := jsonb_set(v_party, '{cpf}', to_jsonb(
    substr(v_cpf, 1, 3) || '.' || substr(v_cpf, 4, 3) || '.'
    || substr(v_cpf, 7, 3) || '-' || substr(v_cpf, 10, 2)
  ));
  -- Não cria endereço do responsável a partir do endereço do aluno.
  return jsonb_set(p_snapshot, '{contratante}', v_party, true);
end;
$function$;

revoke all on function internal_academic.contract_party_snapshot(jsonb, date)
  from public, anon, authenticated, service_role;

do $wire_contract_party$
declare
  v_definition text;
  v_needle text := '    v_snapshot := public.enriquecer_snapshot_identidade_visual_contrato(v_snapshot);';
begin
  select pg_catalog.pg_get_functiondef(
    'public.preparar_emissao_contrato_aluno_base_secure(uuid,text,uuid[],text,uuid)'::regprocedure
  ) into v_definition;
  if position('internal_academic.contract_party_snapshot' in v_definition) > 0 then return; end if;
  if position(v_needle in v_definition) = 0 then
    raise exception 'Ponto de composição do contratante mudou; aplicação interrompida.';
  end if;
  execute replace(v_definition, v_needle, $replacement$
    if position('{{contratante.' in coalesce(v_model.conteudo ->> 'corpo', '')) > 0 then
      v_snapshot := internal_academic.contract_party_snapshot(
        v_snapshot, (v_issued.emitido_em at time zone 'America/Maceio')::date
      );
      v_snapshot := jsonb_set(v_snapshot, '{emissao,dataExibicao}',
        to_jsonb(to_char(v_issued.emitido_em at time zone 'America/Maceio', 'DD/MM/YYYY')));
    end if;
$replacement$ || v_needle);
end;
$wire_contract_party$;

commit;
