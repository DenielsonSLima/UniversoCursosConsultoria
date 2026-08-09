-- O campo `cabecalho` do contrato é um subtítulo opcional. Revisões legadas
-- salvaram nele o próprio nome institucional, que o cabeçalho visual já exibe.
-- O renderer canônico elimina somente essa redundância e preserva subtítulos
-- realmente distintos definidos no modelo.

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

  -- Compatibilidade com snapshots/modelos gravados antes da correção.
  v_footer := replace(v_footer, chr(92) || 'r' || chr(92) || 'n', E'\n');
  v_footer := replace(v_footer, chr(92) || 'n', E'\n');
  v_footer := replace(v_footer, '{{emissao.data}}', coalesce(p_snapshot #>> '{emissao,dataExibicao}', to_char(now(), 'DD/MM/YYYY')));
  v_footer := replace(v_footer, '{{validacao.codigo}}', coalesce(p_codigo_validacao, 'Não informado'));
  v_footer := replace(v_footer, '{{validacao.validade}}', v_validade_texto);
  v_header := replace(v_header, '{{instituicao.nome}}', coalesce(p_snapshot #>> '{instituicao,nome}', 'UNIVERSO CURSOS E CONSULTORIA'));

  if nullif(btrim(v_header), '') is not null and (
    lower(regexp_replace(btrim(v_header), '[[:space:]]+', ' ', 'g')) = lower(regexp_replace(btrim(coalesce(p_snapshot #>> '{instituicao,nome}', '')), '[[:space:]]+', ' ', 'g'))
    or lower(regexp_replace(btrim(v_header), '[[:space:]]+', ' ', 'g')) = lower(regexp_replace(btrim(coalesce(p_snapshot #>> '{instituicao,nomeFantasia}', '')), '[[:space:]]+', ' ', 'g'))
    or lower(regexp_replace(btrim(v_header), '[[:space:]]+', ' ', 'g')) = lower(regexp_replace(btrim(coalesce(p_snapshot #>> '{instituicao,razaoSocial}', '')), '[[:space:]]+', ' ', 'g'))
  ) then
    v_header := '';
  end if;

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

revoke all on function public.renderizar_contrato_aluno_documento(jsonb, jsonb, text, timestamptz)
  from public, anon, authenticated, service_role;

comment on function public.renderizar_contrato_aluno_documento(jsonb, jsonb, text, timestamptz) is
  'Renderer interno do contrato: resolve tokens e suprime subtítulo redundante igual à identidade institucional.';
