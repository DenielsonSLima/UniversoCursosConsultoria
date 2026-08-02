-- Vincula a validade da carteirinha ao período acadêmico da turma.
-- A data impressa é congelada na emissão/reemissão. Encurtamentos passam a
-- valer imediatamente no validador; prorrogações exigem reemissão.

create or replace function public.documento_validade_efetiva(
  p_documento text,
  p_validade_emitida timestamptz,
  p_termino_turma date
)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select case
    when p_documento <> 'carteirinha' or p_termino_turma is null
      then p_validade_emitida
    when p_validade_emitida is null
      then (
        ((p_termino_turma + 1)::timestamp at time zone 'America/Maceio')
        - interval '1 millisecond'
      )
    else least(
      p_validade_emitida,
      (
        ((p_termino_turma + 1)::timestamp at time zone 'America/Maceio')
        - interval '1 millisecond'
      )
    )
  end;
$$;

revoke all on function public.documento_validade_efetiva(
  text, timestamptz, date
) from public, anon, authenticated;

comment on function public.documento_validade_efetiva(text, timestamptz, date) is
  'Mantém a validade impressa da carteirinha, mas antecipa o vencimento quando o término da turma é encurtado.';

create or replace function public.aplicar_validade_turma_carteirinha()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_data_inicio date;
  v_data_termino date;
begin
  if new.documento <> 'carteirinha' then
    return new;
  end if;

  -- Uma atualização comum não prorroga a data já impressa. A validade só é
  -- recalculada na primeira emissão ou quando a reemissão aumenta o contador.
  if tg_op = 'UPDATE'
    and new.quantidade_emissoes <= old.quantidade_emissoes
  then
    return new;
  end if;

  select turma.data_inicio, turma.data_previsao_termino
  into v_data_inicio, v_data_termino
  from public.matriculas matricula
  join public.turmas turma on turma.id = matricula.turma_id
  where matricula.id = new.matricula_id;

  if not found then
    raise exception 'A carteirinha exige uma matrícula vinculada a uma turma.'
      using errcode = '23514';
  end if;

  if v_data_inicio is null or v_data_termino is null then
    raise exception 'Defina o início e o término previsto da turma antes de emitir a carteirinha.'
      using errcode = '23514';
  end if;

  if v_data_termino < v_data_inicio then
    raise exception 'O término previsto da turma não pode ser anterior ao início.'
      using errcode = '23514';
  end if;

  new.validade_ate := (
    ((v_data_termino + 1)::timestamp at time zone 'America/Maceio')
    - interval '1 millisecond'
  );
  new.dados_emissao := coalesce(new.dados_emissao, '{}'::jsonb)
    || jsonb_build_object(
      'validityMode', 'CLASS_END',
      'validityDays', null,
      'classStartDate', v_data_inicio,
      'classExpectedEndDate', v_data_termino
    );

  return new;
end;
$$;

revoke all on function public.aplicar_validade_turma_carteirinha()
  from public, anon, authenticated;

drop trigger if exists trg_aplicar_validade_turma_carteirinha
  on public.documentos_validacao;
create trigger trg_aplicar_validade_turma_carteirinha
before insert or update on public.documentos_validacao
for each row
execute function public.aplicar_validade_turma_carteirinha();

create or replace function public.forcar_politica_validade_carteirinha()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.documento = 'carteirinha' then
    new.validade_dias := null;
  end if;
  return new;
end;
$$;

revoke all on function public.forcar_politica_validade_carteirinha()
  from public, anon, authenticated;

drop trigger if exists trg_forcar_politica_validade_carteirinha
  on public.documentos_validacao_politicas;
create trigger trg_forcar_politica_validade_carteirinha
before insert or update on public.documentos_validacao_politicas
for each row
execute function public.forcar_politica_validade_carteirinha();

update public.documentos_validacao_politicas
set validade_dias = null,
    updated_at = now()
where documento = 'carteirinha'
  and validade_dias is not null;

create or replace function public.obter_snapshots_validacao_documentos(
  p_codigos text[]
)
returns table (
  codigo text,
  validade_ate timestamptz,
  validacao_publica boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_codigos text[];
begin
  select coalesce(array_agg(distinct upper(btrim(item.codigo))), array[]::text[])
  into v_codigos
  from unnest(coalesce(p_codigos, array[]::text[])) item(codigo)
  where nullif(btrim(item.codigo), '') is not null;

  if cardinality(v_codigos) = 0 then
    return;
  end if;

  if exists (
    select 1
    from public.documentos_validacao validation
    where upper(validation.codigo) = any(v_codigos)
      and coalesce((select auth.role()), '') <> 'service_role'
      and validation.aluno_id is distinct from public.current_aluno_id()
      and not public.can_manage_secretaria_document(
        validation.documento,
        validation.polo_id
      )
  )
  then
    raise exception 'Consulta ao snapshot documental não autorizada.'
      using errcode = '42501';
  end if;

  return query
  select
    validation.codigo,
    public.documento_validade_efetiva(
      validation.documento,
      validation.validade_ate,
      turma.data_previsao_termino
    ),
    validation.validacao_publica
  from public.documentos_validacao validation
  left join public.matriculas matricula on matricula.id = validation.matricula_id
  left join public.turmas turma on turma.id = matricula.turma_id
  where upper(validation.codigo) = any(v_codigos);
end;
$$;

revoke all on function public.obter_snapshots_validacao_documentos(text[])
  from public, anon;
grant execute on function public.obter_snapshots_validacao_documentos(text[])
  to authenticated, service_role;

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
      when effective.validade_ate is not null
        and effective.validade_ate < now() then 'EXPIRED'
      when policy.exige_vinculo_ativo
        and upper(coalesce(enrollment.status, '')) <> 'ATIVO' then 'REVOKED'
      else 'ACTIVE'
    end,
    'code', validation.codigo,
    'issuedAt', validation.emitido_em,
    'lastIssuedAt', validation.ultima_emissao_em,
    'expiresAt', effective.validade_ate,
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
  cross join lateral (
    select public.documento_validade_efetiva(
      validation.documento,
      validation.validade_ate,
      class.data_previsao_termino
    ) as validade_ate
  ) effective
  where upper(validation.codigo) = upper(btrim(p_codigo))
    and validation.validacao_publica
  limit 1;
$$;

revoke all on function public.validar_documento_por_codigo(text) from public;
grant execute on function public.validar_documento_por_codigo(text)
  to anon, authenticated;

comment on function public.validar_documento_por_codigo(text) is
  'Valida documentos públicos e limita carteirinhas ao término atual da turma sem prorrogar a data impressa automaticamente.';
