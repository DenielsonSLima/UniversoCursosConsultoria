-- O rodapé técnico inicial foi salvo com "\n" literal e reaparecia no editor
-- como texto. Na minuta, local, assinaturas e testemunhas pertencem apenas ao
-- encerramento da última página; a paginação canônica já garante esse vínculo.

with modelos_corrigidos as (
  update public.documentos_modelos_configuracoes model
  set
    revisao = model.revisao + 1,
    status = case when model.status = 'ARQUIVADO' then 'ARQUIVADO' else 'EM_REVISAO' end,
    conteudo = jsonb_set(
      model.conteudo,
      '{rodape}',
      to_jsonb(replace(model.conteudo ->> 'rodape', chr(92) || 'n', E'\n')),
      true
    ),
    updated_at = now()
  where model.template_key = 'contrato_aluno'
    and model.modalidade = 'TECNICO'
    and position(chr(92) || 'n' in coalesce(model.conteudo ->> 'rodape', '')) > 0
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
from modelos_corrigidos model;

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
  from public, anon, authenticated;
