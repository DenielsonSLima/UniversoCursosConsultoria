alter table public.documentos_validacao_politicas
  add column if not exists validacao_publica boolean not null default true;

comment on column public.documentos_validacao_politicas.validacao_publica is
  'Habilita o validador público para novas emissões deste tipo sem controlar a presença visual do QR no modelo.';

alter table public.documentos_validacao
  add column if not exists validacao_publica boolean not null default true;

comment on column public.documentos_validacao.validacao_publica is
  'Snapshot da disponibilidade pública do validador no momento da emissão.';

-- Decisão funcional inicial: boletins são registros de acompanhamento e não
-- devem nascer com consulta pública nem vencimento. Emissões antigas mantêm
-- seus snapshots para não invalidar documentos já entregues.
update public.documentos_validacao_politicas
set
  validacao_publica = false,
  validade_dias = null,
  updated_at = now()
where documento = 'boletim';

create or replace function public.listar_politicas_validacao_documentos()
returns table (
  documento text,
  prefixo text,
  escopo_identidade text,
  validade_dias integer,
  exige_vinculo_ativo boolean,
  validacao_publica boolean,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce((select auth.role()), '') <> 'service_role'
    and not public.gestor_has_any_module(array['cadastros', 'secretaria']::text[])
  then
    raise exception 'Acesso às políticas documentais não autorizado.'
      using errcode = '42501';
  end if;

  return query
  select
    policy.documento,
    policy.prefixo,
    policy.escopo_identidade,
    policy.validade_dias,
    policy.exige_vinculo_ativo,
    policy.validacao_publica,
    policy.updated_at
  from public.documentos_validacao_politicas policy
  order by policy.documento;
end;
$$;

revoke all on function public.listar_politicas_validacao_documentos()
  from public, anon;
grant execute on function public.listar_politicas_validacao_documentos()
  to authenticated, service_role;

create or replace function public.atualizar_politica_validacao_documento(
  p_documento text,
  p_validacao_publica boolean,
  p_validade_dias integer default null
)
returns public.documentos_validacao_politicas
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.documentos_validacao_politicas%rowtype;
begin
  if coalesce((select auth.role()), '') <> 'service_role'
    and not public.gestor_has_any_global_module(array['cadastros', 'secretaria']::text[])
  then
    raise exception 'Alteração das políticas documentais não autorizada.'
      using errcode = '42501';
  end if;

  if p_validacao_publica is null then
    raise exception 'Informe se a validação pública está habilitada.'
      using errcode = '22004';
  end if;

  if p_validade_dias is not null
    and (p_validade_dias <= 0 or p_validade_dias > 3650)
  then
    raise exception 'A validade deve estar entre 1 e 3650 dias.'
      using errcode = '22023';
  end if;

  update public.documentos_validacao_politicas policy
  set
    validacao_publica = p_validacao_publica,
    validade_dias = case when p_validacao_publica then p_validade_dias else null end,
    updated_at = now()
  where policy.documento = p_documento
  returning policy.* into v_row;

  if not found then
    raise exception 'Tipo de documento não encontrado: %', p_documento
      using errcode = '22023';
  end if;

  return v_row;
end;
$$;

revoke all on function public.atualizar_politica_validacao_documento(
  text, boolean, integer
) from public, anon;
grant execute on function public.atualizar_politica_validacao_documento(
  text, boolean, integer
) to authenticated, service_role;

create or replace function public.emitir_documento_validacao_interno(
  p_documento text,
  p_matricula_id uuid,
  p_periodo_referencia text default null,
  p_referencia_externa text default null,
  p_validade_ate timestamptz default null,
  p_emitido_por uuid default null,
  p_registrar_reemissao boolean default false
)
returns table (
  codigo text,
  documento text,
  emitido_em timestamptz,
  ultima_emissao_em timestamptz,
  validade_ate timestamptz,
  status text,
  quantidade_emissoes integer,
  reutilizado boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_matricula record;
  v_periodo text;
  v_referencia text;
  v_identidade text;
  v_prefixo text;
  v_validade timestamptz;
  v_codigo text;
  v_existia boolean;
  v_politica record;
begin
  select *
  into v_politica
  from public.documentos_validacao_politicas policy
  where policy.documento = p_documento;

  if not found then
    raise exception 'Tipo de documento não permitido: %', p_documento;
  end if;

  select
    enrollment.id,
    enrollment.aluno_id,
    enrollment.status as matricula_status,
    enrollment.data_matricula,
    class.polo_id,
    student.nome as aluno_nome,
    student.cpf_cnpj as aluno_cpf,
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
    raise exception 'Matrícula não encontrada.';
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
    raise exception 'Este documento exige uma referência de processo ou contrato.';
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
      reutilizado := true;
      return next;
      return;
    end if;
  end if;

  v_prefixo := v_politica.prefixo;
  -- A política é canônica. Datas calculadas pelo navegador são ignoradas para
  -- impedir que uma tela antiga altere a validade configurada centralmente.
  v_validade := case
    when v_politica.validade_dias is null then null
    else now() + make_interval(days => v_politica.validade_dias)
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
        )
      )
      on conflict (identidade) do update
      set
        ultima_emissao_em = case
          when p_registrar_reemissao then now()
          else documentos_validacao.ultima_emissao_em
        end,
        emitido_por = coalesce(excluded.emitido_por, documentos_validacao.emitido_por),
        quantidade_emissoes = documentos_validacao.quantidade_emissoes
          + case when p_registrar_reemissao then 1 else 0 end,
        dados_emissao = (
          documentos_validacao.dados_emissao
          || jsonb_strip_nulls(excluded.dados_emissao)
        ) || jsonb_build_object(
          'validationPublic', documentos_validacao.validacao_publica,
          'validityDays', case
            when documentos_validacao.validade_ate is null then null
            else greatest(
              1,
              ceil(extract(epoch from (
                documentos_validacao.validade_ate - documentos_validacao.emitido_em
              )) / 86400)::integer
            )
          end
        ),
        updated_at = now()
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

      reutilizado := v_existia or codigo <> v_codigo;
      return next;
      return;
    exception
      when unique_violation then
        if exists (
          select 1
          from public.documentos_validacao
          where identidade = v_identidade
        ) then
          continue;
        end if;
    end;
  end loop;
end;
$$;

create or replace function public.validar_documento_por_codigo(p_codigo text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'type', validation.documento,
    'status', case
      when validation.status = 'REVOGADO' then 'REVOKED'
      when validation.validade_ate is not null and validation.validade_ate < now() then 'EXPIRED'
      when policy.exige_vinculo_ativo
        and upper(coalesce(enrollment.status, '')) <> 'ATIVO' then 'REVOKED'
      else 'ACTIVE'
    end,
    'code', validation.codigo,
    'issuedAt', validation.emitido_em,
    'lastIssuedAt', validation.ultima_emissao_em,
    'expiresAt', validation.validade_ate,
    'referencePeriod', validation.periodo_referencia,
    'issueCount', validation.quantidade_emissoes,
    'enrollmentId', validation.matricula_id,
    'studentName',
      split_part(coalesce(student.nome, validation.dados_emissao ->> 'studentName', ''), ' ', 1)
      || case
        when position(' ' in coalesce(student.nome, validation.dados_emissao ->> 'studentName', '')) > 0
          then ' ' || left(
            split_part(coalesce(student.nome, validation.dados_emissao ->> 'studentName', ''), ' ', 2),
            1
          ) || '***'
        else ''
      end,
    'studentCpf',
      '***.***.***-' || right(
        regexp_replace(
          coalesce(student.cpf_cnpj, validation.dados_emissao ->> 'studentCpf', ''),
          '\D',
          '',
          'g'
        ),
        2
      ),
    'studentBirthDate',
      '**/**/' || left(
        coalesce(student.data_nascimento::text, validation.dados_emissao ->> 'studentBirthDate', ''),
        4
      ),
    'maskedMotherName',
      case
        when nullif(btrim(student.nome_mae), '') is null then 'Não informado'
        else split_part(btrim(student.nome_mae), ' ', 1)
          || case
            when position(' ' in btrim(student.nome_mae)) > 0
              then ' ' || left(split_part(btrim(student.nome_mae), ' ', 2), 1) || '***'
            else ''
          end
      end,
    'maskedEnrollmentNumber',
      left(
        public.formatar_matricula_validacao(
          validation.matricula_id,
          enrollment.data_matricula,
          coalesce(validation.polo_id, class.polo_id)
        ),
        greatest(
          2,
          length(public.formatar_matricula_validacao(
            validation.matricula_id,
            enrollment.data_matricula,
            coalesce(validation.polo_id, class.polo_id)
          )) - 6
        )
      ) || '****' || right(
        public.formatar_matricula_validacao(
          validation.matricula_id,
          enrollment.data_matricula,
          coalesce(validation.polo_id, class.polo_id)
        ),
        2
      ),
    'studentPhotoUrl', coalesce(student.foto_url, validation.dados_emissao ->> 'studentPhotoUrl'),
    'courseName', coalesce(course.nome, validation.dados_emissao ->> 'courseName'),
    'className', coalesce(class.nome, class.codigo, validation.dados_emissao ->> 'className'),
    'institutionName', coalesce(
      company.razao_social,
      company.nome_fantasia,
      unit.nome,
      validation.dados_emissao ->> 'institutionName'
    ),
    'institutionCnpj', coalesce(nullif(unit.cnpj, ''), company.cnpj, 'Não informado'),
    'unitName', coalesce(unit.nome, validation.dados_emissao ->> 'unitName'),
    'enrollmentStatus', upper(coalesce(enrollment.status, validation.dados_emissao ->> 'enrollmentStatus')),
    'enrollmentDate', coalesce(enrollment.data_matricula::text, validation.dados_emissao ->> 'enrollmentDate')
  )
  from public.documentos_validacao validation
  left join public.matriculas enrollment on enrollment.id = validation.matricula_id
  left join public.parceiros student on student.id = validation.aluno_id
  left join public.turmas class on class.id = enrollment.turma_id
  left join public.cursos course on course.id = class.curso_id
  left join public.polos unit on unit.id = coalesce(validation.polo_id, class.polo_id)
  left join public.empresas company on company.id = unit.company_id
  join public.documentos_validacao_politicas policy
    on policy.documento = validation.documento
  where upper(validation.codigo) = upper(btrim(p_codigo))
    and validation.validacao_publica
  limit 1;
$$;

revoke all on function public.validar_documento_por_codigo(text) from public;
grant execute on function public.validar_documento_por_codigo(text)
  to anon, authenticated;
