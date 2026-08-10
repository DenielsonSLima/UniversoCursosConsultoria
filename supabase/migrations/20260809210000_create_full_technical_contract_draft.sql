-- Reconcilia o modelo técnico com a minuta institucional integral. A revisão
-- nasce EM_REVISAO: esta migration não registra aprovação jurídica nem libera
-- emissão. Valores, prazos e dados pessoais são resolvidos pelo backend.

begin;

create or replace function public.paginar_contrato_aluno_minuta_completa(
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
  v_remaining text;
  v_piece text;
  v_prefix text;
  v_current text := '';
  v_pages jsonb := '[]'::jsonb;
  v_parts text[] := regexp_split_to_array(coalesce(p_body, ''), E'\n{2,}');
  v_limit integer := greatest(2400, least(coalesce(p_max_caracteres, 3600), 4200));
  v_available integer;
  v_break integer;
begin
  foreach v_part in array v_parts loop
    v_remaining := btrim(v_part);
    if v_remaining = '' then
      continue;
    end if;

    while v_remaining <> '' loop
      v_available := v_limit - char_length(v_current)
        - case when v_current = '' then 0 else 2 end;

      if v_available < 320 then
        v_pages := v_pages || jsonb_build_array(jsonb_build_object(
          'header', p_header,
          'title', p_title,
          'body', v_current,
          'footer', null
        ));
        v_current := '';
        continue;
      end if;

      if char_length(v_remaining) <= v_available then
        v_current := concat_ws(E'\n\n', nullif(v_current, ''), v_remaining);
        v_remaining := '';
        continue;
      end if;

      v_prefix := substr(v_remaining, 1, v_available);
      v_break := char_length(regexp_replace(v_prefix, E'\s+\S*$', ''));
      if v_break < greatest(1, floor(v_available / 2.0)::integer) then
        v_break := v_available;
      end if;

      v_piece := btrim(substr(v_remaining, 1, v_break));
      v_remaining := btrim(substr(v_remaining, v_break + 1));
      v_current := concat_ws(E'\n\n', nullif(v_current, ''), v_piece);
      v_pages := v_pages || jsonb_build_array(jsonb_build_object(
        'header', p_header,
        'title', p_title,
        'body', v_current,
        'footer', null
      ));
      v_current := '';
    end loop;
  end loop;

  if v_current <> '' or jsonb_array_length(v_pages) = 0 then
    v_pages := v_pages || jsonb_build_array(jsonb_build_object(
      'header', p_header,
      'title', p_title,
      'body', v_current,
      'footer', null
    ));
  end if;

  -- A minuta original também reserva uma folha própria para as assinaturas.
  -- Isso impede que o QR e o encerramento disputem altura com texto jurídico.
  if nullif(btrim(coalesce(p_footer, '')), '') is not null then
    v_pages := v_pages || jsonb_build_array(jsonb_build_object(
      'header', p_header,
      'title', p_title,
      'body', '',
      'footer', p_footer
    ));
  end if;

  return v_pages;
end;
$function$;

revoke all on function public.paginar_contrato_aluno_minuta_completa(
  text, text, text, text, integer
) from public, anon, authenticated, service_role;

-- Acrescenta somente os tokens da minuta completa e seleciona o paginador V3.
-- O compositor V2 permanece inalterado para reimpressões históricas.
do $patch_contract_renderer$
declare
  v_oid oid;
  v_definition text;
  v_token_needle text := $needle$  v_body := replace(v_body, '{{instituicao.cnpj}}', coalesce(p_snapshot #>> '{instituicao,cnpj}', 'Não informado'));
$needle$;
  v_token_replacement text;
  v_pages_needle text := $needle$    'pages', public.paginar_texto_documento_canonico(
      v_header,
      coalesce(nullif(p_template ->> 'tituloDocumento', ''), 'Contrato de Prestação de Serviços Educacionais'),
      v_body,
      v_footer
    ),
$needle$;
  v_pages_replacement text := $replacement$    'pages', case
      when p_template ->> 'presentationVersion' = 'CONTRATO_A4_INSTITUCIONAL_V3_MINUTA_COMPLETA'
        then public.paginar_contrato_aluno_minuta_completa(
          v_header,
          coalesce(nullif(p_template ->> 'tituloDocumento', ''), 'Contrato de Prestação de Serviços Educacionais'),
          v_body,
          v_footer
        )
      else public.paginar_texto_documento_canonico(
        v_header,
        coalesce(nullif(p_template ->> 'tituloDocumento', ''), 'Contrato de Prestação de Serviços Educacionais'),
        v_body,
        v_footer
      )
    end,
$replacement$;
begin
  select procedure.oid
  into v_oid
  from pg_catalog.pg_proc as procedure
  join pg_catalog.pg_namespace as namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.proname = 'renderizar_contrato_aluno_documento'
    and pg_catalog.pg_get_function_identity_arguments(procedure.oid)
      = 'p_template jsonb, p_snapshot jsonb, p_codigo_validacao text, p_validade_ate timestamp with time zone';

  if v_oid is null then
    raise exception 'Renderer canônico do Contrato do Aluno não localizado.';
  end if;

  v_definition := pg_catalog.pg_get_functiondef(v_oid);
  if position('{{regras.percentualCancelamento}}' in v_definition) = 0 then
    v_token_replacement := v_token_needle || $tokens$  v_body := replace(v_body, '{{instituicao.razaoSocial}}', coalesce(p_snapshot #>> '{instituicao,razaoSocial}', p_snapshot #>> '{instituicao,nome}', 'Não informado'));
  v_body := replace(v_body, '{{instituicao.endereco}}', coalesce(p_snapshot #>> '{instituicao,endereco}', 'Não informado'));
  v_body := replace(v_body, '{{instituicao.numero}}', coalesce(p_snapshot #>> '{instituicao,numero}', 'S/N'));
  v_body := replace(v_body, '{{instituicao.bairro}}', coalesce(p_snapshot #>> '{instituicao,bairro}', 'Não informado'));
  v_body := replace(v_body, '{{instituicao.cidade}}', coalesce(p_snapshot #>> '{instituicao,cidade}', 'Não informado'));
  v_body := replace(v_body, '{{instituicao.uf}}', coalesce(p_snapshot #>> '{instituicao,uf}', p_snapshot #>> '{instituicao,estado}', ''));
  v_body := replace(v_body, '{{instituicao.cep}}', coalesce(p_snapshot #>> '{instituicao,cep}', 'Não informado'));
  v_body := replace(v_body, '{{aluno.responsavel.parentesco}}', coalesce(p_snapshot #>> '{aluno,responsavel,parentesco}', 'Não informado'));
  v_body := replace(v_body, '{{curso.modalidade}}', coalesce(p_snapshot #>> '{curso,modalidade}', 'Não informado'));
  v_body := replace(v_body, '{{curso.cargaHoraria}}', coalesce(p_snapshot #>> '{curso,cargaHoraria}', 'Não informado'));
  v_body := replace(v_body, '{{turma.previsaoTermino}}', coalesce(p_snapshot #>> '{turma,previsaoTerminoExibicao}', 'Não informado'));
  v_body := replace(v_body, '{{regras.minimoAlunosTurma}}', coalesce(p_template #>> '{regrasDinamicas,minimoAlunosTurma}', 'Não informado'));
  v_body := replace(v_body, '{{regras.prazoReembolsoDiasUteis}}', coalesce(p_template #>> '{regrasDinamicas,prazoReembolsoDiasUteis}', 'Não informado'));
  v_body := replace(v_body, '{{regras.prazoRematriculaDias}}', coalesce(p_template #>> '{regrasDinamicas,prazoRematriculaDias}', 'Não informado'));
  v_body := replace(v_body, '{{regras.percentualCancelamento}}', coalesce(p_template #>> '{regrasDinamicas,percentualCancelamento}', 'Não informado'));
  v_body := replace(v_body, '{{regras.frequenciaEstagioObrigatoria}}', coalesce(p_template #>> '{regrasDinamicas,frequenciaEstagioObrigatoria}', 'Não informado'));
  v_body := replace(v_body, '{{regras.frequenciaTeoricaMinima}}', coalesce(p_template #>> '{regrasDinamicas,frequenciaTeoricaMinima}', 'Não informado'));
  v_body := replace(v_body, '{{regras.cargaSaudeColetiva}}', coalesce(p_template #>> '{regrasDinamicas,cargaSaudeColetiva}', 'Não informado'));
  v_body := replace(v_body, '{{regras.honorariosCobrancaPercentual}}', coalesce(p_template #>> '{regrasDinamicas,honorariosCobrancaPercentual}', 'Não informado'));
  v_body := replace(v_body, '{{regras.multaBibliotecaDia}}', coalesce(p_template #>> '{regrasDinamicas,multaBibliotecaDia}', 'Não informado'));
$tokens$;
    if position(v_token_needle in v_definition) = 0 then
      raise exception 'Ponto seguro de tokens do contrato mudou; migration não aplicada.';
    end if;
    v_definition := replace(v_definition, v_token_needle, v_token_replacement);
  end if;

  if position('paginar_contrato_aluno_minuta_completa' in v_definition) = 0 then
    if position(v_pages_needle in v_definition) = 0 then
      raise exception 'Ponto seguro de paginação do contrato mudou; migration não aplicada.';
    end if;
    v_definition := replace(v_definition, v_pages_needle, v_pages_replacement);
  end if;

  execute v_definition;
end;
$patch_contract_renderer$;

-- Novas emissões congelam a apresentação declarada pelo próprio modelo.
do $patch_contract_snapshot_version$
declare
  v_oid oid;
  v_definition text;
  v_needle text := E'    v_snapshot := public.enriquecer_snapshot_identidade_visual_contrato(v_snapshot);\n';
  v_replacement text := E'    v_snapshot := public.enriquecer_snapshot_identidade_visual_contrato(v_snapshot);\n'
    || $replacement$    v_snapshot := jsonb_set(
      v_snapshot,
      '{instituicao,presentationVersion}',
      to_jsonb(coalesce(nullif(v_model.conteudo ->> 'presentationVersion', ''), 'CONTRATO_A4_INSTITUCIONAL_V2')),
      true
    );
$replacement$;
begin
  select procedure.oid
  into v_oid
  from pg_catalog.pg_proc as procedure
  join pg_catalog.pg_namespace as namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.proname = 'preparar_emissao_contrato_aluno_base_secure'
    and pg_catalog.pg_get_function_identity_arguments(procedure.oid)
      = 'p_polo_id uuid, p_modo text, p_matricula_ids uuid[], p_mensagem_personalizada text, p_idempotency_key uuid';

  if v_oid is null then
    raise exception 'Emissor base do Contrato do Aluno não localizado.';
  end if;

  v_definition := pg_catalog.pg_get_functiondef(v_oid);
  if position('v_model.conteudo ->> ''presentationVersion''' in v_definition) = 0 then
    if position(v_needle in v_definition) = 0 then
      raise exception 'Ponto seguro do snapshot contratual mudou; migration não aplicada.';
    end if;
    execute replace(v_definition, v_needle, v_replacement);
  end if;
end;
$patch_contract_snapshot_version$;

do $create_full_contract_draft$
declare
  v_current public.documentos_modelos_configuracoes%rowtype;
  v_content jsonb;
begin
  select model.*
  into v_current
  from public.documentos_modelos_configuracoes model
  where model.template_key = 'contrato_aluno'
    and model.modalidade = 'TECNICO'
  for update;

  if not found then
    raise exception 'Modelo técnico do Contrato do Aluno não localizado.';
  end if;

  if v_current.revisao = 4
    and v_current.conteudo ->> 'presentationVersion' = 'CONTRATO_A4_INSTITUCIONAL_V3_MINUTA_COMPLETA'
  then
    return;
  end if;

  if v_current.revisao <> 3 then
    raise exception 'Revisão técnica inesperada: esperado 3, encontrado %.', v_current.revisao;
  end if;

  v_content := jsonb_build_object(
    'tituloDocumento', 'Contrato de Prestação de Serviços Educacionais',
    'cabecalho', 'Minuta contratual técnica',
    'corpo', $minuta$
ALUNO: {{aluno.nome}}
Data de Nascimento: {{aluno.nascimento}}
CPF: {{aluno.cpf}}    RG: {{aluno.rg}}    Órgão Expedidor: {{aluno.orgaoExpedidor}}
Endereço: {{aluno.endereco.logradouro}}, {{aluno.endereco.numero}}, CEP: {{aluno.endereco.cep}}, {{aluno.endereco.cidade}}/{{aluno.endereco.uf}}.
Contato: {{aluno.telefone}}

CONTRATANTE: {{aluno.responsavel.nome}}
CPF: {{aluno.responsavel.cpf}}    Parentesco: {{aluno.responsavel.parentesco}}
Contato: {{aluno.responsavel.telefone}}

CONTRATADA {{instituicao.razaoSocial}}, CNPJ: {{instituicao.cnpj}}, situada em {{instituicao.endereco}}, nº {{instituicao.numero}}, bairro {{instituicao.bairro}}, {{instituicao.cidade}}/{{instituicao.uf}}, CEP {{instituicao.cep}}, neste ato representada na forma de seus atos societários.

OBJETO DO PRESENTE INSTRUMENTO:
O presente instrumento tem como objeto principal a prestação de serviços de educação de nível médio técnico e especializações técnicas por meio do curso {{curso.nome}}, modalidade {{curso.modalidade}}, visando ao desenvolvimento das faculdades físicas, intelectuais e morais do educando mediante aulas e demais atividades escolares. A prestação respeitará o regimento escolar, o plano e o projeto pedagógico do curso, a natureza do conteúdo programático, a técnica pedagógica necessária e a legislação vigente.

CLÁUSULA 1ª – O presente contrato é celebrado sob a égide do artigo 209 da Constituição Federal, das normas relacionadas ao Sistema Nacional de Educação, do Código de Defesa do Consumidor e das demais disposições legais aplicáveis.

CLÁUSULA 2ª – A CONTRATADA compromete-se, por meio de plano escolar, estudos programados e calendário curricular, a ministrar ensino mediante aulas e demais atividades escolares, buscando atender às necessidades e aos interesses formativos e informativos do educando.

CLÁUSULA 3ª – As aulas serão ministradas nas instalações da CONTRATADA ou em outros locais por ela indicados, podendo ocorrer de forma presencial, telepresencial, remota ou híbrida quando autorizada pelas normas educacionais. A atividade virtual síncrona, quando adotada, ocorrerá em ambiente restrito à turma, nos horários acadêmicos definidos, com interação entre professor e alunos, sem ser confundida automaticamente com oferta autoinstrucional de educação a distância.

CLÁUSULA 4ª – A CONTRATADA é responsável pelo planejamento e pela prestação dos serviços de ensino, inclusive fixação de carga horária, designação de professores, orientação didático-pedagógica e educacional, agendamento de avaliações e demais providências exigidas pelas atividades docentes, observadas as normas aplicáveis e sua autonomia acadêmica.

CLÁUSULA 5ª – O CONTRATANTE requer matrícula no curso {{curso.nome}}, turma {{turma.nome}}, com início previsto em {{turma.inicio}}, término previsto em {{turma.previsaoTermino}} e carga horária total de {{curso.cargaHoraria}} horas, conforme projeto pedagógico vigente.

I - A matrícula não será autorizada quando o CONTRATANTE possuir débito exigível perante a CONTRATADA e não o regularizar na forma institucional aplicável.

II - A matrícula poderá ser indeferida se não houver pagamento da matrícula prevista na cláusula 6ª ou se não forem entregues, no prazo informado, os documentos acadêmicos e cadastrais exigidos.

III - A CONTRATADA poderá cancelar a formação da turma quando não houver o mínimo configurado de {{regras.minimoAlunosTurma}} matrículas, assegurando ao CONTRATANTE a restituição do valor pago a título de matrícula, na forma da legislação e das condições aprovadas.

a - O número mínimo aplicável será o expressamente informado pela CONTRATADA para a turma contratada e permanecerá registrado na revisão vigente deste modelo.

IV - O reembolso previsto no inciso anterior será processado em até {{regras.prazoReembolsoDiasUteis}} dias úteis subsequentes à data prevista para o início das aulas, ressalvados os prazos legais mais favoráveis ao CONTRATANTE.

V - As datas de rematrícula serão divulgadas pela CONTRATADA no período acadêmico próprio, com antecedência de referência de {{regras.prazoRematriculaDias}} dias em relação ao encerramento do semestre letivo em andamento.

VI - Encerrado o prazo regular, a rematrícula dependerá de disponibilidade acadêmica, adimplemento, entrega documental e condições financeiras expressamente informadas pela CONTRATADA.

PARÁGRAFO 1º - Com o deferimento da matrícula, o CONTRATANTE compromete-se a observar o regimento interno, as normas acadêmicas e as penalidades legitimamente aplicáveis, declarando ter acesso a esses documentos pelos canais institucionais.

PARÁGRAFO 2º - O CONTRATANTE declara ciência de que, conforme a especificidade do curso, poderão existir atividades extracurriculares, estágios e exercícios pedagógicos fora das dependências da CONTRATADA. Custos não incluídos no preço ordinário somente serão exigidos quando previamente informados e permitidos pela legislação.

PARÁGRAFO 3º - Os estágios curriculares serão realizados em organizações públicas e/ou privadas aceitas pela CONTRATADA, conforme o projeto pedagógico, as regras acadêmicas e a legislação. Quando o curso ou a norma atribuir à CONTRATADA a definição do campo de estágio, esta providenciará a indicação correspondente.

I - O CONTRATANTE compromete-se a comparecer ao local designado, cumprir a carga horária e os horários definidos e portar uniforme, identificação acadêmica e documento civil quando exigidos. As atividades poderão ocorrer fora do horário regular, inclusive em finais de semana ou feriados, desde que legalmente permitidas e previamente comunicadas.

II - Custos operacionais de estágio e atividades extracurriculares observarão as informações prévias, o projeto pedagógico e a legislação aplicável, não podendo ser presumidos ou criados fora das condições contratadas.

III - Nos cursos da área de saúde, o CONTRATANTE compromete-se a apresentar, nos períodos informados, documentos de saúde, fator sanguíneo, seguro, vacinação e demais comprovantes exigidos pela legislação ou pelo campo de estágio.

a - A ausência de documento obrigatório poderá impedir temporariamente a participação no estágio até a regularização, observados o contraditório, a proporcionalidade e as normas acadêmicas aplicáveis.

b - Exames, seguro, vacinação e documentos pessoais exigidos para a atividade serão providenciados conforme a divisão de responsabilidades prevista em lei, no projeto pedagógico e nas condições institucionais informadas.

IV - Nos estágios da área de saúde, serão utilizados vestuário, calçado, jaleco, identificação e materiais de bolso compatíveis com as exigências de biossegurança, do campo de estágio e do padrão institucional.

a - A aquisição e a conservação dos itens pessoais de uso obrigatório observarão as condições informadas antes da atividade e a legislação aplicável.

V - O CONTRATANTE deverá cumprir {{regras.frequenciaEstagioObrigatoria}}% da carga horária de estágio e frequência mínima de {{regras.frequenciaTeoricaMinima}}% nas atividades teóricas, ou percentuais posteriores mais protetivos ou obrigatórios definidos pela legislação e pelo projeto pedagógico.

a - A reposição de carga horária não cumprida dependerá de disponibilidade, justificativa, regras acadêmicas e condições financeiras previamente informadas, sem afastar direitos assegurados por lei.

VI - Quando previsto na matriz do curso de Enfermagem, o estágio do componente Saúde Coletiva terá a carga canônica de {{regras.cargaSaudeColetiva}} e será realizado nos períodos e nas unidades de saúde disponíveis e autorizadas.

a - A oferta de Saúde Coletiva respeitará o funcionamento das unidades públicas, as regras do conselho profissional e os horários comunicados ao CONTRATANTE.

PARÁGRAFO 4º - Os estágios curriculares de Enfermagem serão acompanhados por preceptores designados pela CONTRATADA, conforme a legislação e as normas do conselho profissional.

PARÁGRAFO 5º - As atividades extracurriculares, os estágios e outros exercícios pedagógicos obrigatórios deverão ser registrados nos instrumentos acadêmicos próprios.

I - As fichas e os registros de estágio deverão ser preenchidos de forma legível, íntegra e verificável, sem rasuras que impeçam a comprovação, admitidos os meios eletrônicos autorizados pela CONTRATADA.

PARÁGRAFO 6º - O CONTRATANTE compromete-se a observar rigorosamente as normas internas e de segurança do local de estágio, ficando sujeito às medidas acadêmicas proporcionais cabíveis em caso de descumprimento.

PARÁGRAFO 7º - O estágio curricular não cria vínculo empregatício com a CONTRATADA ou com a concedente quando observados os requisitos legais. Qualquer desvio de finalidade deverá ser comunicado imediatamente para adoção das providências adequadas.

PARÁGRAFO 8º - Os registros de frequência, produtividade e desempenho serão preenchidos pelo responsável competente e deverão conter os elementos exigidos pelo projeto pedagógico e pelas normas do estágio, inclusive datas, horários, identificação, registro profissional quando aplicável e avaliação das atividades.

PARÁGRAFO 9º - Em situação de emergência pública, determinação normativa ou necessidade acadêmica legalmente reconhecida, a CONTRATADA poderá instituir atividades remotas, telepresenciais, híbridas, videoconferências ou videoaulas, assegurando validade, frequência, avaliação, carga horária e suporte conforme autorização dos órgãos competentes.

I - A carga horária atribuída a essas atividades será definida pela CONTRATADA dentro dos limites autorizados pelos órgãos reguladores e pelo projeto pedagógico.

II - A CONTRATADA disponibilizará os meios institucionais de transmissão e os recursos acadêmicos necessários sob sua responsabilidade.

III - O CONTRATANTE será responsável pelos meios pessoais de recepção e acesso, observadas as alternativas de acessibilidade e suporte institucional aplicáveis.

a - Custos pessoais de conexão, equipamento e manutenção somente serão atribuídos ao CONTRATANTE nos limites previamente informados e legalmente admitidos.

b - É proibida a gravação, reprodução ou divulgação não autorizada das aulas e dos materiais protegidos, ressalvados os usos permitidos por lei, as medidas de acessibilidade e as autorizações institucionais expressas.

c - As interações acadêmicas poderão ocorrer por e-mail, aplicativos institucionais e portal do aluno, observadas a privacidade, a proteção de dados e as regras específicas sobre voz e imagem.

CLÁUSULA 6ª – Em contraprestação aos serviços educacionais, o CONTRATANTE compromete-se a pagar à CONTRATADA as condições financeiras canônicas vinculadas à matrícula:

I - Valor da matrícula: {{financeiro.valorMatricula}}.

II - Valor da rematrícula, quando aplicável: {{financeiro.valorRematricula}}.

III - Quantidade prevista de parcelas: {{financeiro.quantidadeParcelas}}; valor de cada parcela: {{financeiro.valorParcela}}; dia de vencimento: {{financeiro.diaVencimento}}; primeiro vencimento: {{financeiro.primeiroVencimento}}.

a - A renovação semestral observará o adimplemento, as regras legais de matrícula e as condições acadêmicas vigentes, sem impedir direitos assegurados ao CONTRATANTE.

IV - Alterações normativas da matriz curricular ou inclusões solicitadas pelo CONTRATANTE somente gerarão valor adicional quando previamente comunicadas, justificadas e formalmente aceitas, nos limites legais.

PARÁGRAFO 1º - O pagamento será realizado pelos meios institucionais de cobrança disponibilizados pela CONTRATADA, nas datas registradas na matrícula e nos títulos emitidos.

a - Se não receber o instrumento de cobrança antes do vencimento, o CONTRATANTE deverá solicitar segunda via à secretaria e manter seus dados cadastrais atualizados.

b - Outras formas de pagamento poderão ser aceitas quando legais e expressamente autorizadas pela CONTRATADA.

PARÁGRAFO 2º - Se a data de vencimento ocorrer em dia sem compensação bancária, o pagamento poderá ser realizado no próximo dia útil, observadas as regras do instrumento de cobrança.

I - O desconto de pontualidade, quando previsto, seguirá as condições canônicas registradas: {{financeiro.condicoes}}.

PARÁGRAFO 3º - O não comparecimento do CONTRATANTE aos atos escolares não o exime do pagamento das prestações correspondentes aos serviços efetivamente disponibilizados, ressalvadas as hipóteses legais de suspensão, rescisão ou revisão.

PARÁGRAFO 4º - Em caso de desistência, cancelamento, suspensão, interrupção ou transferência, a cessação das cobranças dependerá de requerimento formal protocolado perante a secretaria, sendo exigíveis as parcelas vencidas e os serviços disponibilizados até a data efetiva do protocolo, sem prejuízo dos direitos previstos em lei.

I - É devido pelo CONTRATANTE no caso de pedido de desistência, cancelamento, suspensão ou interrupção antes do início das aulas e da formação definitiva da turma o percentual contratual de {{regras.percentualCancelamento}}% sobre o saldo devedor, condicionado à validação jurídica, à proporcionalidade e à legislação aplicável.

PARÁGRAFO 5º - Em caso de desistência, cancelamento, suspensão ou interrupção e transferência do curso antes do início das aulas, após a formação da turma, a retenção da matrícula e o percentual de {{regras.percentualCancelamento}}% sobre o saldo devedor somente poderão ser aplicados nos limites da legislação, mediante demonstração das despesas e das condições expressamente aprovadas.

PARÁGRAFO 6º - No primeiro dia de aula ou após o primeiro dia, as regras de reembolso, parcelas vencidas, serviços disponibilizados e eventual saldo observarão a proporcionalidade, o requerimento formal, as condições financeiras aprovadas e a legislação de proteção ao consumidor; esta minuta não autoriza cobrança automática integral fora desses limites.

PARÁGRAFO 7º - As prestações ordinárias não incluem, salvo previsão expressa, taxas e contribuições relativas a viagens, excursões, locações, transporte, congressos, seminários, eventos, visitas técnicas, uniforme, alimentação, material didático, práticas de laboratório, segundas chamadas, dependências, recuperação, reforço e segundas vias de documentos.

a - A CONTRATADA não oferece estacionamento ao CONTRATANTE ou a terceiros e não assume a guarda de veículos, acessórios ou objetos deixados em seu interior, sem prejuízo das responsabilidades legais que não possam ser afastadas.

PARÁGRAFO 8º - É facultado ao CONTRATANTE realizar pagamento antecipado, integral ou parcial, nos termos das condições financeiras registradas.

A) - Se houver pagamento antecipado e posterior desistência ou transferência, a devolução será calculada proporcionalmente aos serviços não prestados, a partir do protocolo, com eventual retenção de {{regras.percentualCancelamento}}% somente quando juridicamente válida e expressamente aprovada.

PARÁGRAFO 9º - A matrícula realizada fora do prazo não altera, por si só, o valor canônico contratado, ressalvado acordo expresso e legalmente permitido.

PARÁGRAFO 10º - A CONTRATADA não é obrigada a deferir matrícula ou rematrícula fora do prazo quando inexistir disponibilidade acadêmica ou quando não forem preenchidos os requisitos legais e contratuais.

PARÁGRAFO 11º - Para aproveitamento de estudos, o CONTRATANTE deverá apresentar histórico escolar, matriz curricular, conteúdos programáticos e demais documentos solicitados para análise comparativa.

a - Se o aproveitamento for deferido, o CONTRATANTE ficará dispensado dos componentes expressamente reconhecidos.

b - O impacto financeiro do aproveitamento seguirá a proporcionalidade, a legislação e as condições formalmente registradas para a matrícula.

c - O abatimento, quando devido, limitar-se-á aos componentes dispensados e não afastará outras obrigações legítimas do contrato.

d - A ausência dos documentos necessários no período de matrícula ou rematrícula poderá impedir a análise até a regularização.

CLÁUSULA 7ª - A CONTRATADA poderá conceder descontos individuais ou coletivos, contínuos ou incidentes sobre parcela específica. A concessão não caracteriza novação nem garante renovação automática, e qualquer redução ou cancelamento observará a oferta, a comunicação prévia, a boa-fé e a legislação aplicável.

PARÁGRAFO 1º - Em emergência sanitária ou outra situação reconhecida pelos órgãos competentes que impeça atividades presenciais, poderão ser ofertadas atividades telepresenciais ou remotas autorizadas. Eventual recusa, cancelamento, desconto ou recomposição será tratado conforme a legislação e as condições acadêmicas aplicáveis, sem reproduzir automaticamente regras temporárias já revogadas.

CLÁUSULA 8ª - Em caso de reprovação em componente curricular, a reoferta, a dependência e o respectivo valor observarão a carga horária do componente, o plano pedagógico, a legislação e as condições financeiras previamente informadas.

PARÁGRAFO 1º - O componente reprovado poderá ser cursado no semestre e nos horários disponibilizados pela CONTRATADA, respeitados os requisitos acadêmicos.

PARÁGRAFO 2º - Quando não houver oferta imediata ou formação da turma mínima, o CONTRATANTE aguardará a próxima oferta compatível, sem prejuízo da informação clara sobre cronograma e alternativas acadêmicas.

PARÁGRAFO 3º - A rematrícula após reprovação dependerá do atendimento aos requisitos acadêmicos, documentais e financeiros legítimos previstos neste contrato e na legislação.

CLÁUSULA 9ª - A CONTRATADA não se responsabiliza pela guarda de pertences e objetos pessoais trazidos pelo CONTRATANTE às dependências institucionais ou às atividades externas, ressalvadas as responsabilidades legais decorrentes de sua própria conduta.

CLÁUSULA 10ª - A reprovação não elimina o pagamento dos serviços contratados e disponibilizados. Eventual ampliação da duração do curso, dependência ou reposição somente gerará cobrança adicional quando acadêmica e juridicamente cabível, previamente informada e aceita.

CLÁUSULA 11ª - No inadimplemento, correção monetária, multa, juros e demais encargos serão exclusivamente os constantes das condições financeiras canônicas — {{financeiro.condicoes}} — e observarão os limites legais, o instrumento de cobrança e a data da efetiva quitação.

CLÁUSULA 12ª - Verificado o inadimplemento, a CONTRATADA poderá adotar medidas graduais e proporcionais de comunicação e cobrança.

I - A CONTRATADA poderá comunicar o atraso por telefone, meio postal, correio eletrônico ou canal institucional, respeitando a privacidade e a legislação.

II - A mora poderá afetar a renovação para período letivo subsequente somente nas hipóteses e nos limites permitidos pela legislação educacional e consumerista.

III - Persistindo o débito, poderão ser utilizados meios administrativos, extrajudiciais ou judiciais legalmente cabíveis, inclusive protesto ou comunicação a serviços de proteção ao crédito, sempre após os requisitos de notificação e proteção de dados.

PARÁGRAFO 1º - Despesas de cobrança e honorários de referência de {{regras.honorariosCobrancaPercentual}}% somente serão exigíveis quando efetivamente cabíveis, comprovados, proporcionais e autorizados pela legislação ou por decisão competente.

PARÁGRAFO 2º - Informações financeiras somente serão compartilhadas com terceiros para finalidades legítimas de execução do contrato, cobrança ou cumprimento legal, com base jurídica, transparência, segurança e observância integral da LGPD.

CLÁUSULA 13ª - Na matrícula ou rematrícula, o CONTRATANTE informará condições de saúde e necessidades específicas relevantes para a prestação educacional segura e acessível, sem discriminação e com tratamento protegido dos dados sensíveis.

PARÁGRAFO 1º - Atendimentos clínicos, médicos ou hospitalares individualizados não integram automaticamente o preço educacional, ressalvados os deveres legais de acessibilidade, segurança, primeiros socorros e atendimento emergencial.

PARÁGRAFO 2º - Quando necessário ao atendimento educacional, poderão ser solicitados laudos ou relatórios pertinentes, limitados ao mínimo necessário e protegidos pela legislação de dados pessoais.

PARÁGRAFO 3º - O CONTRATANTE poderá indicar contato, clínica ou hospital preferencial e informar restrições a medicamentos. Em emergência e na impossibilidade de seguir a indicação, a CONTRATADA poderá acionar o serviço adequado mais próximo e comunicar o responsável.

PARÁGRAFO 4º - Despesas pessoais de saúde e de participação serão atribuídas conforme a legislação, o dever de informação e a responsabilidade de cada parte, sem transferência automática de obrigações institucionais.

CLÁUSULA 14ª - O material didático e os recursos pedagógicos serão definidos segundo a autonomia acadêmica da CONTRATADA, o projeto do curso e a legislação. Materiais de aquisição obrigatória deverão ser previamente informados, com indicação clara de custo e alternativas legalmente exigidas.

PARÁGRAFO 1º - Livros, apostilas, aulas e demais materiais são protegidos pela legislação autoral. Sua reprodução ou distribuição dependerá de autorização ou de hipótese legal, preservadas as exceções e limitações previstas em lei.

CLÁUSULA 15ª - A CONTRATADA poderá disponibilizar acervo bibliográfico físico ou digital, com quantidade de empréstimos, prazos e regras de conservação publicados nos canais institucionais.

PARÁGRAFO 1º - O acesso às dependências acadêmicas e à biblioteca poderá exigir identificação acadêmica emitida pela CONTRATADA, válida durante o vínculo e fornecida nas condições institucionais aplicáveis.

PARÁGRAFO 2º - A não devolução de publicação no prazo poderá gerar multa diária de {{regras.multaBibliotecaDia}} por exemplar, desde que a regra esteja vigente, publicada e em conformidade com a legislação.

PARÁGRAFO 3º - A contagem do prazo e da multa seguirá o regulamento de biblioteca informado ao CONTRATANTE, considerando dias úteis ou corridos conforme previsão expressa e legalmente válida.

CLÁUSULA 16ª - O uso de voz e imagem do CONTRATANTE ou do aluno dependerá de finalidade determinada, base legal ou consentimento específico quando exigido, transparência e respeito à LGPD. A autorização de divulgação institucional, quando aplicável, será livre, destacada, revogável nos limites legais e não condicionará indevidamente a prestação educacional.

CLÁUSULA 17ª - O presente contrato é pessoal e intransferível. A renovação de matrícula para semestre subsequente dependerá do cumprimento dos requisitos acadêmicos, documentais e financeiros legítimos, sem afastar os direitos previstos em lei.

CLÁUSULA 18ª - Será preservado o equilíbrio contratual se alteração legislativa ou normativa modificar a equação acadêmica ou econômico-financeira, mediante informação, justificativa e instrumentos de revisão legalmente cabíveis.

CLÁUSULA 19ª - O contrato vigorará durante o período acadêmico e financeiro nele definido e poderá ser rescindido nos termos deste instrumento e da legislação.

PARÁGRAFO ÚNICO - Tolerância ou transigência ocasional não implicará novação, perdão, renúncia ou alteração automática deste instrumento, sendo preservado o direito de exigir o cumprimento futuro das obrigações legítimas.

CLÁUSULA 20ª - O CONTRATANTE responsabiliza-se civil e criminalmente pelos prejuízos decorrentes da apresentação dolosa de documentos ou informações falsas, assegurados o devido processo, a apuração e as hipóteses legais.

CLÁUSULA 21ª – DA CERTIFICAÇÃO - Cumpridos integralmente os requisitos de aproveitamento, frequência, estágio e documentação do curso, a CONTRATADA emitirá o certificado de conclusão em formato físico ou digital, conforme padrão, registro e prazos institucionais e legais.

CLÁUSULA 22ª – CONTRATANTE e CONTRATADA comprometem-se a observar integralmente a Lei nº 13.709/2018, as demais normas de proteção de dados e os direitos dos titulares, adotando medidas adequadas de segurança, transparência, retenção e atendimento.

CLÁUSULA 23ª - Eventual foro contratual será interpretado sem afastar o foro legalmente competente e os direitos do consumidor. Para as hipóteses em que a eleição seja válida, fica indicado o Foro da Comarca de Japoatã, Estado de Sergipe.

CLÁUSULA 24ª - As partes reconhecem a eficácia do presente instrumento e sua força executiva somente quando preenchidos os requisitos legais, preservados o contraditório, a legislação consumerista e os demais direitos indisponíveis.
$minuta$,
    'destaquesCriticos', jsonb_build_array(
      'devolução do valor pago a título de matrícula',
      'antecedência de referência de {{regras.prazoRematriculaDias}} dias',
      'Quantidade prevista de parcelas: {{financeiro.quantidadeParcelas}}',
      'percentual contratual de {{regras.percentualCancelamento}}%',
      'retenção da matrícula e o percentual de {{regras.percentualCancelamento}}%',
      'não autoriza cobrança automática integral fora desses limites',
      'correção monetária, multa, juros e demais encargos',
      'emitirá o certificado de conclusão'
    ),
    'destaquesAtencao', jsonb_build_array(
      'É devido pelo CONTRATANTE no caso de pedido de desistência',
      'Em caso de desistência, cancelamento, suspensão ou interrupção e transferência do curso',
      'No primeiro dia de aula ou após o primeiro dia'
    ),
    'regrasDinamicas', jsonb_build_object(
      'minimoAlunosTurma', 35,
      'prazoReembolsoDiasUteis', 10,
      'prazoRematriculaDias', 45,
      'percentualCancelamento', 10,
      'frequenciaEstagioObrigatoria', 100,
      'frequenciaTeoricaMinima', 75,
      'cargaSaudeColetiva', '40 horas',
      'honorariosCobrancaPercentual', 20,
      'multaBibliotecaDia', 'R$ 2,00'
    ),
    'rodape', E'Japoatã/SE, {{emissao.data}}.\n\nCONTRATANTE: ____________________________\nCONTRATADA: ____________________________\n\nTestemunha 1: ____________________________\nTestemunha 2: ____________________________',
    'observacaoEscopo', 'Minuta integral reconciliada com o PDF recebido em 09/08/2026. Revisão jurídica obrigatória antes de aprovar, especialmente cancelamento, retenção, encargos, cobrança, imagem, PCD, foro e força executiva.',
    'fonte', 'MINUTA_TECNICA',
    'presentationVersion', 'CONTRATO_A4_INSTITUCIONAL_V3_MINUTA_COMPLETA',
    'marcaDagua', jsonb_build_object(
      'habilitada', true,
      'intensidade', 'SUAVE',
      'origem', 'POLO_EMISSOR'
    ),
    'qr', jsonb_build_object(
      'habilitado', true,
      'rotulo', 'Validar documento',
      'caminhoValidacao', '/validador',
      'modoValidade', 'SEM_VENCIMENTO',
      'diasValidade', null
    ),
    'sourceDocument', jsonb_build_object(
      'filename', 'MINUTA - CONTRATOS ALUNOS 2.pdf',
      'sha256', '62c376b408d98d14d5d812b744854e7deb6b37df280b08119b0c2edc8b2b3e20',
      'sourceDocxSha256', 'b4df5b33631bd25411242f64f1dcaf3ea12bd03e4d8f5c3c21574fb2941a670e'
    )
  );

  update public.documentos_modelos_configuracoes model
  set revisao = 4,
      status = 'EM_REVISAO',
      conteudo = v_content,
      atualizado_por = null,
      updated_at = now()
  where model.template_key = 'contrato_aluno'
    and model.modalidade = 'TECNICO';

  insert into public.documentos_modelos_historico (
    template_key,
    modalidade,
    revisao,
    status,
    conteudo,
    atualizado_por,
    request_id
  ) values (
    'contrato_aluno',
    'TECNICO',
    4,
    'EM_REVISAO',
    v_content,
    null,
    null
  );
end;
$create_full_contract_draft$;

commit;
