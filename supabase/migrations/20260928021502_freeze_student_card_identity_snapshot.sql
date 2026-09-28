-- Congela a identidade da carteirinha somente em novas emissões.
-- Tipos legados ambíguos não são reinterpretados como CIN.
begin;

create or replace function internal_academic.student_card_identity_snapshot(
  p_document_type text, p_rg text, p_cpf text
)
returns jsonb
language sql
immutable
set search_path = ''
as $function$
  with source as (
    select btrim(coalesce(p_document_type, '')) as raw_type,
      btrim(regexp_replace(upper(coalesce(p_document_type, '')),
        '[^A-Z0-9]+', ' ', 'g')) as normalized_type
  ), identity as (
    select source.*,
      normalized_type in ('CIN', 'CNI')
      or normalized_type like '%CARTEIRA DE IDENTIDADE NACIONAL%'
      or normalized_type like '%CARTEIRA NACIONAL DE IDENTIDADE%' as is_cin
    from source
  )
  select jsonb_build_object(
    'studentDocumentType', case when is_cin
      then 'CARTEIRA DE IDENTIDADE NACIONAL' else raw_type end,
    'studentRg', case when is_cin then btrim(coalesce(p_cpf, ''))
      when raw_type <> '' then btrim(coalesce(p_rg, ''))
      else '' end
  ) from identity;
$function$;

revoke all on function internal_academic.student_card_identity_snapshot(text, text, text)
  from public, anon, authenticated, service_role;

create or replace function internal_academic.document_identity_reference(
  p_document_type text, p_rg text, p_cpf text
)
returns text
language sql
immutable
set search_path = ''
as $function$
  select 'student-identity:' || encode(extensions.digest(convert_to((
    internal_academic.student_card_identity_snapshot(p_document_type, p_rg, p_cpf)
    || jsonb_build_object('studentCpf', btrim(coalesce(p_cpf, '')))
  )::text, 'UTF8'), 'sha256'), 'hex');
$function$;
revoke all on function internal_academic.document_identity_reference(text, text, text)
  from public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.emitir_documento_validacao_interno(p_documento text, p_matricula_id uuid, p_periodo_referencia text DEFAULT NULL::text, p_referencia_externa text DEFAULT NULL::text, p_validade_ate timestamp with time zone DEFAULT NULL::timestamp with time zone, p_emitido_por uuid DEFAULT NULL::uuid, p_registrar_reemissao boolean DEFAULT false)
 RETURNS TABLE(codigo text, documento text, emitido_em timestamp with time zone, ultima_emissao_em timestamp with time zone, validade_ate timestamp with time zone, status text, quantidade_emissoes integer, reutilizado boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_matricula record;
  v_periodo text;
  v_referencia text;
  v_identidade text;
  v_prefixo text;
  v_validade timestamptz;
  v_codigo text;
  v_existia boolean;
  v_politica public.documentos_validacao_politicas%rowtype;
  v_status_existente text;
  v_operation_at timestamptz;
begin
  if p_documento = 'diario_classe' then
    raise exception
      'O Diário de Classe usa a emissão canônica por turma e disciplina.'
      using errcode = '22023';
  end if;

  if p_registrar_reemissao
    and coalesce(
      current_setting('app.document_reissue_authorized', true),
      ''
    ) <> 'on'
  then
    raise exception
      'Reemissão exige a RPC idempotente com chave explícita.'
      using errcode = '22023';
  end if;

  begin
    v_operation_at := nullif(
      current_setting('app.document_reissue_at', true),
      ''
    )::timestamptz;
  exception
    when invalid_datetime_format then
      raise exception 'Timestamp interno de reemissão inválido.'
        using errcode = '22007';
  end;
  v_operation_at := coalesce(v_operation_at, now());

  select policy.*
  into v_politica
  from public.documentos_validacao_politicas policy
  where policy.documento = p_documento
  for share;

  if not found then
    raise exception 'Tipo de documento não permitido: %', p_documento
      using errcode = '22023';
  end if;

  select
    enrollment.id,
    enrollment.aluno_id,
    enrollment.status as matricula_status,
    enrollment.data_matricula,
    class.polo_id,
    student.nome as aluno_nome,
    student.cpf_cnpj as aluno_cpf,
    student.tipo_documento as aluno_tipo_documento,
    student.rg as aluno_rg,
    student.data_nascimento as aluno_nascimento,
    student.foto_url as aluno_foto_url,
    class.nome as turma_nome,
    class.codigo as turma_codigo,
    course.nome as curso_nome,
    unit.nome as polo_nome
  into v_matricula
  from public.matriculas enrollment
  join public.parceiros student on student.id = enrollment.aluno_id
  left join public.turmas class on class.id = enrollment.turma_id
  left join public.cursos course on course.id = class.curso_id
  left join public.polos unit on unit.id = class.polo_id
  where enrollment.id = p_matricula_id;

  if not found then
    raise exception 'Matrícula não encontrada.'
      using errcode = '22023';
  end if;

  v_periodo := nullif(btrim(p_periodo_referencia), '');
  v_referencia := nullif(btrim(p_referencia_externa), '');

  if v_politica.escopo_identidade = 'ANUAL'
    and p_documento = 'declaracao_irpf'
    and v_periodo is null
  then
    v_periodo := (extract(year from current_date)::integer - 1)::text;
  elsif v_politica.escopo_identidade = 'ANUAL' and v_periodo is null then
    v_periodo := extract(year from current_date)::integer::text;
  end if;

  if v_politica.escopo_identidade = 'PROCESSO' and v_referencia is null then
    raise exception 'Este documento exige uma referência de processo ou contrato.'
      using errcode = '22023';
  end if;

  v_identidade := concat_ws(
    ':',
    p_documento,
    p_matricula_id::text,
    coalesce(v_periodo, '-'),
    coalesce(v_referencia, '-')
  );

  if not p_registrar_reemissao then
    select
      validation.codigo,
      validation.documento,
      validation.emitido_em,
      validation.ultima_emissao_em,
      validation.validade_ate,
      validation.status,
      validation.quantidade_emissoes
    into
      codigo,
      documento,
      emitido_em,
      ultima_emissao_em,
      validade_ate,
      status,
      quantidade_emissoes
    from public.documentos_validacao validation
    where validation.identidade = v_identidade;

    if found then
      if status = 'REVOGADO' then
        raise exception
          'Documento revogado não pode ser reutilizado ou reemitido.'
          using errcode = '55000';
      end if;

      if validade_ate is not null and validade_ate < now() then
        raise exception
          'Documento expirado exige uma reemissão administrativa explícita.'
          using errcode = '55000';
      end if;

      reutilizado := true;
      return next;
      return;
    end if;
  else
    select validation.status
    into v_status_existente
    from public.documentos_validacao validation
    where validation.identidade = v_identidade
    for update;

    if found and v_status_existente = 'REVOGADO' then
      raise exception
        'Documento revogado não pode ser reutilizado ou reemitido.'
        using errcode = '55000';
    end if;
  end if;

  v_prefixo := v_politica.prefixo;
  -- Validade informada pelo navegador continua ignorada. Na reemissão comum,
  -- o prazo é renovado pela política vigente. O trigger da carteirinha
  -- substitui esta data pelo término acadêmico da turma.
  v_validade := case
    when v_politica.validade_dias is null then null
    else v_operation_at + make_interval(days => v_politica.validade_dias)
  end;

  select exists (
    select 1
    from public.documentos_validacao validation
    where validation.identidade = v_identidade
  ) into v_existia;

  loop
    v_codigo := v_prefixo
      || '-' || upper(substring(encode(extensions.gen_random_bytes(9), 'hex') from 1 for 4))
      || '-' || upper(substring(encode(extensions.gen_random_bytes(9), 'hex') from 1 for 4))
      || '-' || upper(substring(encode(extensions.gen_random_bytes(9), 'hex') from 1 for 4));

    begin
      codigo := null;

      insert into public.documentos_validacao (
        identidade,
        codigo,
        documento,
        matricula_id,
        aluno_id,
        polo_id,
        periodo_referencia,
        referencia_externa,
        validade_ate,
        emitido_por,
        validacao_publica,
        dados_emissao
      )
      values (
        v_identidade,
        v_codigo,
        p_documento,
        p_matricula_id,
        v_matricula.aluno_id,
        v_matricula.polo_id,
        v_periodo,
        v_referencia,
        v_validade,
        p_emitido_por,
        v_politica.validacao_publica,
        jsonb_build_object(
          'studentName', v_matricula.aluno_nome,
          'studentCpf', v_matricula.aluno_cpf,
          'studentBirthDate', v_matricula.aluno_nascimento,
          'studentPhotoUrl', v_matricula.aluno_foto_url,
          'courseName', v_matricula.curso_nome,
          'className', coalesce(v_matricula.turma_nome, v_matricula.turma_codigo),
          'unitName', v_matricula.polo_nome,
          'enrollmentStatus', upper(coalesce(v_matricula.matricula_status, '')),
          'enrollmentDate', v_matricula.data_matricula,
          'institutionName', 'Universo Cursos e Consultoria',
          'validationPublic', v_politica.validacao_publica,
          'validityDays', v_politica.validade_dias
        ) || case when p_documento = 'carteirinha' then
          internal_academic.student_card_identity_snapshot(
            v_matricula.aluno_tipo_documento, v_matricula.aluno_rg, v_matricula.aluno_cpf
          )
          else '{}'::jsonb
        end
      )
      on conflict (identidade) do update
      set
        ultima_emissao_em = case
          when p_registrar_reemissao then v_operation_at
          else documentos_validacao.ultima_emissao_em
        end,
        validade_ate = case
          when p_registrar_reemissao then excluded.validade_ate
          else documentos_validacao.validade_ate
        end,
        validacao_publica = case
          when p_registrar_reemissao then excluded.validacao_publica
          else documentos_validacao.validacao_publica
        end,
        emitido_por = coalesce(
          excluded.emitido_por,
          documentos_validacao.emitido_por
        ),
        quantidade_emissoes = documentos_validacao.quantidade_emissoes
          + case when p_registrar_reemissao then 1 else 0 end,
        dados_emissao = case
          when p_registrar_reemissao then
            documentos_validacao.dados_emissao
            || jsonb_build_object(
              'validationPublic', v_politica.validacao_publica,
              'validityDays', v_politica.validade_dias
            )
          else
            (case when p_documento = 'carteirinha' then
              documentos_validacao.dados_emissao
            else documentos_validacao.dados_emissao
              || jsonb_strip_nulls(excluded.dados_emissao)
            end)
            || jsonb_build_object(
              'validationPublic', documentos_validacao.validacao_publica,
              'validityDays', case
                when documentos_validacao.validade_ate is null then null
                else greatest(
                  1,
                  ceil(extract(epoch from (
                    documentos_validacao.validade_ate
                    - documentos_validacao.emitido_em
                  )) / 86400)::integer
                )
              end
            )
        end,
        updated_at = now()
      where not p_registrar_reemissao
        or documentos_validacao.status <> 'REVOGADO'
      returning
        documentos_validacao.codigo,
        documentos_validacao.documento,
        documentos_validacao.emitido_em,
        documentos_validacao.ultima_emissao_em,
        documentos_validacao.validade_ate,
        documentos_validacao.status,
        documentos_validacao.quantidade_emissoes
      into
        codigo,
        documento,
        emitido_em,
        ultima_emissao_em,
        validade_ate,
        status,
        quantidade_emissoes;

      if codigo is null then
        raise exception
          'Documento revogado não pode ser reutilizado ou reemitido.'
          using errcode = '55000';
      end if;

      reutilizado := v_existia or codigo <> v_codigo;
      return next;
      return;
    exception
      when unique_violation then
        if exists (
          select 1
          from public.documentos_validacao validation
          where validation.identidade = v_identidade
        ) then
          continue;
        end if;
    end;
  end loop;
end;
$function$
;

-- Mantém a função interna restrita ao fluxo privilegiado existente.
revoke all on function public.emitir_documento_validacao_interno(
  text, uuid, text, text, timestamptz, uuid, boolean
) from public, anon, authenticated;
grant execute on function public.emitir_documento_validacao_interno(
  text, uuid, text, text, timestamptz, uuid, boolean
) to service_role;

commit;

