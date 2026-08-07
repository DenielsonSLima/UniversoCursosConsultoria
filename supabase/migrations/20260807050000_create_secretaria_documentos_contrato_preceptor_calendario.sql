-- Lote 2026-08-07: contratos de aluno, carteirinhas de preceptor e
-- calendário de aulas. Todo dado canônico é preparado no Postgres; a UI
-- recebe somente snapshots já autorizados e prontos para renderização.

create extension if not exists pgcrypto with schema extensions;

-- -------------------------------------------------------------------------
-- Modelos versionados e privados
-- -------------------------------------------------------------------------

create table if not exists public.documentos_modelos_configuracoes (
  template_key text not null,
  modalidade text not null default 'GERAL',
  revisao integer not null default 1 check (revisao > 0),
  status text not null default 'RASCUNHO'
    check (status in ('RASCUNHO', 'ATIVO', 'EM_REVISAO', 'ARQUIVADO')),
  conteudo jsonb not null default '{}'::jsonb
    check (jsonb_typeof(conteudo) = 'object'),
  atualizado_por uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (template_key, modalidade),
  check (template_key in (
    'contrato_aluno',
    'carteirinha_preceptor',
    'calendario_aulas'
  )),
  check (
    (template_key = 'carteirinha_preceptor' and modalidade = 'GERAL')
    or (
      template_key = 'contrato_aluno'
      and modalidade in ('TECNICO', 'LIVRE', 'SUPERIOR', 'EAD')
    )
    or (
      template_key = 'calendario_aulas'
      and modalidade in ('GERAL', 'TECNICO', 'LIVRE', 'SUPERIOR', 'EAD')
    )
  )
);

create table if not exists public.documentos_modelos_historico (
  id uuid primary key default extensions.gen_random_uuid(),
  template_key text not null,
  modalidade text not null,
  revisao integer not null check (revisao > 0),
  status text not null,
  conteudo jsonb not null check (jsonb_typeof(conteudo) = 'object'),
  atualizado_por uuid,
  request_id uuid,
  created_at timestamptz not null default now(),
  unique (template_key, modalidade, revisao)
);

create table if not exists public.documentos_modelos_requisicoes (
  request_id uuid primary key,
  template_key text not null,
  modalidade text not null,
  fingerprint text not null,
  revisao integer not null,
  created_at timestamptz not null default now()
);

alter table public.documentos_modelos_configuracoes enable row level security;
alter table public.documentos_modelos_historico enable row level security;
alter table public.documentos_modelos_requisicoes enable row level security;

revoke all on table public.documentos_modelos_configuracoes from public, anon, authenticated, service_role;
revoke all on table public.documentos_modelos_historico from public, anon, authenticated, service_role;
revoke all on table public.documentos_modelos_requisicoes from public, anon, authenticated, service_role;

create or replace function public.can_manage_modelos_documentos()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce((select auth.role()), '') = 'service_role'
    or public.gestor_has_tab('cadastros', 'cadastros-modelos');
$function$;

revoke all on function public.can_manage_modelos_documentos()
  from public, anon, authenticated;

create or replace function public.get_modelo_documento_template_secure(
  p_template_key text,
  p_modality text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_template_key text := lower(btrim(coalesce(p_template_key, '')));
  v_modality text := upper(coalesce(nullif(btrim(p_modality), ''), 'GERAL'));
  v_model public.documentos_modelos_configuracoes%rowtype;
begin
  if not public.can_manage_modelos_documentos() then
    raise exception 'Acesso aos modelos de documentos não autorizado.'
      using errcode = '42501';
  end if;

  select model.*
  into v_model
  from public.documentos_modelos_configuracoes model
  where model.template_key = v_template_key
    and model.modalidade = v_modality;

  if not found then
    raise exception 'Modelo de documento não encontrado.' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'templateKey', v_model.template_key,
    'modality', v_model.modalidade,
    'revision', v_model.revisao,
    'status', v_model.status,
    'updatedAt', v_model.updated_at,
    'content', v_model.conteudo
  );
end;
$function$;

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
    or (v_template_key = 'contrato_aluno' and v_modality not in ('TECNICO', 'LIVRE', 'SUPERIOR', 'EAD'))
    or (v_template_key = 'calendario_aulas' and v_modality not in ('GERAL', 'TECNICO', 'LIVRE', 'SUPERIOR', 'EAD')) then
    raise exception 'Modalidade incompatível com o modelo.' using errcode = '22023';
  end if;

  -- O browser só apresenta esta configuração. A forma de interpretar QR e
  -- validade continua sendo exclusivamente do servidor no momento da emissão.
  if v_template_key in ('contrato_aluno', 'carteirinha_preceptor') then
    if p_content ? 'qr' and jsonb_typeof(p_content -> 'qr') <> 'object' then
      raise exception 'A configuração de QR Code deve ser um objeto.' using errcode = '22023';
    end if;

    if coalesce(p_content #>> '{qr,modoValidade}', 'SEM_VENCIMENTO')
      not in ('SEM_VENCIMENTO', 'POR_DIAS') then
      raise exception 'Modo de validade do QR Code inválido.' using errcode = '22023';
    end if;

    if coalesce(p_content #>> '{qr,modoValidade}', 'SEM_VENCIMENTO') = 'POR_DIAS' then
      if coalesce(p_content #>> '{qr,diasValidade}', '') !~ '^[0-9]+$' then
        raise exception 'A validade do QR Code deve estar entre 1 e 3650 dias.'
          using errcode = '22023';
      end if;

      if (p_content #>> '{qr,diasValidade}')::integer not between 1 and 3650 then
        raise exception 'A validade do QR Code deve estar entre 1 e 3650 dias.'
          using errcode = '22023';
      end if;
    end if;
  end if;

  v_fingerprint := md5(
    v_template_key || '|' || v_modality || '|' || coalesce(p_expected_revision::text, '')
    || '|' || p_content::text
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

  v_status := coalesce(v_requested_status, v_current.status);
  if v_status not in ('RASCUNHO', 'ATIVO', 'EM_REVISAO', 'ARQUIVADO') then
    raise exception 'Status de modelo inválido.' using errcode = '22023';
  end if;

  if p_expected_revision is null or p_expected_revision <> v_current.revisao then
    raise exception 'O modelo foi atualizado por outra pessoa. Recarregue antes de salvar.'
      using errcode = '40001';
  end if;

  update public.documentos_modelos_configuracoes model
  set
    revisao = model.revisao + 1,
    status = v_status,
    conteudo = p_content,
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

  return jsonb_build_object(
    'templateKey', v_current.template_key,
    'modality', v_current.modalidade,
    'revision', v_current.revisao,
    'status', v_current.status,
    'updatedAt', v_current.updated_at,
    'content', v_current.conteudo
  );
end;
$function$;

revoke all on function public.get_modelo_documento_template_secure(text, text)
  from public, anon;
revoke all on function public.save_modelo_documento_template_secure(text, text, integer, jsonb, uuid)
  from public, anon;
grant execute on function public.get_modelo_documento_template_secure(text, text)
  to authenticated, service_role;
grant execute on function public.save_modelo_documento_template_secure(text, text, integer, jsonb, uuid)
  to authenticated, service_role;

-- A renderização recebe somente um snapshot já autorizado. Nenhuma variável de
-- aluno, contrato ou valor é interpolada pelo navegador.
create or replace function public.formatar_valor_brl_documento(p_valor numeric)
returns text
language sql
immutable
strict
set search_path = ''
as $function$
  select 'R$ ' || replace(
    replace(
      replace(to_char(p_valor, 'FM999G999G999G990D00'), ',', chr(1)),
      '.',
      ','
    ),
    chr(1),
    '.'
  );
$function$;

create or replace function public.paginar_texto_documento_canonico(
  p_header text,
  p_title text,
  p_body text,
  p_footer text,
  p_max_caracteres integer default 3600
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $function$
declare
  v_part text;
  v_current text := '';
  v_pages jsonb := '[]'::jsonb;
  v_index integer := 0;
  v_parts text[] := regexp_split_to_array(coalesce(p_body, ''), E'\n{2,}');
  v_limit integer := greatest(1200, least(coalesce(p_max_caracteres, 3600), 7000));
begin
  foreach v_part in array v_parts loop
    v_part := btrim(v_part);
    if v_part = '' then
      continue;
    end if;

    if v_current <> ''
      and char_length(v_current) + char_length(v_part) + 2 > v_limit then
      v_index := v_index + 1;
      v_pages := v_pages || jsonb_build_array(jsonb_build_object(
        'header', p_header,
        'title', case when v_index = 1 then p_title else p_title || ' — continuação' end,
        'body', v_current,
        'footer', null
      ));
      v_current := v_part;
    else
      v_current := concat_ws(E'\n\n', nullif(v_current, ''), v_part);
    end if;
  end loop;

  if v_current = '' then
    v_current := coalesce(p_body, '');
  end if;

  v_index := v_index + 1;
  v_pages := v_pages || jsonb_build_array(jsonb_build_object(
    'header', p_header,
    'title', case when v_index = 1 then p_title else p_title || ' — continuação' end,
    'body', v_current,
    'footer', p_footer
  ));

  return v_pages;
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
  v_qr_enabled boolean := lower(coalesce(p_template #>> '{qr,habilitado}', 'true')) <> 'false';
  v_watermark_enabled boolean := lower(coalesce(p_template #>> '{marcaDagua,habilitada}', 'true')) <> 'false';
  v_condicoes text;
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

revoke all on function public.formatar_valor_brl_documento(numeric)
  from public, anon, authenticated;
revoke all on function public.paginar_texto_documento_canonico(text, text, text, text, integer)
  from public, anon, authenticated;
revoke all on function public.renderizar_contrato_aluno_documento(jsonb, jsonb, text, timestamptz)
  from public, anon, authenticated;

-- -------------------------------------------------------------------------
-- Tipos de validação e autorização de Secretaria
-- -------------------------------------------------------------------------

alter table public.documentos_validacao
  drop constraint if exists documentos_validacao_documento_check;

alter table public.documentos_validacao
  add constraint documentos_validacao_documento_check
  check (documento in (
    'carteirinha', 'cracha_estagio', 'declaracao_matricula',
    'declaracao_frequencia', 'declaracao_irpf', 'boletim',
    'atestado_conclusao_tecnico', 'historico_escolar', 'transferencia',
    'rematricula', 'termo_estagio', 'pasta_identificacao',
    'ficha_matricula', 'certificado_tecnico', 'certificado_livre',
    'certificado_ead', 'certificado_especializacao', 'contrato_aluno'
  ));

insert into public.documentos_validacao_politicas (
  documento,
  prefixo,
  escopo_identidade,
  validade_dias,
  exige_vinculo_ativo,
  validacao_publica,
  campos_publicos,
  consulta_publica_ativa,
  versao,
  updated_at
)
values
  (
    'contrato_aluno',
    'CON-ALU',
    'PROCESSO',
    null,
    false,
    true,
    array['studentName', 'courseName', 'institutionName', 'issuedAt', 'unitName']::text[],
    true,
    1,
    now()
  ),
  (
    'carteirinha_preceptor',
    'PRE',
    'PROCESSO',
    365,
    false,
    true,
    array['studentName', 'expiresAt', 'institutionName', 'issuedAt', 'unitName']::text[],
    true,
    1,
    now()
  )
on conflict (documento) do nothing;

insert into public.documentos_validacao_politicas_historico (
  documento, versao, prefixo, campos_publicos, consulta_publica_ativa,
  validacao_publica, escopo_identidade, validade_dias, exige_vinculo_ativo,
  ator_id, ator_role, motivo
)
select
  policy.documento,
  policy.versao,
  policy.prefixo,
  policy.campos_publicos,
  policy.consulta_publica_ativa,
  policy.validacao_publica,
  policy.escopo_identidade,
  policy.validade_dias,
  policy.exige_vinculo_ativo,
  null,
  'migration',
  'Inclusão de política documental do lote de Secretaria'
from public.documentos_validacao_politicas policy
where policy.documento in ('contrato_aluno', 'carteirinha_preceptor')
on conflict (documento, versao) do nothing;

create or replace function public.can_manage_secretaria_document(
  p_documento text,
  p_polo_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce((select auth.role()), '') = 'service_role'
    or (
      case
        when p_documento = 'carteirinha' then
          public.gestor_has_tab('secretaria', 'carteirinha')
          or public.gestor_has_tab('secretaria', 'carteirinhas')
        when p_documento = 'carteirinha_preceptor' then
          public.gestor_has_tab('secretaria', 'carteirinha-preceptor')
          or public.gestor_has_tab('secretaria', 'carteirinhas')
        when p_documento = 'contrato_aluno' then
          public.gestor_has_tab('secretaria', 'contrato-aluno')
          or public.gestor_has_tab('secretaria', 'declaracoes')
        when p_documento = 'cracha_estagio' then
          public.gestor_has_tab('secretaria', 'cracha-estagio')
          or public.gestor_has_tab('secretaria', 'carteirinhas')
        when p_documento = 'cracha_periodo_eleitoral' then
          public.gestor_has_tab('secretaria', 'cracha-periodo-eleitoral')
          or public.gestor_has_tab('secretaria', 'carteirinhas')
        when p_documento = 'declaracao_matricula' then
          public.gestor_has_tab('secretaria', 'declaracao-matricula')
          or public.gestor_has_tab('secretaria', 'declaracoes')
          or public.gestor_has_module('parceiros')
        when p_documento = 'declaracao_frequencia' then
          public.gestor_has_tab('secretaria', 'declaracao-frequencia')
          or public.gestor_has_tab('secretaria', 'declaracoes')
        when p_documento = 'boletim' then
          public.gestor_has_tab('secretaria', 'boletim')
          or public.gestor_has_tab('secretaria', 'declaracoes')
          or public.gestor_has_module('parceiros')
        when p_documento = 'atestado_conclusao_tecnico' then
          public.gestor_has_tab('secretaria', 'atestado-conclusao')
          or public.gestor_has_tab('secretaria', 'declaracoes')
        when p_documento = 'declaracao_irpf' then
          public.gestor_has_tab('secretaria', 'declaracao-irpf')
          or public.gestor_has_tab('secretaria', 'declaracoes')
          or public.gestor_has_module('parceiros')
        when p_documento = 'historico_escolar' then
          public.gestor_has_tab('secretaria', 'historico-escolar')
          or public.gestor_has_tab('secretaria', 'historico')
        when p_documento in (
          'certificado_tecnico', 'certificado_ead', 'certificado_livre',
          'certificado_especializacao'
        ) then
          public.gestor_has_tab('secretaria', 'certificados')
          or public.gestor_has_tab('secretaria', 'historico')
        when p_documento = 'rematricula' then
          public.gestor_has_tab('secretaria', 'rematricula')
          or public.gestor_has_tab('secretaria', 'solicitacoes')
        when p_documento = 'termo_estagio' then
          public.gestor_has_tab('secretaria', 'termo-estagio')
          or public.gestor_has_tab('secretaria', 'solicitacoes')
        when p_documento = 'transferencia' then
          public.gestor_has_tab('secretaria', 'transferencia')
          or public.gestor_has_tab('secretaria', 'solicitacoes')
        when p_documento = 'pasta_identificacao' then
          public.gestor_has_tab('secretaria', 'pasta-identificacao')
          or public.gestor_has_tab('secretaria', 'fichas')
        when p_documento = 'ficha_matricula' then
          public.gestor_has_tab('secretaria', 'ficha-matricula')
          or public.gestor_has_tab('secretaria', 'fichas')
        else false
      end
      and case
        when p_polo_id is null then public.gestor_has_all_polos()
        else public.is_gestor_for_polo(p_polo_id)
      end
    );
$function$;

revoke all on function public.can_manage_secretaria_document(text, uuid)
  from public, anon, authenticated;

-- -------------------------------------------------------------------------
-- Ledger independente da credencial de preceptor
-- -------------------------------------------------------------------------

create table if not exists public.documentos_validacao_preceptores (
  id uuid primary key default extensions.gen_random_uuid(),
  identidade text not null unique,
  codigo text not null unique,
  professor_id uuid not null references public.parceiros(id) on delete restrict,
  polo_id uuid not null references public.polos(id) on delete restrict,
  status text not null default 'ATIVO' check (status in ('ATIVO', 'REVOGADO')),
  emitido_em timestamptz not null default now(),
  ultima_emissao_em timestamptz not null default now(),
  validade_ate timestamptz,
  revogado_em timestamptz,
  emitido_por uuid,
  quantidade_emissoes integer not null default 1 check (quantidade_emissoes > 0),
  template_revisao integer not null check (template_revisao > 0),
  template_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(template_snapshot) = 'object'),
  dados_emissao jsonb not null default '{}'::jsonb check (jsonb_typeof(dados_emissao) = 'object'),
  dados_publicos_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(dados_publicos_snapshot) = 'object'),
  campos_publicos_emissao text[] not null default array['institutionName', 'issuedAt']::text[],
  politica_versao_emissao integer not null default 1 check (politica_versao_emissao > 0),
  validacao_publica boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists documentos_validacao_preceptores_professor_polo_idx
  on public.documentos_validacao_preceptores (professor_id, polo_id, ultima_emissao_em desc);
create index if not exists documentos_validacao_preceptores_codigo_idx
  on public.documentos_validacao_preceptores (codigo);

alter table public.documentos_validacao_preceptores enable row level security;
revoke all on table public.documentos_validacao_preceptores from public, anon, authenticated, service_role;

-- -------------------------------------------------------------------------
-- Idempotência de emissões e horários oficiais da grade
-- -------------------------------------------------------------------------

create table if not exists public.secretaria_documentos_emissao_requisicoes (
  request_id uuid primary key,
  tipo text not null check (tipo in ('CONTRATO_ALUNO', 'CARTEIRINHA_PRECEPTOR')),
  fingerprint text not null,
  resposta jsonb not null check (jsonb_typeof(resposta) = 'object'),
  created_at timestamptz not null default now()
);

alter table public.secretaria_documentos_emissao_requisicoes enable row level security;
revoke all on table public.secretaria_documentos_emissao_requisicoes from public, anon, authenticated, service_role;

alter table public.aulas_turma
  add column if not exists hora_inicio time without time zone,
  add column if not exists hora_fim time without time zone;

alter table public.aulas_turma
  drop constraint if exists aulas_turma_horario_intervalo_check;

alter table public.aulas_turma
  add constraint aulas_turma_horario_intervalo_check
  check (
    (hora_inicio is null and hora_fim is null)
    or (hora_inicio is not null and hora_fim is not null and hora_fim > hora_inicio)
  );

do $realtime$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'aulas_turma'
  ) then
    alter publication supabase_realtime add table public.aulas_turma;
  end if;
end;
$realtime$;

create or replace function public.definir_horario_encontro_turma(
  p_aula_id uuid,
  p_hora_inicio time,
  p_hora_fim time
)
returns public.aulas_turma
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_aula public.aulas_turma%rowtype;
begin
  select aula.*
  into v_aula
  from public.aulas_turma aula
  where aula.id = p_aula_id
  for update;

  if not found then
    raise exception 'Encontro de aula não encontrado.' using errcode = 'P0002';
  end if;

  if coalesce((select auth.role()), '') <> 'service_role'
    and not public.can_write_turma(v_aula.turma_id) then
    raise exception 'Sem permissão para ajustar o horário do encontro.'
      using errcode = '42501';
  end if;

  if (p_hora_inicio is null) <> (p_hora_fim is null)
    or (p_hora_inicio is not null and p_hora_fim <= p_hora_inicio) then
    raise exception 'Informe início e fim do horário em ordem válida.'
      using errcode = '22023';
  end if;

  update public.aulas_turma aula
  set hora_inicio = p_hora_inicio,
      hora_fim = p_hora_fim
  where aula.id = p_aula_id
  returning aula.* into v_aula;

  return v_aula;
end;
$function$;

revoke all on function public.definir_horario_encontro_turma(uuid, time, time)
  from public, anon;
grant execute on function public.definir_horario_encontro_turma(uuid, time, time)
  to authenticated, service_role;

-- Criação/edição de data, carga e horário em uma única transação. O cliente
-- informa apenas valores; as regras de turma/sessões são preservadas pelas
-- RPCs acadêmicas existentes e o servidor devolve o encontro canônico.
create or replace function public.salvar_encontro_turma_com_horario(
  p_turma_id uuid,
  p_disciplina_id uuid,
  p_titulo text,
  p_carga_horaria numeric,
  p_data_aula date,
  p_hora_inicio time default null,
  p_hora_fim time default null,
  p_aula_id uuid default null
)
returns setof public.aulas_turma
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_titulo text := nullif(btrim(coalesce(p_titulo, '')), '');
begin
  if (p_hora_inicio is null) <> (p_hora_fim is null)
    or (p_hora_inicio is not null and p_hora_fim <= p_hora_inicio) then
    raise exception 'Informe início e fim do horário em ordem válida.'
      using errcode = '22023';
  end if;

  if p_aula_id is not null and v_titulo is null then
    select aula.titulo
    into v_titulo
    from public.aulas_turma aula
    where aula.id = p_aula_id
      and aula.turma_id = p_turma_id
      and aula.disciplina_id = p_disciplina_id;
  end if;

  if v_titulo is null then
    raise exception 'Informe o conteúdo da aula.' using errcode = '22023';
  end if;

  perform 1
  from public.salvar_encontro_turma(
    p_turma_id,
    p_disciplina_id,
    v_titulo,
    p_carga_horaria,
    p_data_aula,
    p_aula_id
  );

  update public.aulas_turma aula
  set hora_inicio = p_hora_inicio,
      hora_fim = p_hora_fim
  where aula.turma_id = p_turma_id
    and aula.disciplina_id = p_disciplina_id
    and aula.data_aula = p_data_aula;

  return query
  select aula.*
  from public.aulas_turma aula
  where aula.turma_id = p_turma_id
    and aula.disciplina_id = p_disciplina_id
    and aula.data_aula = p_data_aula
  order by
    case aula.sessao when 'M' then 1 when 'T' then 2 when 'N' then 3 else 4 end,
    aula.created_at,
    aula.id;
end;
$function$;

revoke all on function public.salvar_encontro_turma_com_horario(uuid, uuid, text, numeric, date, time, time, uuid)
  from public, anon;
grant execute on function public.salvar_encontro_turma_com_horario(uuid, uuid, text, numeric, date, time, time, uuid)
  to authenticated, service_role;

-- -------------------------------------------------------------------------
-- Workspaces e emissões canônicas da Secretaria
-- -------------------------------------------------------------------------

create or replace function public.get_secretaria_contratos_aluno_workspace_secure(
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
  v_turmas jsonb;
  v_templates jsonb;
  v_policy jsonb;
begin
  if not public.can_manage_secretaria_document('contrato_aluno', p_polo_id) then
    raise exception 'Acesso aos contratos de aluno não autorizado.'
      using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', enrollment.id,
        'matricula_id', enrollment.id,
        'aluno_id', student.id,
        'aluno_nome', student.nome,
        'curso_nome', course.nome,
        'modalidade', upper(course.modalidade),
        'turma_id', class.id,
        'turma_nome', class.nome,
        'turma_codigo', class.codigo,
        'matricula_status', upper(enrollment.status),
        'elegivel', true,
        'mensagem_elegibilidade', null,
        'status_label', 'Matrícula ativa',
        'data_matricula', enrollment.data_matricula
      ) order by student.nome, class.nome
    ),
    '[]'::jsonb
  )
  into v_targets
  from public.matriculas enrollment
  join public.parceiros student on student.id = enrollment.aluno_id
  join public.turmas class on class.id = enrollment.turma_id
  join public.cursos course on course.id = class.curso_id
  where class.polo_id = p_polo_id
    and upper(coalesce(course.modalidade, '')) in ('TECNICO', 'LIVRE', 'SUPERIOR')
    and upper(coalesce(enrollment.status, '')) = 'ATIVO';

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', class.id,
        'nome', class.nome,
        'codigo', class.codigo,
        'curso_nome', course.nome,
        'modalidade', upper(course.modalidade)
      ) order by course.nome, class.nome
    ),
    '[]'::jsonb
  )
  into v_turmas
  from public.turmas class
  join public.cursos course on course.id = class.curso_id
  where class.polo_id = p_polo_id
    and upper(coalesce(course.modalidade, '')) in ('TECNICO', 'LIVRE', 'SUPERIOR');

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'templateKey', model.template_key,
        'modality', model.modalidade,
        'revision', model.revisao,
        'status', model.status,
        'updatedAt', model.updated_at,
        'content', model.conteudo
      ) order by model.modalidade
    ),
    '[]'::jsonb
  )
  into v_templates
  from public.documentos_modelos_configuracoes model
  where model.template_key = 'contrato_aluno';

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
  where policy.documento = 'contrato_aluno';

  return jsonb_build_object(
    'targets', v_targets,
    'turmas', v_turmas,
    'templates', v_templates,
    'policy', coalesce(v_policy, '{}'::jsonb),
    'generated_at', clock_timestamp()
  );
end;
$function$;

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
  v_mode text := upper(btrim(coalesce(p_modo, '')));
  v_message text := nullif(btrim(coalesce(p_mensagem_personalizada, '')), '');
  v_ids uuid[];
  v_expected_count integer;
  v_found_count integer;
  v_fingerprint text;
  v_replay public.secretaria_documentos_emissao_requisicoes%rowtype;
  v_target record;
  v_model public.documentos_modelos_configuracoes%rowtype;
  v_issued record;
  v_snapshot jsonb;
  v_rendered jsonb;
  v_validity timestamptz;
  v_validity_days integer;
  v_qr_enabled boolean;
  v_documents jsonb := '[]'::jsonb;
  v_response jsonb;
  v_reference text;
begin
  if not public.can_manage_secretaria_document('contrato_aluno', p_polo_id) then
    raise exception 'Acesso à emissão de contrato não autorizado.' using errcode = '42501';
  end if;

  if p_idempotency_key is null then
    raise exception 'Informe a chave de idempotência da emissão.' using errcode = '22023';
  end if;

  if v_mode not in ('INDIVIDUAL', 'LOTE', 'PERSONALIZADO') then
    raise exception 'Modo de emissão inválido.' using errcode = '22023';
  end if;

  if char_length(coalesce(v_message, '')) > 2000 then
    raise exception 'A mensagem personalizada deve ter no máximo 2000 caracteres.'
      using errcode = '22023';
  end if;

  select array_agg(distinct item order by item)
  into v_ids
  from unnest(coalesce(p_matricula_ids, array[]::uuid[])) item
  where item is not null;

  v_expected_count := coalesce(cardinality(v_ids), 0);
  if v_expected_count = 0 or v_expected_count > 100 then
    raise exception 'Selecione entre 1 e 100 matrículas para a emissão.'
      using errcode = '22023';
  end if;

  if v_mode = 'INDIVIDUAL' and v_expected_count <> 1 then
    raise exception 'A emissão individual exige exatamente uma matrícula.'
      using errcode = '22023';
  end if;

  v_fingerprint := md5(
    p_polo_id::text || '|' || v_mode || '|' || coalesce(v_message, '') || '|'
    || array_to_string(v_ids::text[], ',')
  );

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_idempotency_key::text));

  select replay.*
  into v_replay
  from public.secretaria_documentos_emissao_requisicoes replay
  where replay.request_id = p_idempotency_key;

  if found then
    if v_replay.tipo <> 'CONTRATO_ALUNO' or v_replay.fingerprint <> v_fingerprint then
      raise exception 'A chave de idempotência já foi usada com outra emissão.'
        using errcode = '22023';
    end if;
    return v_replay.resposta;
  end if;

  select count(*)
  into v_found_count
  from public.matriculas enrollment
  join public.turmas class on class.id = enrollment.turma_id
  join public.cursos course on course.id = class.curso_id
  where enrollment.id = any(v_ids)
    and class.polo_id = p_polo_id
    and upper(coalesce(enrollment.status, '')) = 'ATIVO'
    and upper(coalesce(course.modalidade, '')) in ('TECNICO', 'LIVRE', 'SUPERIOR');

  if v_found_count <> v_expected_count then
    raise exception 'Há matrícula sem vínculo ativo, fora do polo ou sem modalidade contratável.'
      using errcode = '42501';
  end if;

  for v_target in
    select
      enrollment.id as matricula_id,
      enrollment.aluno_id,
      enrollment.data_matricula,
      enrollment.valor_matricula_individual,
      enrollment.valor_rematricula_individual,
      enrollment.valor_parcela_individual,
      enrollment.dia_vencimento_individual,
      enrollment.data_primeiro_vencimento_financeiro,
      enrollment.desconto_pontualidade_individual,
      enrollment.juros_atraso_individual,
      enrollment.multa_atraso_individual,
      enrollment.multa_atraso_percentual_individual,
      student.nome as aluno_nome,
      student.nome_social,
      student.cpf_cnpj,
      student.rg,
      student.orgao_emissor,
      student.data_nascimento,
      student.email,
      student.telefone,
      student.cep,
      student.endereco,
      student.numero,
      student.complemento,
      student.bairro,
      student.cidade,
      student.uf,
      student.responsavel_nome,
      student.responsavel_cpf,
      student.responsavel_parentesco,
      student.responsavel_telefone,
      class.id as turma_id,
      class.nome as turma_nome,
      class.codigo as turma_codigo,
      class.turno as turma_turno,
      class.data_inicio,
      class.data_previsao_termino,
      class.qtd_parcelas,
      class.valor_matricula,
      class.valor_rematricula,
      class.valor_parcela,
      class.dia_vencimento_padrao,
      class.desconto_pontualidade,
      class.juros_atraso,
      class.multa_atraso,
      class.multa_atraso_percentual,
      course.nome as curso_nome,
      upper(course.modalidade) as modalidade,
      course.carga_horaria,
      pole.nome as polo_nome,
      pole.cnpj as polo_cnpj,
      pole.watermark_url as polo_watermark_url,
      pole.watermark_opacity as polo_watermark_opacity,
      pole.logo_url as polo_logo_url
    from public.matriculas enrollment
    join public.parceiros student on student.id = enrollment.aluno_id
    join public.turmas class on class.id = enrollment.turma_id
    join public.cursos course on course.id = class.curso_id
    join public.polos pole on pole.id = class.polo_id
    where enrollment.id = any(v_ids)
    order by student.nome, enrollment.id
  loop
    select model.*
    into v_model
    from public.documentos_modelos_configuracoes model
    where model.template_key = 'contrato_aluno'
      and model.modalidade = v_target.modalidade
    for share;

    if not found or v_model.status <> 'ATIVO' then
      raise exception 'O modelo de contrato da modalidade % ainda não está ativo para emissão.',
        v_target.modalidade using errcode = '55000';
    end if;

    v_qr_enabled := lower(coalesce(v_model.conteudo #>> '{qr,habilitado}', 'true')) <> 'false';
    v_validity_days := case
      when v_qr_enabled
        and coalesce(v_model.conteudo #>> '{qr,modoValidade}', 'SEM_VENCIMENTO') = 'POR_DIAS'
        then (v_model.conteudo #>> '{qr,diasValidade}')::integer
      else null
    end;
    v_validity := case
      when v_validity_days is null then null
      else now() + make_interval(days => v_validity_days)
    end;

    v_reference := format(
      'contrato:%s:%s:%s',
      v_model.revisao,
      p_idempotency_key,
      v_target.matricula_id
    );

    select issued.*
    into v_issued
    from public.emitir_documento_validacao_portal(
      'contrato_aluno',
      v_target.matricula_id,
      null,
      v_reference,
      null,
      null,
      false
    ) issued;

    -- A validade vem do modelo versionado, já validado pela RPC de modelos;
    -- nunca de um valor informado pela tela de emissão.
    update public.documentos_validacao validation
    set validade_ate = v_validity,
        updated_at = now()
    where validation.codigo = v_issued.codigo
      and validation.documento = 'contrato_aluno';

    v_snapshot := jsonb_strip_nulls(jsonb_build_object(
      'aluno', jsonb_build_object(
        'id', v_target.aluno_id,
        'nome', v_target.aluno_nome,
        'nomeSocial', v_target.nome_social,
        'cpf', v_target.cpf_cnpj,
        'rg', v_target.rg,
        'orgaoExpedidor', v_target.orgao_emissor,
        'nascimento', v_target.data_nascimento,
        'nascimentoExibicao', case when v_target.data_nascimento is null then null else to_char(v_target.data_nascimento, 'DD/MM/YYYY') end,
        'email', v_target.email,
        'telefone', v_target.telefone,
        'endereco', jsonb_build_object(
          'cep', v_target.cep,
          'logradouro', v_target.endereco,
          'numero', v_target.numero,
          'complemento', v_target.complemento,
          'bairro', v_target.bairro,
          'cidade', v_target.cidade,
          'uf', v_target.uf
        ),
        'responsavel', jsonb_build_object(
          'nome', v_target.responsavel_nome,
          'cpf', v_target.responsavel_cpf,
          'parentesco', v_target.responsavel_parentesco,
          'telefone', v_target.responsavel_telefone
        )
      ),
      'curso', jsonb_build_object(
        'nome', v_target.curso_nome,
        'modalidade', v_target.modalidade,
        'cargaHoraria', v_target.carga_horaria
      ),
      'turma', jsonb_build_object(
        'id', v_target.turma_id,
        'nome', v_target.turma_nome,
        'codigo', v_target.turma_codigo,
        'turno', v_target.turma_turno,
        'inicio', v_target.data_inicio,
        'inicioExibicao', case when v_target.data_inicio is null then null else to_char(v_target.data_inicio, 'DD/MM/YYYY') end,
        'previsaoTermino', v_target.data_previsao_termino,
        'previsaoTerminoExibicao', case when v_target.data_previsao_termino is null then null else to_char(v_target.data_previsao_termino, 'DD/MM/YYYY') end,
        'matriculaEm', v_target.data_matricula
      ),
      'instituicao', jsonb_build_object(
        'nome', v_target.polo_nome,
        'cnpj', v_target.polo_cnpj,
        'poloId', p_polo_id,
        'logoUrl', v_target.polo_logo_url
      ),
      'marcaDagua', jsonb_build_object(
        'url', v_target.polo_watermark_url,
        'opacidade', v_target.polo_watermark_opacity,
        'texto', v_target.polo_nome
      ),
      'financeiro', jsonb_build_object(
        'valorMatricula', coalesce(v_target.valor_matricula_individual, v_target.valor_matricula),
        'valorMatriculaExibicao', public.formatar_valor_brl_documento(coalesce(v_target.valor_matricula_individual, v_target.valor_matricula)),
        'valorRematricula', coalesce(v_target.valor_rematricula_individual, v_target.valor_rematricula),
        'valorRematriculaExibicao', public.formatar_valor_brl_documento(coalesce(v_target.valor_rematricula_individual, v_target.valor_rematricula)),
        'valorParcela', coalesce(v_target.valor_parcela_individual, v_target.valor_parcela),
        'valorParcelaExibicao', public.formatar_valor_brl_documento(coalesce(v_target.valor_parcela_individual, v_target.valor_parcela)),
        'quantidadeParcelas', v_target.qtd_parcelas,
        'diaVencimento', coalesce(v_target.dia_vencimento_individual, v_target.dia_vencimento_padrao),
        'primeiroVencimento', v_target.data_primeiro_vencimento_financeiro,
        'primeiroVencimentoExibicao', case when v_target.data_primeiro_vencimento_financeiro is null then null else to_char(v_target.data_primeiro_vencimento_financeiro, 'DD/MM/YYYY') end,
        'descontoPontualidade', coalesce(v_target.desconto_pontualidade_individual, v_target.desconto_pontualidade),
        'descontoPontualidadeExibicao', public.formatar_valor_brl_documento(coalesce(v_target.desconto_pontualidade_individual, v_target.desconto_pontualidade)),
        'jurosAtraso', coalesce(v_target.juros_atraso_individual, v_target.juros_atraso),
        'jurosAtrasoExibicao', public.formatar_valor_brl_documento(coalesce(v_target.juros_atraso_individual, v_target.juros_atraso)),
        'multaAtraso', coalesce(v_target.multa_atraso_individual, v_target.multa_atraso),
        'multaAtrasoExibicao', public.formatar_valor_brl_documento(coalesce(v_target.multa_atraso_individual, v_target.multa_atraso)),
        'multaAtrasoPercentual', coalesce(v_target.multa_atraso_percentual_individual, v_target.multa_atraso_percentual),
        'titulos', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'descricao', receivable.descricao,
              'valor', receivable.valor,
              'vencimento', receivable.data_vencimento,
              'parcelaNumero', receivable.parcela_numero,
              'status', receivable.status
            ) order by receivable.data_vencimento, receivable.parcela_numero, receivable.id
          )
          from public.contas_receber receivable
          where receivable.matricula_id = v_target.matricula_id
        ), '[]'::jsonb)
      ),
      'mensagemPersonalizada', v_message,
      'emissao', jsonb_build_object(
        'dataExibicao', to_char(clock_timestamp(), 'DD/MM/YYYY')
      ),
      'validacao', jsonb_build_object(
        'codigo', v_issued.codigo,
        'validade', v_validity,
        'validadeExibicao', case when v_validity is null then 'Sem vencimento' else to_char(v_validity, 'DD/MM/YYYY') end,
        'emitidoEm', v_issued.emitido_em
      )
    ));

    v_rendered := public.renderizar_contrato_aluno_documento(
      v_model.conteudo,
      v_snapshot,
      v_issued.codigo,
      v_validity
    );

    update public.documentos_validacao validation
    set dados_emissao = jsonb_build_object(
      'templateKey', v_model.template_key,
      'templateRevision', v_model.revisao,
      'templateSnapshot', v_model.conteudo,
      'contractSnapshot', v_snapshot,
      'renderedDocument', v_rendered
    )
    where validation.codigo = v_issued.codigo
      and validation.documento = 'contrato_aluno';

    v_documents := v_documents || jsonb_build_array(jsonb_build_object(
      'emission_id', v_issued.codigo,
      'target_name', v_target.aluno_nome,
      'validation_code', v_issued.codigo,
      'validation_url', '/validador?code=' || v_issued.codigo,
      'valid_until', v_validity,
      'file_url', null,
      'status_label', 'Contrato preparado',
      'render_payload', jsonb_build_object(
        'template', v_model.conteudo,
        'template_revision', v_model.revisao,
        'snapshot', v_snapshot,
        'rendered', v_rendered
      )
    ));
  end loop;

  v_response := jsonb_build_object(
    'documents', v_documents,
    'summary', jsonb_build_object('total', jsonb_array_length(v_documents), 'mode', v_mode),
    'generated_at', clock_timestamp()
  );

  insert into public.secretaria_documentos_emissao_requisicoes (
    request_id, tipo, fingerprint, resposta
  ) values (
    p_idempotency_key, 'CONTRATO_ALUNO', v_fingerprint, v_response
  );

  return v_response;
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
begin
  if not public.can_manage_secretaria_document('carteirinha_preceptor', p_polo_id) then
    raise exception 'Acesso às carteirinhas de preceptor não autorizado.'
      using errcode = '42501';
  end if;

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
        'elegivel', true,
        'mensagem_elegibilidade', null,
        'status_label', 'Professor ativo no polo'
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
  v_message text := nullif(btrim(coalesce(p_mensagem_personalizada, '')), '');
  v_ids uuid[];
  v_expected_count integer;
  v_found_count integer;
  v_fingerprint text;
  v_replay public.secretaria_documentos_emissao_requisicoes%rowtype;
  v_model public.documentos_modelos_configuracoes%rowtype;
  v_policy public.documentos_validacao_politicas%rowtype;
  v_target record;
  v_credential public.documentos_validacao_preceptores%rowtype;
  v_credential_found boolean := false;
  v_code text;
  v_validity timestamptz;
  v_validity_days integer;
  v_qr_enabled boolean;
  v_documents jsonb := '[]'::jsonb;
  v_response jsonb;
  v_public_snapshot jsonb;
  v_emission_snapshot jsonb;
  v_rendered jsonb;
begin
  if not public.can_manage_secretaria_document('carteirinha_preceptor', p_polo_id) then
    raise exception 'Acesso à emissão de carteirinha de preceptor não autorizado.'
      using errcode = '42501';
  end if;

  if p_idempotency_key is null then
    raise exception 'Informe a chave de idempotência da emissão.' using errcode = '22023';
  end if;

  if v_mode not in ('INDIVIDUAL', 'LOTE', 'PERSONALIZADO') then
    raise exception 'Modo de emissão inválido.' using errcode = '22023';
  end if;

  if char_length(coalesce(v_message, '')) > 2000 then
    raise exception 'A mensagem personalizada deve ter no máximo 2000 caracteres.'
      using errcode = '22023';
  end if;

  select array_agg(distinct item order by item)
  into v_ids
  from unnest(coalesce(p_professor_ids, array[]::uuid[])) item
  where item is not null;

  v_expected_count := coalesce(cardinality(v_ids), 0);
  if v_expected_count = 0 or v_expected_count > 100 then
    raise exception 'Selecione entre 1 e 100 professores para a emissão.'
      using errcode = '22023';
  end if;

  if v_mode = 'INDIVIDUAL' and v_expected_count <> 1 then
    raise exception 'A emissão individual exige exatamente um professor.'
      using errcode = '22023';
  end if;

  v_fingerprint := md5(
    p_polo_id::text || '|' || v_mode || '|' || coalesce(v_message, '') || '|'
    || array_to_string(v_ids::text[], ',')
  );

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_idempotency_key::text));

  select replay.*
  into v_replay
  from public.secretaria_documentos_emissao_requisicoes replay
  where replay.request_id = p_idempotency_key;

  if found then
    if v_replay.tipo <> 'CARTEIRINHA_PRECEPTOR' or v_replay.fingerprint <> v_fingerprint then
      raise exception 'A chave de idempotência já foi usada com outra emissão.'
        using errcode = '22023';
    end if;
    return v_replay.resposta;
  end if;

  select model.*
  into v_model
  from public.documentos_modelos_configuracoes model
  where model.template_key = 'carteirinha_preceptor'
    and model.modalidade = 'GERAL'
  for share;

  if not found or v_model.status <> 'ATIVO' then
    raise exception 'O modelo de carteirinha de preceptor não está ativo.'
      using errcode = '55000';
  end if;

  select policy.*
  into v_policy
  from public.documentos_validacao_politicas policy
  where policy.documento = 'carteirinha_preceptor'
  for share;

  if not found then
    raise exception 'A política da carteirinha de preceptor não está configurada.'
      using errcode = '55000';
  end if;

  select count(*)
  into v_found_count
  from public.parceiros professor
  where professor.id = any(v_ids)
    and upper(coalesce(professor.tipo, '')) = 'PROFESSOR'
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

  if v_found_count <> v_expected_count then
    raise exception 'Há professor inativo, fora do polo ou não elegível para a carteirinha.'
      using errcode = '42501';
  end if;

  for v_target in
    select
      professor.*,
      pole.nome as polo_nome,
      pole.cnpj as polo_cnpj,
      pole.watermark_url as polo_watermark_url,
      pole.watermark_opacity as polo_watermark_opacity,
      pole.logo_url as polo_logo_url
    from public.parceiros professor
    join public.polos pole on pole.id = p_polo_id
    where professor.id = any(v_ids)
    order by professor.nome, professor.id
  loop
    select credential.*
    into v_credential
    from public.documentos_validacao_preceptores credential
    where credential.identidade = format('carteirinha_preceptor:%s:%s', v_target.id, p_polo_id)
    for update;

    v_credential_found := found;

    v_qr_enabled := lower(coalesce(v_model.conteudo #>> '{qr,habilitado}', 'true')) <> 'false';
    v_validity_days := case
      when v_qr_enabled
        and coalesce(v_model.conteudo #>> '{qr,modoValidade}', 'POR_DIAS') = 'POR_DIAS'
        then (v_model.conteudo #>> '{qr,diasValidade}')::integer
      else null
    end;

    v_validity := case
      when v_validity_days is null then null
      else now() + make_interval(days => v_validity_days)
    end;

    if not v_credential_found then
      loop
        v_code := v_policy.prefixo || '-' ||
          upper(substring(encode(extensions.gen_random_bytes(9), 'hex') from 1 for 4)) || '-' ||
          upper(substring(encode(extensions.gen_random_bytes(9), 'hex') from 1 for 4)) || '-' ||
          upper(substring(encode(extensions.gen_random_bytes(9), 'hex') from 1 for 4));
        exit when not exists (
          select 1 from public.documentos_validacao validation where validation.codigo = v_code
        ) and not exists (
          select 1 from public.documentos_validacao_preceptores credential where credential.codigo = v_code
        );
      end loop;
    end if;

    v_public_snapshot := public.filtrar_dados_publicos_validacao(
      jsonb_build_object(
        'studentName', public.mascarar_nome_validacao_publica(v_target.nome),
        'institutionName', v_target.polo_nome,
        'institutionCnpj', public.formatar_cnpj_validacao_publica(v_target.polo_cnpj),
        'unitName', v_target.polo_nome,
        'issuedAt', now(),
        'lastIssuedAt', now(),
        'expiresAt', v_validity,
        'issueCount', coalesce(v_credential.quantidade_emissoes, 0) + 1
      ),
      v_policy.campos_publicos
    );

    v_emission_snapshot := jsonb_strip_nulls(jsonb_build_object(
      'preceptor', jsonb_build_object(
        'id', v_target.id,
        'nome', v_target.nome,
        'email', v_target.email,
        'telefone', v_target.telefone,
        'fotoUrl', v_target.foto_url,
        'titulacao', v_target.titulacao,
        'areaFormacao', v_target.area_formacao,
        'registroProfissional', v_target.registro_profissional,
        'numeroRegistro', v_target.numero_registro
      ),
      'instituicao', jsonb_build_object(
        'poloId', p_polo_id,
        'nome', v_target.polo_nome,
        'cnpj', v_target.polo_cnpj,
        'logoUrl', v_target.polo_logo_url
      ),
      'marcaDagua', jsonb_build_object(
        'url', v_target.polo_watermark_url,
        'opacidade', v_target.polo_watermark_opacity,
        'texto', v_target.polo_nome
      ),
      'mensagemPersonalizada', v_message,
      'validacao', jsonb_build_object(
        'codigo', coalesce(v_credential.codigo, v_code),
        'validade', v_validity,
        'validadeExibicao', case when v_validity is null then 'Sem vencimento' else to_char(v_validity, 'DD/MM/YYYY') end
      )
    ));

    if v_credential_found then
      if v_credential.status = 'REVOGADO' then
        raise exception 'A credencial de % está revogada e não pode ser reemitida.', v_target.nome
          using errcode = '55000';
      end if;

      update public.documentos_validacao_preceptores credential
      set
        ultima_emissao_em = now(),
        validade_ate = v_validity,
        emitido_por = (select auth.uid()),
        quantidade_emissoes = credential.quantidade_emissoes + 1,
        template_revisao = v_model.revisao,
        template_snapshot = v_model.conteudo,
        dados_emissao = v_emission_snapshot,
        dados_publicos_snapshot = v_public_snapshot,
        campos_publicos_emissao = v_policy.campos_publicos,
        politica_versao_emissao = v_policy.versao,
        validacao_publica = v_policy.validacao_publica,
        updated_at = now()
      where credential.id = v_credential.id
      returning credential.* into v_credential;
    else
      insert into public.documentos_validacao_preceptores (
        identidade, codigo, professor_id, polo_id, emitido_por, validade_ate,
        template_revisao, template_snapshot, dados_emissao,
        dados_publicos_snapshot, campos_publicos_emissao, politica_versao_emissao,
        validacao_publica
      ) values (
        format('carteirinha_preceptor:%s:%s', v_target.id, p_polo_id),
        v_code,
        v_target.id,
        p_polo_id,
        (select auth.uid()),
        v_validity,
        v_model.revisao,
        v_model.conteudo,
        v_emission_snapshot,
        v_public_snapshot,
        v_policy.campos_publicos,
        v_policy.versao,
        v_policy.validacao_publica
      )
      returning * into v_credential;
    end if;

    v_rendered := jsonb_build_object(
      'kind', 'CARTEIRINHA_PRECEPTOR',
      'watermark', jsonb_build_object(
        'enabled', lower(coalesce(v_model.conteudo ->> 'marcaDaguaHabilitada', 'true')) <> 'false',
        'label', v_target.polo_nome,
        'image_url', v_target.polo_watermark_url,
        'opacity', coalesce(v_target.polo_watermark_opacity, 0.08)
      ),
      'qr', jsonb_build_object(
        'enabled', v_qr_enabled,
        'label', coalesce(nullif(v_model.conteudo #>> '{qr,rotulo}', ''), 'Validar credencial'),
        'code', v_credential.codigo,
        'validation_url', '/validador?code=' || v_credential.codigo,
        'valid_until', v_credential.validade_ate
      ),
      'front', jsonb_build_object(
        'subtitle', coalesce(nullif(v_model.conteudo ->> 'subtituloFrente', ''), v_target.polo_nome),
        'title', coalesce(nullif(v_model.conteudo ->> 'tituloFrente', ''), 'PRECEPTOR(A)'),
        'holder_name', v_target.nome,
        'role', 'Preceptor(a)',
        'area', coalesce(v_target.area_formacao, v_target.especialidade),
        'institution', v_target.polo_nome,
        'photo_url', case when lower(coalesce(v_model.conteudo ->> 'mostrarFoto', 'true')) <> 'false' then v_target.foto_url else null end,
        'logo_url', v_target.polo_logo_url
      ),
      'back', jsonb_build_object(
        'message', coalesce(nullif(v_model.conteudo ->> 'mensagemVerso', ''), 'Credencial institucional de uso pessoal e intransferível.'),
        'footer', coalesce(nullif(v_model.conteudo ->> 'rodape', ''), 'Documento institucional'),
        'validity_label', case when v_credential.validade_ate is null then 'Sem vencimento' else to_char(v_credential.validade_ate, 'DD/MM/YYYY') end
      )
    );

    update public.documentos_validacao_preceptores credential
    set dados_emissao = credential.dados_emissao || jsonb_build_object(
      'renderedDocument', v_rendered
    ),
    updated_at = now()
    where credential.id = v_credential.id
    returning credential.* into v_credential;

    v_documents := v_documents || jsonb_build_array(jsonb_build_object(
      'emission_id', v_credential.id,
      'target_name', v_target.nome,
      'validation_code', v_credential.codigo,
      'validation_url', '/validador?code=' || v_credential.codigo,
      'valid_until', v_credential.validade_ate,
      'file_url', null,
      'status_label', 'Carteirinha preparada',
      'render_payload', jsonb_build_object(
        'template', v_credential.template_snapshot,
        'template_revision', v_credential.template_revisao,
        'snapshot', v_credential.dados_emissao,
        'rendered', v_rendered
      )
    ));
  end loop;

  v_response := jsonb_build_object(
    'documents', v_documents,
    'summary', jsonb_build_object('total', jsonb_array_length(v_documents), 'mode', v_mode),
    'generated_at', clock_timestamp()
  );

  insert into public.secretaria_documentos_emissao_requisicoes (
    request_id, tipo, fingerprint, resposta
  ) values (
    p_idempotency_key, 'CARTEIRINHA_PRECEPTOR', v_fingerprint, v_response
  );

  return v_response;
end;
$function$;

revoke all on function public.get_secretaria_contratos_aluno_workspace_secure(uuid)
  from public, anon;
revoke all on function public.preparar_emissao_contrato_aluno_secure(uuid, text, uuid[], text, uuid)
  from public, anon;
revoke all on function public.get_secretaria_carteirinhas_preceptor_workspace_secure(uuid)
  from public, anon;
revoke all on function public.preparar_emissao_carteirinha_preceptor_secure(uuid, text, uuid[], text, uuid)
  from public, anon;
grant execute on function public.get_secretaria_contratos_aluno_workspace_secure(uuid)
  to authenticated, service_role;
grant execute on function public.preparar_emissao_contrato_aluno_secure(uuid, text, uuid[], text, uuid)
  to authenticated, service_role;
grant execute on function public.get_secretaria_carteirinhas_preceptor_workspace_secure(uuid)
  to authenticated, service_role;
grant execute on function public.preparar_emissao_carteirinha_preceptor_secure(uuid, text, uuid[], text, uuid)
  to authenticated, service_role;

-- -------------------------------------------------------------------------
-- Calendário de aulas: filtros e payload canônico para exportação
-- -------------------------------------------------------------------------

create or replace function public.can_manage_calendario_aulas(p_polo_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce((select auth.role()), '') = 'service_role'
    or (
      public.gestor_has_module('calendario')
      and public.is_gestor_for_polo(p_polo_id)
    );
$function$;

revoke all on function public.can_manage_calendario_aulas(uuid)
  from public, anon, authenticated;

create or replace function public.listar_turmas_calendario_aulas_secure(
  p_polo_id uuid,
  p_modalidade text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_modalidade text := upper(btrim(coalesce(p_modalidade, '')));
begin
  if not public.can_manage_calendario_aulas(p_polo_id) then
    raise exception 'Acesso ao calendário do polo não autorizado.' using errcode = '42501';
  end if;

  if v_modalidade not in ('TECNICO', 'LIVRE', 'SUPERIOR', 'EAD') then
    raise exception 'Modalidade de calendário inválida.' using errcode = '22023';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'turma_id', class.id,
        'turma_nome', class.nome,
        'turma_codigo', class.codigo,
        'curso_nome', course.nome,
        'modalidade', upper(course.modalidade)
      ) order by course.nome, class.nome
    )
    from public.turmas class
    join public.cursos course on course.id = class.curso_id
    where class.polo_id = p_polo_id
      and upper(coalesce(course.modalidade, '')) = v_modalidade
      and upper(coalesce(class.status, '')) not in ('CANCELADA', 'CANCELADO')
  ), '[]'::jsonb);
end;
$function$;

create or replace function public.preparar_calendario_aulas_exportacao_secure(
  p_polo_id uuid,
  p_modalidade text,
  p_turma_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_modalidade text := upper(btrim(coalesce(p_modalidade, '')));
  v_turma record;
  v_model public.documentos_modelos_configuracoes%rowtype;
  v_linhas jsonb;
  v_modulos text;
  v_status text;
  v_mensagem text;
begin
  if not public.can_manage_calendario_aulas(p_polo_id) then
    raise exception 'Acesso ao calendário do polo não autorizado.' using errcode = '42501';
  end if;

  if v_modalidade not in ('TECNICO', 'LIVRE', 'SUPERIOR', 'EAD') then
    raise exception 'Modalidade de calendário inválida.' using errcode = '22023';
  end if;

  select
    class.id as turma_id,
    class.nome as turma_nome,
    class.codigo as turma_codigo,
    course.nome as curso_nome,
    upper(course.modalidade) as modalidade,
    pole.nome as polo_nome,
    pole.watermark_url,
    pole.logo_url,
    pole.watermark_opacity
  into v_turma
  from public.turmas class
  join public.cursos course on course.id = class.curso_id
  join public.polos pole on pole.id = class.polo_id
  where class.id = p_turma_id
    and class.polo_id = p_polo_id
    and upper(coalesce(course.modalidade, '')) = v_modalidade;

  if not found then
    raise exception 'Turma incompatível com o polo ou a modalidade selecionada.'
      using errcode = '42501';
  end if;

  select model.*
  into v_model
  from public.documentos_modelos_configuracoes model
  where model.template_key = 'calendario_aulas'
    and model.modalidade in (v_modalidade, 'GERAL')
  order by case when model.modalidade = v_modalidade then 0 else 1 end
  limit 1
  for share;

  if not found or v_model.status <> 'ATIVO' then
    raise exception 'O modelo de calendário desta modalidade não está ativo.'
      using errcode = '55000';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'componente_curricular', calendar_line.componente_curricular,
        'data_exibicao', to_char(calendar_line.data_aula, 'DD/MM/YY'),
        'horario_exibicao', case
          when calendar_line.tem_horario
            then to_char(calendar_line.hora_inicio, 'HH24:MI') || ' – ' || to_char(calendar_line.hora_fim, 'HH24:MI')
          else coalesce(nullif(v_model.conteudo ->> 'observacaoSemHorario', ''), 'Horário não informado')
        end,
        'professores_observacao', calendar_line.professores_observacao
      ) order by
        calendar_line.data_aula,
        calendar_line.modulo_ordem,
        calendar_line.disciplina_ordem,
        calendar_line.hora_inicio nulls last,
        calendar_line.componente_curricular
    ),
    '[]'::jsonb
  )
  into v_linhas
  from (
    select
      subject.nome as componente_curricular,
      class_meeting.data_aula,
      min(class_meeting.hora_inicio) as hora_inicio,
      max(class_meeting.hora_fim) as hora_fim,
      bool_and(class_meeting.hora_inicio is not null and class_meeting.hora_fim is not null) as tem_horario,
      coalesce(module.ordem, 999999) as modulo_ordem,
      coalesce(subject.ordem, 999999) as disciplina_ordem,
      concat_ws(E'\n',
        coalesce(nullif(teacher.nome, ''), nullif(class_subject.professor_nome, ''), 'Professor não informado'),
        nullif(string_agg(distinct nullif(btrim(class_meeting.titulo), ''), E'\n' order by nullif(btrim(class_meeting.titulo), '')), '')
      ) as professores_observacao
    from public.aulas_turma class_meeting
    join public.disciplinas subject on subject.id = class_meeting.disciplina_id
    left join public.modulos module on module.id = subject.modulo_id
    left join public.turmas_disciplinas class_subject
      on class_subject.turma_id = class_meeting.turma_id
      and class_subject.disciplina_id = class_meeting.disciplina_id
    left join public.parceiros teacher on teacher.id = class_subject.professor_id
    where class_meeting.turma_id = p_turma_id
      and class_meeting.data_aula is not null
    group by
      subject.nome,
      class_meeting.data_aula,
      module.ordem,
      subject.ordem,
      teacher.nome,
      class_subject.professor_nome
  ) calendar_line;

  select nullif(string_agg(distinct module.nome, ' • ' order by module.nome), '')
  into v_modulos
  from public.aulas_turma class_meeting
  join public.disciplinas subject on subject.id = class_meeting.disciplina_id
  left join public.modulos module on module.id = subject.modulo_id
  where class_meeting.turma_id = p_turma_id
    and class_meeting.data_aula is not null;

  if jsonb_array_length(v_linhas) > 0 then
    v_status := 'PRONTO';
    v_mensagem := null;
  elsif v_modalidade = 'EAD' then
    v_status := 'EAD_SEM_GRADE';
    v_mensagem := 'Esta turma EAD não possui aulas datadas publicadas na grade presencial.';
  else
    v_status := 'SEM_GRADE';
    v_mensagem := 'Não há encontros datados publicados para esta turma.';
  end if;

  return jsonb_build_object(
    'status', v_status,
    'mensagem', v_mensagem,
    'documento', jsonb_build_object(
      'titulo', coalesce(nullif(v_model.conteudo ->> 'title', ''), 'Calendário de Aulas'),
      'subtitulo', replace(
        replace(
          replace(coalesce(nullif(v_model.conteudo ->> 'subtitulo', ''), '{{CURSO}} · {{TURMA}}'),
            '{{CURSO}}', v_turma.curso_nome
          ),
          '{{TURMA}}', concat_ws(' — ', v_turma.turma_nome, nullif(v_turma.turma_codigo, ''))
        ),
        '{{MODULO}}', coalesce(v_modulos, '')
      ),
      'rodape', coalesce(nullif(v_model.conteudo ->> 'rodape', ''), 'Calendário gerado eletronicamente pela Universo Cursos e Consultoria.'),
      -- O contrato público da exportação é estável em snake_case; o editor
      -- persiste camelCase apenas como detalhe de interface.
      'cabecalhos_tabela', jsonb_build_object(
        'componente', coalesce(
          nullif(v_model.conteudo #>> '{cabecalhosTabela,componente}', ''),
          'Componente curricular'
        ),
        'data', coalesce(
          nullif(v_model.conteudo #>> '{cabecalhosTabela,data}', ''),
          'Data'
        ),
        'horario', coalesce(
          nullif(v_model.conteudo #>> '{cabecalhosTabela,horario}', ''),
          'Horário'
        ),
        'professor_observacao', coalesce(
          nullif(v_model.conteudo #>> '{cabecalhosTabela,professorObservacao}', ''),
          'Professor(es) / observação'
        )
      ),
      'exibir_marca_dagua', lower(coalesce(v_model.conteudo ->> 'exibirMarcaDagua', 'true')) <> 'false',
      'exibir_modulo', lower(coalesce(v_model.conteudo ->> 'exibirModulo', 'true')) <> 'false',
      'instituicao', v_turma.polo_nome,
      'polo', v_turma.polo_nome,
      'curso', v_turma.curso_nome,
      'turma', concat_ws(' — ', v_turma.turma_nome, nullif(v_turma.turma_codigo, '')),
      'modulo', v_modulos,
      'marca_dagua_texto', coalesce(
        nullif(v_model.conteudo ->> 'watermarkText', ''),
        v_turma.polo_nome
      ),
      -- O exportador cliente não consulta URLs externas. Apenas ativos já
      -- incorporados são entregues para o PDF; os demais usam o fallback
      -- textual institucional canônico.
      'marca_dagua_data_uri', case
        when v_turma.watermark_url like 'data:image/%' then v_turma.watermark_url
        else null
      end,
      'logo_data_uri', case
        when v_turma.logo_url like 'data:image/%' then v_turma.logo_url
        else null
      end,
      'marca_dagua_opacidade', v_turma.watermark_opacity,
      'arquivo_nome', lower(regexp_replace(
        'calendario-' || coalesce(v_turma.turma_codigo, v_turma.turma_nome),
        '[^a-zA-Z0-9]+', '-', 'g'
      )) || '.pdf',
      'emitido_em', to_char(clock_timestamp(), 'DD/MM/YYYY HH24:MI'),
      'template_revision', v_model.revisao,
      'template', v_model.conteudo
    ),
    'linhas', v_linhas
  );
end;
$function$;

revoke all on function public.listar_turmas_calendario_aulas_secure(uuid, text)
  from public, anon;
revoke all on function public.preparar_calendario_aulas_exportacao_secure(uuid, text, uuid)
  from public, anon;
grant execute on function public.listar_turmas_calendario_aulas_secure(uuid, text)
  to authenticated, service_role;
grant execute on function public.preparar_calendario_aulas_exportacao_secure(uuid, text, uuid)
  to authenticated, service_role;

-- -------------------------------------------------------------------------
-- Modelos iniciais. A fonte DOCX original é preservada no repositório; o
-- conteúdo técnico abaixo é a versão editável inicial, sem PII de aluno.
-- -------------------------------------------------------------------------

insert into public.documentos_modelos_configuracoes (
  template_key, modalidade, revisao, status, conteudo
)
values
  (
    'contrato_aluno',
    'TECNICO',
    1,
    'ATIVO',
    jsonb_build_object(
      'tituloDocumento', 'Contrato de Prestação de Serviços Educacionais',
      'cabecalho', 'UNIVERSO CURSOS E CONSULTORIA',
      'corpo', $minuta$
ALUNO: {{aluno.nome}}
Data de Nascimento: {{aluno.nascimento}}
CPF: {{aluno.cpf}}    RG: {{aluno.rg}}   Órgão Expedidor: {{aluno.orgaoExpedidor}}
Endereço: {{aluno.endereco.logradouro}}, {{aluno.endereco.numero}}, CEP: {{aluno.endereco.cep}}, {{aluno.endereco.cidade}}/{{aluno.endereco.uf}}.
Contato: {{aluno.telefone}}

CONTRATANTE: {{aluno.responsavel.nome}}
CPF: {{aluno.responsavel.cpf}}
Contato: {{aluno.responsavel.telefone}}

CONTRATADA {{instituicao.nome}}, CNPJ: {{instituicao.cnpj}}, neste ato representada na forma de seus atos societários.

OBJETO DO PRESENTE INSTRUMENTO:
O presente instrumento tem como objeto principal a prestação de serviços de educação de nível médio técnico e especializações técnicas por meio do curso técnico em {{curso.nome}}, que visa o desenvolvimento harmônico das faculdades físicas, intelectuais e morais do educando, através de ministração de aulas e demais atividades escolares, respeitando os termos do regimento escolar, plano e projeto pedagógico do curso, levando-se em conta a natureza do conteúdo programático e da técnica pedagógica que se fizerem necessárias, em consonância com as legislações vigentes.

CLÁUSULA 1ª – O presente contrato é celebrado sob a égide do artigo 209 da Constituição Federal, e demais leis infraconstitucionais vigentes relacionadas ao Sistema Nacional de Educação, bem como ao Código de Defesa do Consumidor.
CLÁUSULA 2ª – A CONTRATADA se compromete, através de plano escolar, estudos programados e calendário curricular na forma da legislação vigente, a ministrar ensino por meios de aulas e demais atividades escolares em prol da CONTRATANTE, buscando sempre o atendimento das necessidades, interesses específicos do educando nos aspectos informativos e formativos.
CLÁUSULA 3ª – As aulas serão ministradas em salas de aula nas instalações da CONTRATADA ou em outros locais indicados por essa, podendo ser prestadas de forma presencial, telepresencial, remota ou mediante sistema híbrido, respeitadas as normas acadêmicas aplicáveis.
CLÁUSULA 4ª – A CONTRATADA se responsabiliza pelo planejamento e pela prestação dos serviços de ensino, no que se refere à fixação de carga horária, designação de professores, orientação didático-pedagógica e educacional, agendamento de provas, além de outras providências que as atividades docentes exigirem, obedecendo ao seu exclusivo critério, sem qualquer ingerência do CONTRATANTE.
CLÁUSULA 5ª – O CONTRATANTE requer a sua matrícula no curso {{curso.nome}}, com início previsto em {{turma.inicio}}, duração e carga horária definidas no projeto pedagógico e na turma {{turma.nome}}.
I - A matrícula não será autorizada caso o CONTRATANTE não esteja quitado ou quite integralmente os débitos não pagos no momento da assinatura deste, seja de qual natureza for, perante a CONTRATADA.
II - Será indeferida a matrícula caso não seja pago o valor referente à matrícula indicado na cláusula financeira, ou ainda caso não sejam entregues pelo CONTRATANTE todos os documentos determinados pela CONTRATADA no prazo fixado.
III - A CONTRATADA reserva-se o direito de cancelar o presente instrumento caso não haja o número mínimo de matrículas por turma, assegurando ao CONTRATANTE a devolução do valor pago a título de matrícula, conforme condições institucionais aplicáveis.
IV - As datas para realização de rematrícula serão divulgadas pela CONTRATADA nos períodos acadêmicos pertinentes.

PARÁGRAFO 1º - O CONTRATANTE, face ao deferimento da matrícula, compromete-se a aceitar integralmente o regimento interno da CONTRATADA, que passa a fazer parte integrante deste pacto, declarando estar ciente e de acordo com as normas e penalidades aplicáveis.
PARÁGRAFO 2º - O CONTRATANTE declara estar ciente das necessidades de atividades extracurriculares, estágios e outros exercícios pedagógicos que possam ser realizados fora das dependências da CONTRATADA, respeitadas as normas vigentes e as condições do curso contratado.
PARÁGRAFO 3º - Os estágios curriculares, quando previstos no projeto pedagógico do curso, serão realizados em organizações públicas e/ou privadas nos termos das regras acadêmicas, legais e institucionais aplicáveis.
I - O CONTRATANTE compromete-se a comparecer ao local previamente designado, respeitando a carga horária estabelecida conforme plano de ensino referente ao curso contratado, no horário de aula ou fora dele, inclusive em finais de semana e feriados quando legalmente aplicável, para realização do estágio curricular e demais atividades devidamente designadas.
II - Os custos operacionais referentes à realização do estágio e/ou demais atividades extracurriculares observarão as condições informadas pela CONTRATADA e a legislação vigente.
III - O CONTRATANTE que optar por curso da área de saúde compromete-se a cumprir as exigências documentais, de saúde, vacinação, seguro e identificação determinadas pela legislação e pelo regulamento acadêmico para realização de estágio.
IV - Quando exigidos pelas normas aplicáveis, vestuários e materiais necessários às atividades práticas e de estágio serão utilizados conforme padrão institucional e legal.
V - O CONTRATANTE resta ciente de que deverá cumprir a carga horária, frequência e demais requisitos obrigatórios previstos no plano do curso e na legislação vigente.
PARÁGRAFO 4º - Os estágios curriculares do curso de enfermagem serão acompanhados de preceptores designados pela CONTRATADA, conforme legislação vigente.
PARÁGRAFO 5º - Atividades extracurriculares, estágios e outros exercícios pedagógicos obrigatórios exigirão os registros acadêmicos pertinentes, observadas as regras de preenchimento e comprovação.
PARÁGRAFO 6º - O CONTRATANTE compromete-se a seguir rigorosamente as normas internas dos locais de estágio e atividades práticas autorizadas.
PARÁGRAFO 7º - A CONTRATADA não assume responsabilidade por vínculo de emprego decorrente de eventual desvio de finalidade de estágio, devendo o CONTRATANTE comunicar imediatamente qualquer situação irregular.
PARÁGRAFO 8º - Os registros de frequência, produtividade e desempenho no estágio serão preenchidos pelo supervisor competente, com os elementos exigidos pelas normas aplicáveis.
PARÁGRAFO 9º - Em situações legalmente autorizadas, a CONTRATADA poderá instituir aulas remotas, telepresenciais, videoconferências gravadas ou em tempo real e videoaulas, garantindo o tratamento acadêmico previsto pela legislação e pelos órgãos competentes.

CLÁUSULA 6ª – O CONTRATANTE, em contraprestação aos serviços de ensino prestados, compromete-se a pagar à CONTRATADA as condições financeiras canônicas registradas na matrícula e nos títulos emitidos:
I - Valor de matrícula: {{financeiro.valorMatricula}}.
II - Valor de rematrícula, quando aplicável: {{financeiro.valorRematricula}}.
III - Quantidade prevista de parcelas: {{financeiro.quantidadeParcelas}}; valor de parcela: {{financeiro.valorParcela}}; vencimento: {{financeiro.diaVencimento}}; primeiro vencimento: {{financeiro.primeiroVencimento}}.
IV - Desconto de pontualidade, juros, multa e demais condições: {{financeiro.condicoes}}.
PARÁGRAFO 1º - O pagamento será realizado pelos meios institucionais de cobrança disponibilizados pela CONTRATADA. Na hipótese de não recebimento do instrumento de cobrança antes do vencimento, é dever do CONTRATANTE solicitar segunda via e manter o cadastro atualizado junto à secretaria.
PARÁGRAFO 2º - Caso a data de vencimento ocorra em dia de não compensação bancária, observar-se-á o próximo dia útil e as regras de desconto aplicáveis.
PARÁGRAFO 3º - O não comparecimento do CONTRATANTE aos atos escolares não o exime dos pagamentos das prestações contratadas, desde que os serviços tenham sido disponibilizados.
PARÁGRAFO 4º - Em caso de desistência, cancelamento, suspensão, interrupção ou transferência, as condições de cobrança observarão o requerimento formal, a legislação vigente e as cláusulas aplicáveis deste instrumento.
PARÁGRAFO 5º - Serviços extraordinários, tais como viagens, excursões, locações, transporte, congressos, eventos técnicos, materiais, uniformes, alimentação, segundas chamadas e segundas vias, poderão não estar incluídos nas prestações ordinárias, conforme informado pela CONTRATADA.

CLÁUSULA 7ª - A CONTRATADA poderá conceder descontos a qualquer título, de forma individual ou coletiva, contínua ou sobre parcela específica, sem que isso caracterize novação ou obrigação de manutenção futura.
CLÁUSULA 8ª - Em caso de reprovação de componentes curriculares, o CONTRATANTE observará as regras acadêmicas e financeiras aplicáveis à reoferta, dependência ou reposição de carga horária.
CLÁUSULA 9ª - A CONTRATADA não se responsabiliza pela guarda de pertences e objetos trazidos pelo CONTRATANTE, seja nas dependências institucionais ou em atividades realizadas fora delas.
CLÁUSULA 10ª - A eventual ampliação da duração do curso ou reposição de componentes observará as condições acadêmicas e financeiras legalmente aplicáveis.
CLÁUSULA 11ª - No caso de inadimplemento, os encargos, multas, juros e procedimentos de cobrança observarão os valores e percentuais canônicos contratados, a legislação vigente e os instrumentos de cobrança emitidos.
CLÁUSULA 12ª - A CONTRATADA poderá utilizar meios administrativos e extrajudiciais legalmente cabíveis para cobrança de crédito em atraso, respeitada a legislação aplicável e a proteção de dados pessoais.
CLÁUSULA 13ª - Por ocasião do deferimento da matrícula ou rematrícula, o CONTRATANTE declarará, sob as penas da lei, suas condições de saúde e qualificação, quando exigíveis para o curso e para o atendimento educacional adequado.
CLÁUSULA 14ª - O material didático e os recursos necessários ao curso observarão a autonomia pedagógica e administrativa da CONTRATADA, bem como a legislação aplicável.
CLÁUSULA 15ª - A CONTRATADA poderá disponibilizar acervo bibliográfico e demais recursos acadêmicos conforme suas regras de uso e conservação.
CLÁUSULA 16ª - O uso de voz e imagem observará consentimento, finalidade e demais requisitos previstos na legislação de proteção de dados e nos instrumentos institucionais aplicáveis.
CLÁUSULA 17ª - O presente contrato é celebrado em caráter pessoal e intransferível, observadas as regras de renovação de matrícula e disciplina acadêmica.
CLÁUSULA 18ª - Será preservado o equilíbrio contratual caso mudança legislativa ou normativa altere a equação econômico-financeira do presente contrato.
CLÁUSULA 19ª - O presente contrato terá duração no período acadêmico e financeiro definido neste instrumento, podendo ser rescindido nos termos legais e contratuais aplicáveis.
CLÁUSULA 20ª - O CONTRATANTE responsabiliza-se civil e criminalmente pelos prejuízos decorrentes da apresentação de documentos ou informações falsas durante a vigência do contrato.
CLÁUSULA 21ª – Ao CONTRATANTE que cumprir integralmente os requisitos de aproveitamento e frequência exigidos para o curso contratado, a CONTRATADA emitirá o certificado de conclusão conforme padrão e prazos institucionais.
CLÁUSULA 22ª – O CONTRATANTE e a CONTRATADA comprometem-se a cumprir integralmente as disposições da Lei nº 13.709/2018 (Lei Geral de Proteção de Dados Pessoais), bem como demais normas legais e regulamentares aplicáveis à proteção de dados pessoais.
CLÁUSULA 23ª - Fica eleito o Foro da Comarca de Japoatã, Estado de Sergipe, com renúncia expressa de qualquer outro, por mais privilegiado que seja, para dirimir eventuais questões oriundas do presente instrumento.
CLÁUSULA 24ª - CONTRATADA e CONTRATANTE atribuem ao presente instrumento plena eficácia e força executiva extrajudicial, na forma da lei.
$minuta$,
      'rodape', 'Japoatã/SE, {{emissao.data}}.\n\nCONTRATANTE: ____________________________\nCONTRATADA: ____________________________\n\nTestemunhas: ____________________________\n____________________________',
      'observacaoEscopo', 'Modelo técnico inicialmente derivado da minuta institucional recebida em 07/08/2026. Revise juridicamente antes de mudar cláusulas.',
      'fonte', 'MINUTA_TECNICA',
      'marcaDagua', jsonb_build_object('habilitada', true, 'intensidade', 'SUAVE', 'origem', 'POLO_EMISSOR'),
      'qr', jsonb_build_object('habilitado', true, 'rotulo', 'Validar documento', 'caminhoValidacao', '/validador', 'modoValidade', 'SEM_VENCIMENTO', 'diasValidade', null),
      'sourceDocument', jsonb_build_object('filename', 'MINUTA - CONTRATOS ALUNOS 2.docx', 'sha256', 'b4df5b33631bd25411242f64f1dcaf3ea12bd03e4d8f5c3c21574fb2941a670e')
    )
  ),
  (
    'contrato_aluno',
    'LIVRE',
    1,
    'EM_REVISAO',
    jsonb_build_object(
      'tituloDocumento', 'Contrato de Prestação de Serviços Educacionais',
      'cabecalho', 'UNIVERSO CURSOS E CONSULTORIA',
      'corpo', 'Este modelo aguarda texto jurídico aprovado para Curso Livre. Nenhuma cláusula do contrato técnico foi adaptada automaticamente.',
      'rodape', 'Documento emitido eletronicamente pela Universo Cursos e Consultoria.',
      'observacaoEscopo', 'Revisão jurídica obrigatória antes da primeira emissão.',
      'fonte', 'AGUARDANDO_REVISAO_JURIDICA',
      'marcaDagua', jsonb_build_object('habilitada', true, 'intensidade', 'SUAVE', 'origem', 'POLO_EMISSOR'),
      'qr', jsonb_build_object('habilitado', true, 'rotulo', 'Validar documento', 'caminhoValidacao', '/validador', 'modoValidade', 'SEM_VENCIMENTO', 'diasValidade', null)
    )
  ),
  (
    'contrato_aluno',
    'SUPERIOR',
    1,
    'EM_REVISAO',
    jsonb_build_object(
      'tituloDocumento', 'Contrato de Prestação de Serviços Educacionais',
      'cabecalho', 'UNIVERSO CURSOS E CONSULTORIA',
      'corpo', 'Este modelo aguarda texto jurídico aprovado para Especialização. Nenhuma cláusula do contrato técnico foi adaptada automaticamente.',
      'rodape', 'Documento emitido eletronicamente pela Universo Cursos e Consultoria.',
      'observacaoEscopo', 'Revisão jurídica obrigatória antes da primeira emissão.',
      'fonte', 'AGUARDANDO_REVISAO_JURIDICA',
      'marcaDagua', jsonb_build_object('habilitada', true, 'intensidade', 'SUAVE', 'origem', 'POLO_EMISSOR'),
      'qr', jsonb_build_object('habilitado', true, 'rotulo', 'Validar documento', 'caminhoValidacao', '/validador', 'modoValidade', 'SEM_VENCIMENTO', 'diasValidade', null)
    )
  ),
  (
    'contrato_aluno',
    'EAD',
    1,
    'EM_REVISAO',
    jsonb_build_object(
      'tituloDocumento', 'Contrato de Prestação de Serviços Educacionais',
      'cabecalho', 'UNIVERSO CURSOS E CONSULTORIA',
      'corpo', 'Este modelo aguarda texto jurídico aprovado para EAD. Nenhuma cláusula do contrato técnico foi adaptada automaticamente.',
      'rodape', 'Documento emitido eletronicamente pela Universo Cursos e Consultoria.',
      'observacaoEscopo', 'Revisão jurídica obrigatória antes da primeira emissão.',
      'fonte', 'AGUARDANDO_REVISAO_JURIDICA',
      'marcaDagua', jsonb_build_object('habilitada', true, 'intensidade', 'SUAVE', 'origem', 'POLO_EMISSOR'),
      'qr', jsonb_build_object('habilitado', true, 'rotulo', 'Validar documento', 'caminhoValidacao', '/validador', 'modoValidade', 'SEM_VENCIMENTO', 'diasValidade', null)
    )
  ),
  (
    'carteirinha_preceptor',
    'GERAL',
    1,
    'ATIVO',
    jsonb_build_object(
      'nomeModelo', 'Carteirinha de Preceptor',
      'tituloFrente', 'PRECEPTOR(A)',
      'subtituloFrente', 'UNIVERSO CURSOS E CONSULTORIA',
      'mensagemVerso', 'Credencial institucional de uso pessoal e intransferível. A autenticidade pode ser conferida pelo QR Code.',
      'rodape', 'Documento institucional · valide pelo QR Code',
      'mostrarFoto', true,
      'mostrarPolo', true,
      'marcaDaguaHabilitada', true,
      'qr', jsonb_build_object('habilitado', true, 'rotulo', 'Validar credencial', 'caminhoValidacao', '/validador', 'modoValidade', 'POR_DIAS', 'diasValidade', 365)
    )
  ),
  (
    'calendario_aulas',
    'GERAL',
    1,
    'ATIVO',
    jsonb_build_object(
      'nomeModelo', 'Calendário de Aulas',
      'titulo', 'Calendário de Aulas Teóricas',
      'subtitulo', '{{CURSO}} · {{TURMA}}',
      'rodape', 'Calendário gerado eletronicamente pela Universo Cursos e Consultoria.',
      'observacaoSemHorario', 'Horário não informado na grade da turma.',
      'orientacao', 'A4_RETRATO',
      'exibirMarcaDagua', true,
      'exibirModulo', true,
      'exibirQr', false,
      'cabecalhosTabela', jsonb_build_object('componente', 'Componente curricular', 'data', 'Data', 'horario', 'Horário', 'professorObservacao', 'Professor(es) / observação')
    )
  )
on conflict (template_key, modalidade) do nothing;

insert into public.documentos_modelos_historico (
  template_key, modalidade, revisao, status, conteudo, atualizado_por, request_id
)
select
  model.template_key,
  model.modalidade,
  model.revisao,
  model.status,
  model.conteudo,
  null,
  null
from public.documentos_modelos_configuracoes model
where model.template_key in ('contrato_aluno', 'carteirinha_preceptor', 'calendario_aulas')
on conflict (template_key, modalidade, revisao) do nothing;

-- A consulta pública continua usando somente snapshots mascarados. A união
-- abaixo acrescenta a credencial de preceptor sem relaxar as colunas NOT NULL
-- de documentos estudantis.
create or replace function public.validar_documento_por_codigo(p_codigo text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  with candidate as (
    select
      validation.documento,
      validation.codigo,
      validation.status,
      validation.validacao_publica,
      validation.politica_versao_emissao,
      validation.campos_publicos_emissao,
      validation.dados_publicos_snapshot,
      policy.campos_publicos as campos_publicos_atuais,
      policy.consulta_publica_ativa,
      policy.exige_vinculo_ativo,
      upper(coalesce(enrollment.status, '')) as enrollment_status,
      true as subject_active,
      public.documento_validade_efetiva(
        validation.documento,
        validation.validade_ate,
        class.data_previsao_termino
      ) as validade_efetiva
    from public.documentos_validacao validation
    join public.documentos_validacao_politicas policy
      on policy.documento = validation.documento
    left join public.matriculas enrollment
      on enrollment.id = validation.matricula_id
    left join public.turmas class on class.id = enrollment.turma_id
    where upper(btrim(validation.codigo)) = upper(btrim(p_codigo))
      and validation.validacao_publica
      and policy.consulta_publica_ativa

    union all

    select
      'carteirinha_preceptor'::text as documento,
      credential.codigo,
      credential.status,
      credential.validacao_publica,
      credential.politica_versao_emissao,
      credential.campos_publicos_emissao,
      credential.dados_publicos_snapshot,
      policy.campos_publicos as campos_publicos_atuais,
      policy.consulta_publica_ativa,
      false as exige_vinculo_ativo,
      null::text as enrollment_status,
      upper(coalesce(preceptor.status, '')) = 'ATIVO' as subject_active,
      credential.validade_ate as validade_efetiva
    from public.documentos_validacao_preceptores credential
    join public.documentos_validacao_politicas policy
      on policy.documento = 'carteirinha_preceptor'
    join public.parceiros preceptor on preceptor.id = credential.professor_id
    where upper(btrim(credential.codigo)) = upper(btrim(p_codigo))
      and credential.validacao_publica
      and policy.consulta_publica_ativa
  ),
  visible as (
    select
      candidate.*,
      coalesce(
        array(
          select emission_field.field
          from unnest(candidate.campos_publicos_emissao) as emission_field(field)
          where emission_field.field = any(candidate.campos_publicos_atuais)
          order by emission_field.field
        ),
        array[]::text[]
      ) as visible_fields
    from candidate
  )
  select
    jsonb_build_object(
      'type', visible.documento,
      'status', case
        when visible.status = 'REVOGADO' then 'REVOKED'
        when not visible.subject_active then 'REVOKED'
        when visible.validade_efetiva is not null and visible.validade_efetiva < now() then 'EXPIRED'
        when visible.exige_vinculo_ativo and visible.enrollment_status <> 'ATIVO' then 'REVOKED'
        else 'ACTIVE'
      end,
      'code', visible.codigo
    )
    || public.filtrar_dados_publicos_validacao(
      visible.dados_publicos_snapshot,
      visible.visible_fields
    )
    || case
      when 'expiresAt' = any(visible.visible_fields)
        then jsonb_build_object('expiresAt', visible.validade_efetiva)
      else '{}'::jsonb
    end
    || jsonb_build_object(
      'visibleFields', visible.visible_fields,
      'schemaVersion', visible.politica_versao_emissao
    )
  from visible
  limit 1;
$function$;

revoke all on function public.validar_documento_por_codigo(text)
  from public;
grant execute on function public.validar_documento_por_codigo(text)
  to anon, authenticated;
