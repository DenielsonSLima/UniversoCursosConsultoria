begin;

create or replace function internal_academic.technical_financial_row(
  p_matricula_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_row record;
  v_effective jsonb;
  v_override jsonb;
  v_situation text;
  v_progress numeric;
begin
  select
    enrollment.id as matricula_id,
    enrollment.aluno_id,
    student.nome as aluno_nome,
    coalesce(student.cpf_cnpj, '') as aluno_cpf,
    enrollment.status as status_academico,
    config.status_financeiro,
    config.primeiro_vencimento,
    config.ativar_em,
    config.regra_revisao,
    config.regra_fingerprint,
    config.regra_efetiva_fingerprint,
    config.updated_at,
    title.id as titulo_id,
    title.status as titulo_status,
    title.valor as titulo_valor,
    title.data_vencimento as titulo_vencimento,
    coalesce(receivables.total_parcelas, 0)::integer as total_parcelas,
    coalesce(receivables.parcelas_pagas, 0)::integer as parcelas_pagas,
    coalesce(receivables.has_overdue, false) as has_overdue,
    coalesce(receivables.valor_total, 0) as valor_total,
    coalesce(receivables.valor_recebido, 0) as valor_recebido,
    coalesce(receivables.valor_inadimplente, 0) as valor_inadimplente
  into v_row
  from public.matriculas enrollment
  join public.parceiros student on student.id = enrollment.aluno_id
  left join public.matriculas_tecnicas_financeiro_config config
    on config.matricula_id = enrollment.id
  left join public.contas_receber title on title.id = config.titulo_matricula_id
  left join lateral (
    select
      count(*)::integer total_parcelas,
      count(*) filter (where receivable.status = 'PAGO')::integer parcelas_pagas,
      bool_or(
        receivable.status = 'VENCIDO'
        or (
          receivable.status = 'PENDENTE'
          and receivable.data_vencimento
            < (pg_catalog.timezone('America/Maceio', now()))::date
        )
      ) has_overdue,
      coalesce(sum(receivable.valor), 0) valor_total,
      coalesce(sum(coalesce(receivable.valor_pago, receivable.valor)) filter (
        where receivable.status = 'PAGO'
      ), 0) valor_recebido,
      coalesce(sum(receivable.valor) filter (
        where receivable.status = 'VENCIDO'
          or (
            receivable.status = 'PENDENTE'
            and receivable.data_vencimento
              < (pg_catalog.timezone('America/Maceio', now()))::date
          )
      ), 0) valor_inadimplente
    from public.contas_receber receivable
    where receivable.matricula_id = enrollment.id
  ) receivables on true
  where enrollment.id = p_matricula_id;

  if not found then
    raise exception 'Matrícula não encontrada.' using errcode = '22023';
  end if;

  if v_row.status_financeiro is not null then
    v_effective :=
      internal_academic.technical_financial_effective_rule(p_matricula_id);
    v_override :=
      internal_academic.render_technical_financial_override(p_matricula_id);
  end if;

  v_progress := case when v_row.total_parcelas > 0
    then round(v_row.parcelas_pagas::numeric * 100.0 / v_row.total_parcelas, 2)
    else 0 end;
  v_situation := case
    when v_row.status_financeiro is null then 'SEM_CONFIGURACAO'
    when v_row.has_overdue then 'INADIMPLENTE'
    when v_row.status_financeiro = 'PENDENTE' then 'PENDENTE'
    when v_row.status_financeiro = 'AGENDADA' then 'AGENDADA'
    when v_row.status_financeiro in ('ATIVADA', 'GERADA') then 'EM_DIA'
    else v_row.status_financeiro
  end;

  return jsonb_build_object(
    'matriculaId', v_row.matricula_id,
    'matriculaExibicao', upper(pg_catalog.left(
      pg_catalog.replace(v_row.matricula_id::text, '-', ''), 8
    )),
    'alunoId', v_row.aluno_id,
    'alunoNome', v_row.aluno_nome,
    'alunoCpf', v_row.aluno_cpf,
    'statusAcademico', v_row.status_academico,
    'situacaoFinanceira', v_situation,
    'valorMatriculaEfetivo', case when v_effective is null then null
      else v_effective -> 'cobranca' -> 'matricula' ->> 'valor' end,
    'valorMensalidadeEfetivo', case when v_effective is null then null
      else v_effective -> 'cobranca' -> 'mensalidade' ->> 'valor' end,
    'parcelasPagas', v_row.parcelas_pagas,
    'totalParcelas', v_row.total_parcelas,
    'progressoPercentual',
      pg_catalog.to_char(v_progress, 'FM999999990.00'),
    'totais', jsonb_build_object(
      'total', pg_catalog.to_char(v_row.valor_total, 'FM999999990.00'),
      'recebido', pg_catalog.to_char(v_row.valor_recebido, 'FM999999990.00'),
      'inadimplencia',
        pg_catalog.to_char(v_row.valor_inadimplente, 'FM999999990.00')
    ),
    'overrideAtivo', coalesce((v_override ->> 'ativo')::boolean, false),
    'override', v_override,
    'regraEfetiva', v_effective,
    'financeiro', jsonb_build_object(
      'status', coalesce(v_row.status_financeiro, 'NAO_CONFIGURADO'),
      'primeiroVencimento', v_row.primeiro_vencimento,
      'ativarEm', v_row.ativar_em,
      'regraRevisao', v_row.regra_revisao,
      'regraFingerprint', v_row.regra_fingerprint,
      'regraEfetivaFingerprint', v_row.regra_efetiva_fingerprint,
      'regraDesatualizada', case when v_effective is null then false else
        v_row.regra_efetiva_fingerprint is distinct from
          (v_effective -> 'identidade' ->> 'efetivaFingerprint') end,
      'titulo', case when v_row.titulo_id is null then null else
        jsonb_build_object(
          'id', v_row.titulo_id,
          'status', v_row.titulo_status,
          'valor', pg_catalog.to_char(v_row.titulo_valor, 'FM999999990.00'),
          'vencimento',
            pg_catalog.to_char(v_row.titulo_vencimento, 'YYYY-MM-DD')
        ) end,
      'updatedAt', v_row.updated_at
    )
  );
end;
$function$;

revoke all on function internal_academic.technical_financial_row(uuid)
  from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
commit;
