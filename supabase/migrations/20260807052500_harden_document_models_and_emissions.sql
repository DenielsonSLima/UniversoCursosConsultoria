-- Fechamento do lote de documentos (2026-08-07).
-- Mantém a autoridade de estado, QR, aprovação e personalização no Postgres.

create table if not exists public.documentos_modelos_aprovacoes (
  id uuid primary key default extensions.gen_random_uuid(),
  template_key text not null check (template_key = 'contrato_aluno'),
  modalidade text not null check (modalidade in ('TECNICO', 'LIVRE', 'SUPERIOR')),
  revisao integer not null check (revisao > 0),
  aprovado_por uuid,
  termo_confirmacao text not null check (termo_confirmacao = 'APROVADO_JURIDICAMENTE'),
  request_id uuid not null unique,
  created_at timestamptz not null default now(),
  unique (template_key, modalidade, revisao)
);

alter table public.documentos_modelos_aprovacoes enable row level security;
revoke all on table public.documentos_modelos_aprovacoes
  from public, anon, authenticated, service_role;

-- Os modelos de contrato que nasceram ativos antes deste ledger não possuem
-- uma aprovação vinculada à sua revisão. Eles não podem continuar emitíveis
-- apenas pelo status: a migração cria uma nova revisão em análise, preserva a
-- revisão anterior como histórico e exige a aprovação explícita abaixo.
with modelos_legados_em_revisao as (
  update public.documentos_modelos_configuracoes model
  set
    revisao = model.revisao + 1,
    status = 'EM_REVISAO',
    conteudo = jsonb_set(model.conteudo - 'status', '{qr,habilitado}', 'true'::jsonb, true),
    updated_at = now()
  where model.template_key = 'contrato_aluno'
    and model.modalidade in ('TECNICO', 'LIVRE', 'SUPERIOR')
    and model.status = 'ATIVO'
  returning model.*
)
insert into public.documentos_modelos_historico (
  template_key, modalidade, revisao, status, conteudo, atualizado_por, request_id
)
select
  model.template_key,
  model.modalidade,
  model.revisao,
  model.status,
  model.conteudo,
  model.atualizado_por,
  null
from modelos_legados_em_revisao model;

-- O campo status vindo do navegador nunca ativa contrato. Qualquer alteração
-- material cria uma revisão jurídica; a ativação acontece somente pela RPC
-- específica abaixo, com trilha de auditoria e revisão esperada.
create or replace function public.save_modelo_documento_template_secure(
  p_template_key text,
  p_modality text,
  p_expected_revision integer,
  p_content jsonb,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_template_key text := lower(btrim(coalesce(p_template_key, '')));
  v_modality text := upper(coalesce(nullif(btrim(p_modality), ''), 'GERAL'));
  v_content jsonb := p_content;
  v_status text;
  v_requested_status text := upper(nullif(btrim(p_content ->> 'status'), ''));
  v_fingerprint text;
  v_current public.documentos_modelos_configuracoes%rowtype;
  v_replay public.documentos_modelos_requisicoes%rowtype;
begin
  if not public.can_manage_modelos_documentos() then
    raise exception 'Acesso aos modelos de documentos não autorizado.'
      using errcode = '42501';
  end if;

  if p_request_id is null then
    raise exception 'Informe a chave de idempotência do salvamento.'
      using errcode = '22023';
  end if;

  if jsonb_typeof(coalesce(p_content, 'null'::jsonb)) <> 'object' then
    raise exception 'O conteúdo do modelo deve ser um objeto.' using errcode = '22023';
  end if;

  if v_template_key not in ('contrato_aluno', 'carteirinha_preceptor', 'calendario_aulas') then
    raise exception 'Tipo de modelo não permitido.' using errcode = '22023';
  end if;

  if (v_template_key = 'carteirinha_preceptor' and v_modality <> 'GERAL')
    or (v_template_key = 'contrato_aluno' and v_modality not in ('TECNICO', 'LIVRE', 'SUPERIOR'))
    or (v_template_key = 'calendario_aulas' and v_modality not in ('GERAL', 'TECNICO', 'LIVRE', 'SUPERIOR', 'EAD')) then
    raise exception 'Modalidade incompatível com o modelo.' using errcode = '22023';
  end if;

  if v_template_key = 'contrato_aluno' then
    -- status é um espelho visual. Ele não é parte do conteúdo aprovado.
    v_content := v_content - 'status';
    if lower(coalesce(v_content #>> '{qr,habilitado}', 'true')) = 'false' then
      raise exception 'O QR Code é obrigatório para contrato de aluno.' using errcode = '22023';
    end if;
    v_content := jsonb_set(v_content, '{qr,habilitado}', 'true'::jsonb, true);
  end if;

  -- O browser apenas edita parâmetros. A interpretação de QR e validade é da
  -- emissão segura, e os limites são validados antes de persistir a revisão.
  if v_template_key in ('contrato_aluno', 'carteirinha_preceptor') then
    if v_content ? 'qr' and jsonb_typeof(v_content -> 'qr') <> 'object' then
      raise exception 'A configuração de QR Code deve ser um objeto.' using errcode = '22023';
    end if;

    if coalesce(v_content #>> '{qr,modoValidade}', 'SEM_VENCIMENTO')
      not in ('SEM_VENCIMENTO', 'POR_DIAS') then
      raise exception 'Modo de validade do QR Code inválido.' using errcode = '22023';
    end if;

    if coalesce(v_content #>> '{qr,modoValidade}', 'SEM_VENCIMENTO') = 'POR_DIAS' then
      if coalesce(v_content #>> '{qr,diasValidade}', '') !~ '^[0-9]+$'
        or (v_content #>> '{qr,diasValidade}')::integer not between 1 and 3650 then
        raise exception 'A validade do QR Code deve estar entre 1 e 3650 dias.'
          using errcode = '22023';
      end if;
    end if;
  end if;

  v_fingerprint := md5(
    v_template_key || '|' || v_modality || '|' || coalesce(p_expected_revision::text, '')
    || '|' || v_content::text
  );

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_request_id::text));

  select replay.*
  into v_replay
  from public.documentos_modelos_requisicoes replay
  where replay.request_id = p_request_id;

  if found then
    if v_replay.template_key <> v_template_key
      or v_replay.modalidade <> v_modality
      or v_replay.fingerprint <> v_fingerprint then
      raise exception 'A chave de idempotência já foi usada com outro salvamento.'
        using errcode = '22023';
    end if;
    return public.get_modelo_documento_template_secure(v_template_key, v_modality);
  end if;

  select model.*
  into v_current
  from public.documentos_modelos_configuracoes model
  where model.template_key = v_template_key
    and model.modalidade = v_modality
  for update;

  if not found then
    raise exception 'Modelo de documento não encontrado.' using errcode = 'P0002';
  end if;

  if p_expected_revision is null or p_expected_revision <> v_current.revisao then
    raise exception 'O modelo foi atualizado por outra pessoa. Recarregue antes de salvar.'
      using errcode = '40001';
  end if;

  if v_template_key = 'contrato_aluno' then
    if v_current.status = 'ARQUIVADO' then
      raise exception 'Um modelo de contrato arquivado não pode ser alterado.'
        using errcode = '55000';
    end if;

    -- Um salvamento sem alteração material não abre uma revisão fictícia nem
    -- remove a aprovação já existente. Ainda registramos a idempotência para
    -- que uma repetição do request devolva exatamente o mesmo estado.
    if (v_current.conteudo - 'status') is not distinct from v_content then
      insert into public.documentos_modelos_requisicoes (
        request_id, template_key, modalidade, fingerprint, revisao
      ) values (
        p_request_id, v_template_key, v_modality, v_fingerprint, v_current.revisao
      );

      return public.get_modelo_documento_template_secure(v_template_key, v_modality);
    end if;

    -- Toda mudança material exige uma nova aprovação explícita da mesma
    -- revisão; o navegador não consegue conservar ou recriar o estado ativo.
    v_status := 'EM_REVISAO';
  else
    v_status := coalesce(v_requested_status, v_current.status);
    if v_status not in ('RASCUNHO', 'ATIVO', 'EM_REVISAO', 'ARQUIVADO') then
      raise exception 'Status de modelo inválido.' using errcode = '22023';
    end if;
  end if;

  update public.documentos_modelos_configuracoes model
  set
    revisao = model.revisao + 1,
    status = v_status,
    conteudo = v_content,
    atualizado_por = (select auth.uid()),
    updated_at = now()
  where model.template_key = v_template_key
    and model.modalidade = v_modality
  returning model.* into v_current;

  insert into public.documentos_modelos_historico (
    template_key, modalidade, revisao, status, conteudo, atualizado_por, request_id
  ) values (
    v_current.template_key,
    v_current.modalidade,
    v_current.revisao,
    v_current.status,
    v_current.conteudo,
    v_current.atualizado_por,
    p_request_id
  );

  insert into public.documentos_modelos_requisicoes (
    request_id, template_key, modalidade, fingerprint, revisao
  ) values (
    p_request_id, v_template_key, v_modality, v_fingerprint, v_current.revisao
  );

  return public.get_modelo_documento_template_secure(v_template_key, v_modality);
end;
$function$;

create or replace function public.aprovar_modelo_contrato_aluno_secure(
  p_modality text,
  p_expected_revision integer,
  p_acknowledgement text,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_modality text := upper(coalesce(nullif(btrim(p_modality), ''), ''));
  v_fingerprint text;
  v_current public.documentos_modelos_configuracoes%rowtype;
  v_replay public.documentos_modelos_requisicoes%rowtype;
begin
  if not public.can_manage_modelos_documentos() then
    raise exception 'Aprovação de contrato não autorizada.' using errcode = '42501';
  end if;

  if v_modality not in ('TECNICO', 'LIVRE', 'SUPERIOR') then
    raise exception 'Modalidade de contrato inválida.' using errcode = '22023';
  end if;

  if p_request_id is null then
    raise exception 'Informe a chave de idempotência da aprovação.' using errcode = '22023';
  end if;

  if btrim(coalesce(p_acknowledgement, '')) <> 'APROVADO_JURIDICAMENTE' then
    raise exception 'Confirmação jurídica explícita é obrigatória para aprovar o modelo.'
      using errcode = '22023';
  end if;

  v_fingerprint := md5(
    'APROVACAO_CONTRATO|' || v_modality || '|' || coalesce(p_expected_revision::text, '')
    || '|APROVADO_JURIDICAMENTE'
  );

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_request_id::text));

  select replay.*
  into v_replay
  from public.documentos_modelos_requisicoes replay
  where replay.request_id = p_request_id;

  if found then
    if v_replay.template_key <> 'contrato_aluno'
      or v_replay.modalidade <> v_modality
      or v_replay.fingerprint <> v_fingerprint then
      raise exception 'A chave de idempotência já foi usada com outra operação.'
        using errcode = '22023';
    end if;
    return public.get_modelo_documento_template_secure('contrato_aluno', v_modality);
  end if;

  select model.*
  into v_current
  from public.documentos_modelos_configuracoes model
  where model.template_key = 'contrato_aluno'
    and model.modalidade = v_modality
  for update;

  if not found then
    raise exception 'Modelo de contrato não encontrado.' using errcode = 'P0002';
  end if;

  if p_expected_revision is null or p_expected_revision <> v_current.revisao then
    raise exception 'O modelo foi atualizado por outra pessoa. Recarregue antes de aprovar.'
      using errcode = '40001';
  end if;

  if v_current.status = 'ATIVO' then
    if not exists (
      select 1
      from public.documentos_modelos_aprovacoes approval
      where approval.template_key = 'contrato_aluno'
        and approval.modalidade = v_modality
        and approval.revisao = v_current.revisao
    ) then
      raise exception 'A revisão ativa não possui aprovação registrada; salve uma alteração material e aprove a nova revisão.'
        using errcode = '55000';
    end if;

    insert into public.documentos_modelos_requisicoes (
      request_id, template_key, modalidade, fingerprint, revisao
    ) values (
      p_request_id, 'contrato_aluno', v_modality, v_fingerprint, v_current.revisao
    );

    return public.get_modelo_documento_template_secure('contrato_aluno', v_modality);
  end if;

  if v_current.status <> 'EM_REVISAO' then
    raise exception 'Somente uma revisão de contrato pode ser aprovada para emissão.' using errcode = '55000';
  end if;

  if lower(coalesce(v_current.conteudo #>> '{qr,habilitado}', 'true')) = 'false' then
    raise exception 'O QR Code é obrigatório para aprovar contrato de aluno.' using errcode = '22023';
  end if;

  update public.documentos_modelos_configuracoes model
  set
    status = 'ATIVO',
    conteudo = jsonb_set(model.conteudo - 'status', '{qr,habilitado}', 'true'::jsonb, true),
    atualizado_por = (select auth.uid()),
    updated_at = now()
  where model.template_key = 'contrato_aluno'
    and model.modalidade = v_modality
  returning model.* into v_current;

  insert into public.documentos_modelos_aprovacoes (
    template_key, modalidade, revisao, aprovado_por, termo_confirmacao, request_id
  ) values (
    'contrato_aluno', v_modality, v_current.revisao, (select auth.uid()),
    'APROVADO_JURIDICAMENTE', p_request_id
  );

  insert into public.documentos_modelos_requisicoes (
    request_id, template_key, modalidade, fingerprint, revisao
  ) values (
    p_request_id, 'contrato_aluno', v_modality, v_fingerprint, v_current.revisao
  );

  return public.get_modelo_documento_template_secure('contrato_aluno', v_modality);
end;
$function$;

-- A emissão original continua responsável por montar o snapshot, gerar o QR
-- e registrar o documento. Este invólucro acrescenta, antes de qualquer efeito
-- colateral, a regra jurídica de que a revisão ativa precisa ter uma aprovação
-- imutável no ledger. O lock compartilhado no modelo permanece até o fim da
-- transação e impede que uma revisão seja trocada durante a emissão.
alter function public.preparar_emissao_contrato_aluno_secure(uuid, text, uuid[], text, uuid)
  rename to preparar_emissao_contrato_aluno_base_secure;

create or replace function public.preparar_emissao_contrato_aluno_secure(
  p_polo_id uuid,
  p_modo text,
  p_matricula_ids uuid[],
  p_mensagem_personalizada text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_modalidade text;
  v_model public.documentos_modelos_configuracoes%rowtype;
begin
  if not public.can_manage_secretaria_document('contrato_aluno', p_polo_id) then
    raise exception 'Acesso à emissão de contrato não autorizado.' using errcode = '42501';
  end if;

  for v_modalidade in
    select distinct upper(coalesce(course.modalidade, ''))
    from public.matriculas enrollment
    join public.turmas class on class.id = enrollment.turma_id
    join public.cursos course on course.id = class.curso_id
    where enrollment.id = any(coalesce(p_matricula_ids, array[]::uuid[]))
      and class.polo_id = p_polo_id
      and upper(coalesce(enrollment.status, '')) = 'ATIVO'
      and upper(coalesce(course.modalidade, '')) in ('TECNICO', 'LIVRE', 'SUPERIOR')
  loop
    select model.*
    into v_model
    from public.documentos_modelos_configuracoes model
    where model.template_key = 'contrato_aluno'
      and model.modalidade = v_modalidade
    for share;

    if not found or v_model.status <> 'ATIVO' then
      raise exception 'O modelo de contrato da modalidade % ainda não está ativo para emissão.',
        v_modalidade using errcode = '55000';
    end if;

    if not exists (
      select 1
      from public.documentos_modelos_aprovacoes approval
      where approval.template_key = 'contrato_aluno'
        and approval.modalidade = v_modalidade
        and approval.revisao = v_model.revisao
    ) then
      raise exception 'O modelo de contrato da modalidade % não possui aprovação da revisão %.',
        v_modalidade, v_model.revisao using errcode = '55000';
    end if;
  end loop;

  return public.preparar_emissao_contrato_aluno_base_secure(
    p_polo_id,
    p_modo,
    p_matricula_ids,
    p_mensagem_personalizada,
    p_idempotency_key
  );
end;
$function$;

create or replace function public.renderizar_contrato_aluno_documento(
  p_template jsonb,
  p_snapshot jsonb,
  p_codigo_validacao text,
  p_validade_ate timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_body text := coalesce(p_template ->> 'corpo', '');
  v_footer text := coalesce(p_template ->> 'rodape', '');
  v_header text := coalesce(p_template ->> 'cabecalho', '');
  v_qr_enabled boolean := true;
  v_watermark_enabled boolean := lower(coalesce(p_template #>> '{marcaDagua,habilitada}', 'true')) <> 'false';
  v_condicoes text;
  v_message text := nullif(btrim(regexp_replace(
    coalesce(p_snapshot ->> 'mensagemPersonalizada', ''), '[[:cntrl:]]+', ' ', 'g'
  )), '');
  v_validade_texto text := case
    when p_validade_ate is null then 'Sem vencimento'
    else to_char(p_validade_ate, 'DD/MM/YYYY')
  end;
begin
  v_condicoes := concat_ws(
    '; ',
    case when p_snapshot #>> '{financeiro,descontoPontualidadeExibicao}' is not null
      then 'Desconto de pontualidade: ' || (p_snapshot #>> '{financeiro,descontoPontualidadeExibicao}') end,
    case when p_snapshot #>> '{financeiro,jurosAtrasoExibicao}' is not null
      then 'Juros por atraso: ' || (p_snapshot #>> '{financeiro,jurosAtrasoExibicao}') end,
    case when p_snapshot #>> '{financeiro,multaAtrasoExibicao}' is not null
      then 'Multa por atraso: ' || (p_snapshot #>> '{financeiro,multaAtrasoExibicao}') end,
    case when p_snapshot #>> '{financeiro,multaAtrasoPercentual}' is not null
      then 'Multa percentual: ' || (p_snapshot #>> '{financeiro,multaAtrasoPercentual}') || '%' end
  );

  v_body := replace(v_body, '{{aluno.nome}}', coalesce(p_snapshot #>> '{aluno,nome}', 'Não informado'));
  v_body := replace(v_body, '{{aluno.nascimento}}', coalesce(p_snapshot #>> '{aluno,nascimentoExibicao}', 'Não informado'));
  v_body := replace(v_body, '{{aluno.cpf}}', coalesce(p_snapshot #>> '{aluno,cpf}', 'Não informado'));
  v_body := replace(v_body, '{{aluno.rg}}', coalesce(p_snapshot #>> '{aluno,rg}', 'Não informado'));
  v_body := replace(v_body, '{{aluno.orgaoExpedidor}}', coalesce(p_snapshot #>> '{aluno,orgaoExpedidor}', 'Não informado'));
  v_body := replace(v_body, '{{aluno.endereco.logradouro}}', coalesce(p_snapshot #>> '{aluno,endereco,logradouro}', 'Não informado'));
  v_body := replace(v_body, '{{aluno.endereco.numero}}', coalesce(p_snapshot #>> '{aluno,endereco,numero}', 'S/N'));
  v_body := replace(v_body, '{{aluno.endereco.cep}}', coalesce(p_snapshot #>> '{aluno,endereco,cep}', 'Não informado'));
  v_body := replace(v_body, '{{aluno.endereco.cidade}}', coalesce(p_snapshot #>> '{aluno,endereco,cidade}', 'Não informado'));
  v_body := replace(v_body, '{{aluno.endereco.uf}}', coalesce(p_snapshot #>> '{aluno,endereco,uf}', ''));
  v_body := replace(v_body, '{{aluno.telefone}}', coalesce(p_snapshot #>> '{aluno,telefone}', 'Não informado'));
  v_body := replace(v_body, '{{aluno.responsavel.nome}}', coalesce(p_snapshot #>> '{aluno,responsavel,nome}', 'Não informado'));
  v_body := replace(v_body, '{{aluno.responsavel.cpf}}', coalesce(p_snapshot #>> '{aluno,responsavel,cpf}', 'Não informado'));
  v_body := replace(v_body, '{{aluno.responsavel.telefone}}', coalesce(p_snapshot #>> '{aluno,responsavel,telefone}', 'Não informado'));
  v_body := replace(v_body, '{{instituicao.nome}}', coalesce(p_snapshot #>> '{instituicao,nome}', 'Não informado'));
  v_body := replace(v_body, '{{instituicao.cnpj}}', coalesce(p_snapshot #>> '{instituicao,cnpj}', 'Não informado'));
  v_body := replace(v_body, '{{curso.nome}}', coalesce(p_snapshot #>> '{curso,nome}', 'Não informado'));
  v_body := replace(v_body, '{{turma.nome}}', coalesce(p_snapshot #>> '{turma,nome}', 'Não informado'));
  v_body := replace(v_body, '{{turma.inicio}}', coalesce(p_snapshot #>> '{turma,inicioExibicao}', 'Não informado'));
  v_body := replace(v_body, '{{financeiro.valorMatricula}}', coalesce(p_snapshot #>> '{financeiro,valorMatriculaExibicao}', 'Não informado'));
  v_body := replace(v_body, '{{financeiro.valorRematricula}}', coalesce(p_snapshot #>> '{financeiro,valorRematriculaExibicao}', 'Não informado'));
  v_body := replace(v_body, '{{financeiro.quantidadeParcelas}}', coalesce(p_snapshot #>> '{financeiro,quantidadeParcelas}', 'Não informado'));
  v_body := replace(v_body, '{{financeiro.valorParcela}}', coalesce(p_snapshot #>> '{financeiro,valorParcelaExibicao}', 'Não informado'));
  v_body := replace(v_body, '{{financeiro.diaVencimento}}', coalesce(p_snapshot #>> '{financeiro,diaVencimento}', 'Não informado'));
  v_body := replace(v_body, '{{financeiro.primeiroVencimento}}', coalesce(p_snapshot #>> '{financeiro,primeiroVencimentoExibicao}', 'Não informado'));
  v_body := replace(v_body, '{{financeiro.condicoes}}', coalesce(nullif(v_condicoes, ''), 'Condições não informadas'));
  v_body := replace(v_body, '{{emissao.data}}', coalesce(p_snapshot #>> '{emissao,dataExibicao}', to_char(now(), 'DD/MM/YYYY')));
  v_body := replace(v_body, '{{validacao.codigo}}', coalesce(p_codigo_validacao, 'Não informado'));
  v_body := replace(v_body, '{{validacao.validade}}', v_validade_texto);
  if v_message is not null then
    v_body := concat_ws(E'\n\n', v_body, 'Mensagem complementar: ' || v_message);
  end if;

  v_footer := replace(v_footer, '{{emissao.data}}', coalesce(p_snapshot #>> '{emissao,dataExibicao}', to_char(now(), 'DD/MM/YYYY')));
  v_footer := replace(v_footer, '{{validacao.codigo}}', coalesce(p_codigo_validacao, 'Não informado'));
  v_footer := replace(v_footer, '{{validacao.validade}}', v_validade_texto);
  v_header := replace(v_header, '{{instituicao.nome}}', coalesce(p_snapshot #>> '{instituicao,nome}', 'UNIVERSO CURSOS E CONSULTORIA'));

  return jsonb_build_object(
    'kind', 'CONTRATO_ALUNO',
    'pageSize', 'A4_RETRATO',
    'pages', public.paginar_texto_documento_canonico(
      v_header,
      coalesce(nullif(p_template ->> 'tituloDocumento', ''), 'Contrato de Prestação de Serviços Educacionais'),
      v_body,
      v_footer
    ),
    'watermark', jsonb_build_object(
      'enabled', v_watermark_enabled,
      'label', coalesce(p_snapshot #>> '{marcaDagua,texto}', p_snapshot #>> '{instituicao,nome}'),
      'image_url', p_snapshot #>> '{marcaDagua,url}',
      'opacity', coalesce(p_snapshot #>> '{marcaDagua,opacidade}', case when p_template #>> '{marcaDagua,intensidade}' = 'MEDIA' then '0.10' else '0.06' end)
    ),
    'qr', jsonb_build_object(
      'enabled', v_qr_enabled,
      'label', coalesce(nullif(p_template #>> '{qr,rotulo}', ''), 'Validar documento'),
      'code', p_codigo_validacao,
      'validation_url', case when p_codigo_validacao is null then null else '/validador?code=' || p_codigo_validacao end,
      'valid_until', p_validade_ate,
      'validity_label', v_validade_texto
    )
  );
end;
$function$;

create or replace function public.get_secretaria_carteirinhas_preceptor_workspace_secure(
  p_polo_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_targets jsonb;
  v_template jsonb;
  v_policy jsonb;
  v_template_active boolean := false;
begin
  if not public.can_manage_secretaria_document('carteirinha_preceptor', p_polo_id) then
    raise exception 'Acesso às carteirinhas de preceptor não autorizado.'
      using errcode = '42501';
  end if;

  select jsonb_build_object(
    'templateKey', model.template_key,
    'modality', model.modalidade,
    'revision', model.revisao,
    'status', model.status,
    'updatedAt', model.updated_at,
    'content', model.conteudo
  )
  into v_template
  from public.documentos_modelos_configuracoes model
  where model.template_key = 'carteirinha_preceptor'
    and model.modalidade = 'GERAL';

  v_template_active := coalesce(v_template ->> 'status', '') = 'ATIVO';

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', professor.id,
        'professor_id', professor.id,
        'nome', professor.nome,
        'professor_nome', professor.nome,
        'cargo', 'Preceptor',
        'area_atuacao', coalesce(professor.area_formacao, professor.especialidade),
        'email', professor.email,
        'foto_url', professor.foto_url,
        'titulacao', professor.titulacao,
        'registro_profissional', professor.registro_profissional,
        'numero_registro', professor.numero_registro,
        'polo_id', p_polo_id,
        'elegivel', v_template_active,
        'mensagem_elegibilidade', case
          when v_template_active then null
          else 'O modelo de carteirinha está em revisão e não pode ser emitido.'
        end,
        'status_label', case
          when v_template_active then 'Professor ativo no polo'
          else 'Professor ativo · modelo em revisão'
        end
      ) order by professor.nome
    ),
    '[]'::jsonb
  )
  into v_targets
  from public.parceiros professor
  where upper(coalesce(professor.tipo, '')) = 'PROFESSOR'
    and upper(coalesce(professor.status, '')) = 'ATIVO'
    and (
      professor.polo_id = p_polo_id
      or p_polo_id = any(coalesce(professor.polo_ids, array[]::uuid[]))
      or exists (
        select 1
        from public.turmas_disciplinas class_subject
        join public.turmas class on class.id = class_subject.turma_id
        where class_subject.professor_id = professor.id
          and class.polo_id = p_polo_id
      )
    );

  select jsonb_build_object(
    'documento', policy.documento,
    'prefixo', policy.prefixo,
    'validade_dias', policy.validade_dias,
    'validacao_publica', policy.validacao_publica,
    'consulta_publica_ativa', policy.consulta_publica_ativa,
    'campos_publicos', policy.campos_publicos,
    'versao', policy.versao
  )
  into v_policy
  from public.documentos_validacao_politicas policy
  where policy.documento = 'carteirinha_preceptor';

  return jsonb_build_object(
    'targets', v_targets,
    'template', coalesce(v_template, '{}'::jsonb),
    'policy', coalesce(v_policy, '{}'::jsonb),
    'generated_at', clock_timestamp()
  );
end;
$function$;

-- Mantém a emissão já endurecida e a encapsula para garantir que a mensagem
-- personalizada seja incluída no payload canônico e no snapshot arquivado.
alter function public.preparar_emissao_carteirinha_preceptor_secure(uuid, text, uuid[], text, uuid)
  rename to preparar_emissao_carteirinha_preceptor_base_secure;

create or replace function public.preparar_emissao_carteirinha_preceptor_secure(
  p_polo_id uuid,
  p_modo text,
  p_professor_ids uuid[],
  p_mensagem_personalizada text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_mode text := upper(btrim(coalesce(p_modo, '')));
  v_message text := nullif(btrim(regexp_replace(
    coalesce(p_mensagem_personalizada, ''), '[[:cntrl:]]+', ' ', 'g'
  )), '');
  v_response jsonb;
  v_documents jsonb;
  v_document jsonb;
begin
  if v_mode not in ('INDIVIDUAL', 'LOTE', 'PERSONALIZADO') then
    raise exception 'Modo de emissão inválido.' using errcode = '22023';
  end if;

  if char_length(coalesce(v_message, '')) > 1000 then
    raise exception 'A mensagem personalizada deve ter no máximo 1000 caracteres.'
      using errcode = '22023';
  end if;

  if v_mode = 'PERSONALIZADO' and v_message is null then
    raise exception 'Informe a mensagem complementar da emissão personalizada.'
      using errcode = '22023';
  end if;

  if v_mode <> 'PERSONALIZADO' then
    v_message := null;
  end if;

  v_response := public.preparar_emissao_carteirinha_preceptor_base_secure(
    p_polo_id,
    v_mode,
    p_professor_ids,
    v_message,
    p_idempotency_key
  );

  if v_message is null then
    return v_response;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_set(
        item.value,
        '{render_payload,rendered,back,message}',
        to_jsonb(concat_ws(
          E'\n\n',
          nullif(item.value #>> '{render_payload,rendered,back,message}', ''),
          'Mensagem complementar: ' || v_message
        )),
        true
      )
    ),
    '[]'::jsonb
  )
  into v_documents
  from jsonb_array_elements(coalesce(v_response -> 'documents', '[]'::jsonb)) as item(value);

  for v_document in select value from jsonb_array_elements(v_documents) as item(value)
  loop
    update public.documentos_validacao_preceptores credential
    set
      dados_emissao = jsonb_set(
        credential.dados_emissao,
        '{renderedDocument,back,message}',
        to_jsonb(v_document #>> '{render_payload,rendered,back,message}'),
        true
      ),
      updated_at = now()
    where credential.id = (v_document ->> 'emission_id')::uuid;
  end loop;

  return jsonb_set(v_response, '{documents}', v_documents, true);
end;
$function$;

-- A opção EAD foi semeada por engano no contrato. Não existe emissão ou edição
-- associada, e o contrato solicitado cobre técnico, livre e especialização.
delete from public.documentos_modelos_historico
where template_key = 'contrato_aluno' and modalidade = 'EAD';
delete from public.documentos_modelos_requisicoes
where template_key = 'contrato_aluno' and modalidade = 'EAD';
delete from public.documentos_modelos_configuracoes
where template_key = 'contrato_aluno' and modalidade = 'EAD';

revoke all on function public.aprovar_modelo_contrato_aluno_secure(text, integer, text, uuid)
  from public, anon;
grant execute on function public.aprovar_modelo_contrato_aluno_secure(text, integer, text, uuid)
  to authenticated, service_role;

revoke all on function public.preparar_emissao_contrato_aluno_base_secure(uuid, text, uuid[], text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.preparar_emissao_contrato_aluno_secure(uuid, text, uuid[], text, uuid)
  from public, anon;
grant execute on function public.preparar_emissao_contrato_aluno_secure(uuid, text, uuid[], text, uuid)
  to authenticated, service_role;

revoke all on function public.preparar_emissao_carteirinha_preceptor_base_secure(uuid, text, uuid[], text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.preparar_emissao_carteirinha_preceptor_secure(uuid, text, uuid[], text, uuid)
  from public, anon;
grant execute on function public.preparar_emissao_carteirinha_preceptor_secure(uuid, text, uuid[], text, uuid)
  to authenticated, service_role;
