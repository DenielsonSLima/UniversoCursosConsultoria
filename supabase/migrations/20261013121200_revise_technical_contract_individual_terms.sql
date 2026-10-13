begin;

-- Revisão editorial da minuta técnica existente, sem preencher oferta, endereço,
-- índices, benefícios ou regras de cobrança com valores presumidos.
create or replace function internal_academic.revise_contract_individual_terms(p_content jsonb)
returns jsonb
language plpgsql
immutable
security invoker
set search_path = ''
as $function$
declare
  v_content jsonb := p_content;
  v_body text := p_content ->> 'corpo';
  v_change record;
  v_highlights jsonb;
begin
  if p_content ->> 'presentationVersion' is distinct from 'CONTRATO_A4_INSTITUCIONAL_V3_MINUTA_COMPLETA'
    or nullif(btrim(v_body), '') is null then
    raise exception 'A revisão exige o modelo técnico integral vigente.' using errcode = '22023';
  end if;

  for v_change in select * from (values
    ($old$CONTRATANTE: {{aluno.responsavel.nome}}
CPF: {{aluno.responsavel.cpf}}    Parentesco: {{aluno.responsavel.parentesco}}
Contato: {{aluno.responsavel.telefone}}$old$,
     $new$CONTRATANTE: {{contratante.nome}}
CPF: {{contratante.cpf}}    Qualificação: {{contratante.qualificacao}}
Contato: {{contratante.telefone}}$new$),
    ($old$, modalidade {{curso.modalidade}}, visando$old$,
     $new$, visando$new$),
    ($old$o mínimo configurado de {{regras.minimoAlunosTurma}} matrículas$old$,
     $new$o mínimo de {{regras.minimoAlunosTurma}} matrículas previsto neste contrato$new$),
    ($old$permanecerá registrado na revisão vigente deste modelo.$old$,
     $new$integra este contrato.$new$),
    ($old$V - As datas de rematrícula serão divulgadas pela CONTRATADA no período acadêmico próprio, com antecedência de referência de {{regras.prazoRematriculaDias}} dias em relação ao encerramento do semestre letivo em andamento.$old$,
     $new$V - As datas de rematrícula serão divulgadas pela CONTRATADA com antecedência de {{regras.prazoRematriculaDias}} dias em relação ao encerramento do período letivo correspondente, respeitados os ciclos e as condições financeiras discriminados na cláusula 6ª.$new$),
    ($old$terá a carga canônica de {{regras.cargaSaudeColetiva}}$old$,
     $new$terá a carga horária de {{regras.cargaSaudeColetiva}}$new$),
    ($old$I - O CONTRATANTE compromete-se a comparecer ao local designado$old$,
     $new$I - O ALUNO compromete-se a comparecer ao local designado$new$),
    ($old$V - O CONTRATANTE deverá cumprir {{regras.frequenciaEstagioObrigatoria}}%$old$,
     $new$V - O ALUNO deverá cumprir {{regras.frequenciaEstagioObrigatoria}}%$new$),
    ($old$PARÁGRAFO 6º - O CONTRATANTE compromete-se a observar rigorosamente as normas internas e de segurança do local de estágio$old$,
     $new$PARÁGRAFO 6º - O ALUNO compromete-se a observar rigorosamente as normas internas e de segurança do local de estágio$new$),
    ($old$as condições financeiras canônicas vinculadas à matrícula:$old$,
     $new$os valores discriminados no plano individual desta matrícula:$new$),
    ($old$I - Valor da matrícula: {{financeiro.valorMatricula}}.$old$,
     $new$I - Matrícula: {{financeiro.quantidadeMatriculas}} cobrança(s), no total de {{financeiro.valorTotalMatriculas}}.$new$),
    ($old$II - Valor da rematrícula, quando aplicável: {{financeiro.valorRematricula}}.$old$,
     $new$II - Rematrículas previstas no plano: {{financeiro.quantidadeRematriculas}} cobrança(s), no total de {{financeiro.valorTotalRematriculas}}.$new$),
    ($old$III - Quantidade prevista de parcelas: {{financeiro.quantidadeParcelas}}; valor de cada parcela: {{financeiro.valorParcela}}; dia de vencimento: {{financeiro.diaVencimento}}; primeiro vencimento: {{financeiro.primeiroVencimento}}.$old$,
     $new$III - Quantidade de ciclos financeiros: {{financeiro.quantidadeCiclos}}. Quantidade de parcelas no plano completo: {{financeiro.quantidadeParcelas}}. Total das mensalidades: {{financeiro.valorTotalMensalidades}}. Valor total do contrato, incluindo matrícula e rematrículas previstas: {{financeiro.valorTotalContrato}}.

Plano de pagamento: {{financeiro.planoPagamento}}.$new$),
    ($old$a - A renovação semestral observará o adimplemento$old$,
     $new$a - A renovação de matrícula observará o adimplemento$new$),
    ($old$I - O desconto de pontualidade, quando previsto, seguirá as condições canônicas registradas: {{financeiro.condicoes}}.$old$,
     $new$I - Descontos de pontualidade e encargos por atraso observarão as condições desta matrícula: {{financeiro.condicoes}}.$new$),
    ($old$PARÁGRAFO 3º - O não comparecimento do CONTRATANTE aos atos escolares não o exime do pagamento$old$,
     $new$PARÁGRAFO 3º - O não comparecimento do ALUNO aos atos escolares não exime o CONTRATANTE do pagamento$new$),
    ($old$condicionado à validação jurídica, à proporcionalidade e à legislação aplicável.$old$,
     $new$somente quando juridicamente exigível e proporcional, observada a legislação aplicável.$new$),
    ($old$esta minuta não autoriza cobrança automática integral fora desses limites.$old$,
     $new$este contrato não autoriza cobrança automática integral fora desses limites.$new$),
    ($old$o valor canônico contratado$old$,
     $new$o valor contratado$new$),
    ($old$a - Se o aproveitamento for deferido, o CONTRATANTE ficará dispensado dos componentes expressamente reconhecidos.$old$,
     $new$a - Se o aproveitamento for deferido, o ALUNO ficará dispensado dos componentes expressamente reconhecidos.$new$),
    ($old$o CONTRATANTE informará condições de saúde e necessidades específicas relevantes para a prestação educacional$old$,
     $new$o CONTRATANTE informará condições de saúde e necessidades específicas do ALUNO relevantes para a prestação educacional$new$),
    ($old$conforme a legislação e as condições acadêmicas aplicáveis, sem reproduzir automaticamente regras temporárias já revogadas.$old$,
     $new$conforme a legislação vigente e as condições acadêmicas aplicáveis.$new$),
    ($old$CLÁUSULA 11ª - No inadimplemento, correção monetária, multa, juros e demais encargos serão exclusivamente os constantes das condições financeiras canônicas — {{financeiro.condicoes}} — e observarão os limites legais, o instrumento de cobrança e a data da efetiva quitação.$old$,
     $new$CLÁUSULA 11ª - No inadimplemento, serão aplicados somente os encargos expressamente previstos nas condições financeiras da cláusula 6ª, observados os limites legais, o instrumento de cobrança e a data da efetiva quitação.$new$)
  ) as changes(before_text, after_text) loop
    if position(v_change.before_text in v_body) = 0 then
      raise exception 'O modelo técnico diverge do texto revisado; compare a revisão vigente antes de aplicar.'
        using errcode = '55000';
    end if;
    v_body := replace(v_body, v_change.before_text, v_change.after_text);
  end loop;

  v_content := jsonb_set(v_content, '{corpo}', to_jsonb(v_body));
  if lower(btrim(coalesce(v_content ->> 'cabecalho', ''))) = 'minuta contratual técnica' then
    -- A emissão exige campo configurado não vazio. O renderer resolve esta
    -- identidade e já suprime a duplicação com o cabeçalho institucional.
    v_content := jsonb_set(v_content, '{cabecalho}', '"{{instituicao.nome}}"'::jsonb);
  end if;
  -- Preserva as expressões configuradas, atualizando somente as âncoras alteradas.
  if jsonb_typeof(v_content -> 'destaquesCriticos') = 'array' then
    select coalesce(jsonb_agg(to_jsonb(case item.value
      when 'antecedência de referência de {{regras.prazoRematriculaDias}} dias'
        then 'antecedência de {{regras.prazoRematriculaDias}} dias'
      when 'Quantidade prevista de parcelas: {{financeiro.quantidadeParcelas}}'
        then 'Quantidade de parcelas no plano completo: {{financeiro.quantidadeParcelas}}'
      when 'correção monetária, multa, juros e demais encargos'
        then 'encargos expressamente previstos nas condições financeiras da cláusula 6ª'
      else item.value end) order by item.ordinality), '[]'::jsonb)
    into v_highlights
    from jsonb_array_elements_text(v_content -> 'destaquesCriticos') with ordinality as item(value, ordinality);
    v_content := jsonb_set(v_content, '{destaquesCriticos}', v_highlights);
  end if;
  v_content := jsonb_set(v_content, '{observacaoEscopo}', to_jsonb(concat_ws(E'\n',
    nullif(v_content ->> 'observacaoEscopo', ''),
    'Revisão de identificação do contratante e condições individuais. Exige aprovação institucional da nova revisão antes de emitir. Não constitui validação jurídica automática.'
  )));
  v_content := jsonb_set(v_content, '{presentationVersion}',
    '"CONTRATO_A4_INSTITUCIONAL_V4_LEGIVEL"'::jsonb);
  return v_content - 'status';
end;
$function$;

revoke all on function internal_academic.revise_contract_individual_terms(jsonb)
  from public, anon, authenticated, service_role;

do $revise_technical_model$
declare
  v_current public.documentos_modelos_configuracoes%rowtype;
  v_content jsonb;
begin
  select model.* into v_current
  from public.documentos_modelos_configuracoes model
  where model.template_key = 'contrato_aluno' and model.modalidade = 'TECNICO'
  for update;
  if not found then raise exception 'Modelo técnico do Contrato do Aluno não localizado.'; end if;
  v_content := internal_academic.revise_contract_individual_terms(v_current.conteudo);

  update public.documentos_modelos_configuracoes
  set revisao = v_current.revisao + 1,
      status = 'EM_REVISAO', conteudo = v_content, atualizado_por = null, updated_at = now()
  where template_key = v_current.template_key and modalidade = v_current.modalidade;
  insert into public.documentos_modelos_historico (
    template_key, modalidade, revisao, status, conteudo, atualizado_por, request_id
  ) values (
    v_current.template_key, v_current.modalidade, v_current.revisao + 1,
    'EM_REVISAO', v_content, null, null
  );
end;
$revise_technical_model$;

-- Não altera aprovações, emissões históricas ou envelopes de assinatura.
commit;
