-- Checklist e pagamento continuam informativos, sem bloquear o vínculo acadêmico.
begin;

CREATE OR REPLACE FUNCTION public.matricula_tecnica_workflow_snapshot(p_matricula_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_context record;
  v_pagamento_confirmado boolean;
  v_documentos_total integer := 0;
  v_documentos_concluidos integer := 0;
  v_dados_insuficientes integer := 0;
  v_envio_em_andamento boolean := false;
  v_liberacao record;
  v_pode_operar boolean := false;
  v_sem_financeiro boolean := false;
  v_documentacao_concluida boolean := false;
  v_bloqueios_regular text[] := ARRAY[]::text[];
  v_bloqueios_implantacao text[] := ARRAY[]::text[];
BEGIN
  SELECT
    matricula.id,
    matricula.aluno_id,
    matricula.turma_id,
    matricula.status,
    matricula.fluxo_operacional,
    turma.nome AS turma_nome,
    turma.status AS turma_status,
    turma.polo_id,
    curso.nome AS curso_nome,
    upper(coalesce(curso.modalidade, '')) AS modalidade
  INTO v_context
  FROM public.matriculas matricula
  JOIN public.turmas turma ON turma.id = matricula.turma_id
  JOIN public.cursos curso ON curso.id = turma.curso_id
  WHERE matricula.id = p_matricula_id;

  IF v_context.id IS NULL
    OR v_context.modalidade NOT IN ('TECNICO', 'TÉCNICO')
  THEN
    RETURN NULL;
  END IF;

  v_pode_operar :=
    coalesce((SELECT auth.role()), '') = 'service_role'
    OR public.can_operate_turma_academics(v_context.turma_id);

  v_pagamento_confirmado :=
    public.matricula_tecnica_pagamento_confirmado(v_context.id);

  SELECT
    count(*) FILTER (
      WHERE public.documento_aluno_regra_estado(documento.id)
        = 'OBRIGATORIO'
    )::integer,
    count(*) FILTER (
      WHERE public.documento_aluno_regra_estado(documento.id)
        = 'OBRIGATORIO'
        AND (
          versao.status = 'aprovado'
          OR EXISTS (
            SELECT 1
            FROM public.documentos_aluno_recebimentos_sem_anexo recebimento
            WHERE recebimento.documento_id = documento.id
              AND recebimento.revogado_em IS NULL
          )
        )
    )::integer,
    count(*) FILTER (
      WHERE public.documento_aluno_regra_estado(documento.id)
        = 'DADOS_INSUFICIENTES'
    )::integer
  INTO
    v_documentos_total,
    v_documentos_concluidos,
    v_dados_insuficientes
  FROM public.documentos_aluno documento
  LEFT JOIN public.documentos_aluno_versoes versao
    ON versao.id = documento.versao_atual_id
  WHERE documento.aluno_id = v_context.aluno_id;

  v_documentacao_concluida :=
    v_documentos_total > 0
    AND v_documentos_concluidos = v_documentos_total
    AND v_dados_insuficientes = 0;

  SELECT EXISTS (
    SELECT 1
    FROM public.documentos_aluno_lotes lote
    WHERE lote.aluno_id = v_context.aluno_id
      AND (
        lote.status = 'aguardando_mapeamento'
        OR (
          lote.status = 'preparando'
          AND lote.criado_em >= now() - interval '24 hours'
        )
      )
  )
  INTO v_envio_em_andamento;

  SELECT
    liberacao.id,
    liberacao.motivo,
    liberacao.liberado_em,
    usuario.nome AS liberado_por_nome
  INTO v_liberacao
  FROM public.matricula_liberacoes_diario liberacao
  LEFT JOIN public.usuarios_sistema usuario
    ON usuario.auth_user_id = liberacao.liberado_por
  WHERE liberacao.matricula_id = v_context.id
    AND liberacao.revogado_em IS NULL
  LIMIT 1;

  v_sem_financeiro :=
    NOT public.matricula_possui_vinculo_financeiro(v_context.id);

  IF NOT v_pode_operar THEN
    v_bloqueios_regular :=
      array_append(v_bloqueios_regular, 'SEM_PERMISSAO');
    v_bloqueios_implantacao :=
      array_append(v_bloqueios_implantacao, 'SEM_PERMISSAO');
  END IF;
  IF v_context.fluxo_operacional <> 'REGULAR' THEN
    v_bloqueios_regular :=
      array_append(v_bloqueios_regular, 'FLUXO_NAO_REGULAR');
  END IF;
  IF upper(coalesce(v_context.status, ''))
    NOT IN ('PENDENTE', 'AGUARDANDO_CONFIRMACAO')
  THEN
    v_bloqueios_regular :=
      array_append(v_bloqueios_regular, 'STATUS_INCOMPATIVEL');
  END IF;
  IF upper(coalesce(v_context.turma_status, '')) <> 'EM_ANDAMENTO' THEN
    v_bloqueios_regular :=
      array_append(v_bloqueios_regular, 'TURMA_FORA_DE_ANDAMENTO');
  END IF;

  IF upper(coalesce(v_context.status, '')) <> 'PENDENTE' THEN
    v_bloqueios_implantacao :=
      array_append(v_bloqueios_implantacao, 'STATUS_INCOMPATIVEL');
  END IF;
  IF upper(coalesce(v_context.turma_status, '')) <> 'EM_ANDAMENTO' THEN
    v_bloqueios_implantacao :=
      array_append(v_bloqueios_implantacao, 'TURMA_FORA_DE_ANDAMENTO');
  END IF;
  IF NOT v_sem_financeiro THEN
    v_bloqueios_implantacao :=
      array_append(v_bloqueios_implantacao, 'COBRANCA_EXISTENTE');
  END IF;
  IF v_liberacao.id IS NOT NULL THEN
    v_bloqueios_implantacao :=
      array_append(v_bloqueios_implantacao, 'LIBERACAO_JA_ATIVA');
  END IF;

  RETURN jsonb_build_object(
    'matriculaId', v_context.id,
    'alunoId', v_context.aluno_id,
    'turmaId', v_context.turma_id,
    'cursoNome', v_context.curso_nome,
    'turmaNome', v_context.turma_nome,
    'status', upper(coalesce(v_context.status, '')),
    'turmaStatus', upper(coalesce(v_context.turma_status, '')),
    'fluxo', v_context.fluxo_operacional,
    'pagamento', jsonb_build_object(
      'estado',
      CASE
        WHEN v_context.fluxo_operacional = 'IMPLANTACAO'
          THEN 'NAO_APLICAVEL'
        WHEN v_pagamento_confirmado THEN 'CONFIRMADO'
        ELSE 'PENDENTE'
      END
    ),
    'documentacao', jsonb_build_object(
      'concluida', v_documentacao_concluida,
      'obrigatoriosTotal', v_documentos_total,
      'concluidos', v_documentos_concluidos,
      'pendentes', greatest(
        v_documentos_total - v_documentos_concluidos,
        0
      ),
      'dadosPessoaisPendentes', v_dados_insuficientes > 0,
      'envioEmAndamento', v_envio_em_andamento
    ),
    'liberacaoAcademica', CASE
      WHEN v_liberacao.id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'id', v_liberacao.id,
        'ativa', true,
        'liberadoEm', v_liberacao.liberado_em,
        'liberadoPorNome', v_liberacao.liberado_por_nome,
        'motivo', v_liberacao.motivo
      )
    END,
    'acoes', jsonb_build_object(
      'ativarRegular', jsonb_build_object(
        'permitida', cardinality(v_bloqueios_regular) = 0,
        'bloqueios', to_jsonb(v_bloqueios_regular)
      ),
      'liberarImplantacao', jsonb_build_object(
        'permitida', cardinality(v_bloqueios_implantacao) = 0,
        'bloqueios', to_jsonb(v_bloqueios_implantacao)
      ),
      'revogarLiberacao', jsonb_build_object(
        'permitida', v_pode_operar AND v_liberacao.id IS NOT NULL,
        'bloqueios', CASE
          WHEN v_pode_operar AND v_liberacao.id IS NOT NULL
            THEN '[]'::jsonb
          ELSE jsonb_build_array('LIBERACAO_INATIVA_OU_SEM_PERMISSAO')
        END
      )
    )
  );
END;
$function$
;

create or replace function public.ativar_matricula_tecnica_apos_documentos(p_matricula_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_context record;
begin
  if auth.uid() is null then
    raise exception 'Autenticação obrigatória.' using errcode = '42501';
  end if;
  select matricula.id, matricula.turma_id, matricula.status,
    matricula.fluxo_operacional, turma.status as turma_status,
    upper(coalesce(curso.modalidade, '')) as modalidade
  into v_context
  from public.matriculas matricula
  join public.turmas turma on turma.id = matricula.turma_id
  join public.cursos curso on curso.id = turma.curso_id
  where matricula.id = p_matricula_id;

  if v_context.id is null then
    raise exception 'Matrícula não encontrada.' using errcode = '22023';
  end if;
  if not public.can_operate_turma_academics(v_context.turma_id) then
    raise exception 'A permissão de Gestão acadêmica é obrigatória para ativar a matrícula.'
      using errcode = '42501';
  end if;
  if v_context.modalidade not in ('TECNICO', 'TÉCNICO')
    or v_context.fluxo_operacional <> 'REGULAR'
  then
    raise exception 'A ativação exige matrícula técnica regular.' using errcode = '22023';
  end if;
  if v_context.status = 'ATIVO' then
    return public.matricula_tecnica_workflow_snapshot(v_context.id);
  end if;
  if not internal_academic.activate_started_technical_enrollment(v_context.id) then
    raise exception 'A ativação exige matrícula pendente em turma em andamento.'
      using errcode = '22023';
  end if;
  return public.matricula_tecnica_workflow_snapshot(v_context.id);
end;
$function$;
revoke all on function public.ativar_matricula_tecnica_apos_documentos(uuid) from public, anon;
grant execute on function public.ativar_matricula_tecnica_apos_documentos(uuid)
  to authenticated, service_role;

commit;
