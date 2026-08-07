-- Cria Radiologia T-01 na matriz e importa alunos sem Auth, e-mail ou financeiro.
-- O período acompanha a coorte técnica da matriz iniciada em 07/02/2026.

do $migration$
declare
  v_source jsonb := $source$[{"linha":2,"turma_origem":"TÉC. RADIOLOGIA T-01 INT","nome":"ADILEIDE DOS SANTOS CRUZ","cpf":"07010188521","email":"adileidesantosc@gmail.com","telefone":"(79) 99136-4793","data_nascimento":"1995-05-05","data_matricula":"2026-04-22","endereco":"RUA DA ROCHEIRA","bairro":"CENTRO","cidade":"SANTANA DO SÃO FRANCISCO","uf":"SE","cep":"49985000","sexo":"F","rg":"35093676","orgao_emissor":"SSP","rg_uf_emissao":null,"tipo_documento":"RG (ANTIGO)","nome_mae":"MARILEIDE DOS SANTOS CRUZ","nome_pai":"CICERO SANTOS CRUZ","nacionalidade":"BRASILEIRA","naturalidade":"ARACAJU","certidao_tipo":"NASCIMENTO","certidao_modelo":"ANTIGO","certidao_termo":"39382","certidao_livro":"A-48","certidao_folha":"126"},{"linha":3,"turma_origem":"TÉC. RADIOLOGIA T-01 INT","nome":"ANTONNY RUAN CARDOSO BARBOSA","cpf":"11487333536","email":"11487333536@proesc.com","telefone":null,"data_nascimento":"2008-11-23","data_matricula":"2026-04-22","endereco":"RUA: DOUTOR ERONILDES DE CARVALHO","bairro":"CENTRO","cidade":"NEÓPOLIS","uf":"SE","cep":"49980000","sexo":"M","rg":"114.873.335-36","orgao_emissor":"SSP/SE","rg_uf_emissao":"SE","tipo_documento":"CARTEIRA NACIONAL DE IDENTIFICAÇÃO","nome_mae":"JACYELMA CARDOSO DOS SANTOS","nome_pai":"JANISSON DA SILVA BARBOSA","nacionalidade":"BRASILEIRA","naturalidade":"NEÓPOLIS","certidao_tipo":"NASCIMENTO","certidao_modelo":"NOVO","certidao_matricula":"11011401552008100065053004567098"},{"linha":4,"turma_origem":"TÉC. RADIOLOGIA T-01 INT","nome":"BÁRBARA BEATRIZ DOS SANTOS SILVA","cpf":"08901526590","email":"beatrizbabinha08@gmail.com","telefone":"(79) 99970-0022","data_nascimento":"2000-06-08","data_matricula":"2026-04-11","endereco":"RUA: \"D\"","bairro":"CENTRO","cidade":"PROPRIÁ","uf":"SE","cep":"49900000","sexo":"F","rg":"089.015.265-90","orgao_emissor":"SSP/SE","rg_uf_emissao":"SE","tipo_documento":"CARTEIRA NACIONAL DE IDENTIFICAÇÃO","nome_mae":"SONIA SANTOS PONTES","nome_pai":"CARLOS KLEBER DA SILVA","nacionalidade":"BRASILEIRA","naturalidade":"PROPRIÁ","certidao_tipo":"NASCIMENTO","certidao_modelo":"NOVO","certidao_matricula":"11098101552000100031205002840747"},{"linha":5,"turma_origem":"TÉC. RADIOLOGIA T-01 INT","nome":"BRENO NUNES DOS SANTOS","cpf":"10061620548","email":"brenoprodutivo@gmail.com","telefone":"(79) 99922-7701","data_nascimento":"2004-06-16","data_matricula":"2026-06-17","endereco":"AVENIDA ABRAÃO FREIRE","bairro":"CENTRO","cidade":"AMPARO DE SÃO FRANCISCO","uf":"SE","cep":"49920000","sexo":"M","rg":null,"orgao_emissor":null,"rg_uf_emissao":null,"tipo_documento":"RG (ANTIGO)","nome_mae":"GILVANIA DOS SANTOS","nome_pai":"JOSÉ ROBERTO NUNES","nacionalidade":"BRASILEIRA","naturalidade":"ARACAJU"},{"linha":6,"turma_origem":"TÉC. RADIOLOGIA T-01 INT","nome":"CAMILA ALVES DOS SANTOS NASCIMENTO","cpf":"02900059577","email":"camilajapoata88@gmail.com","telefone":"(79) 99873-6328","data_nascimento":"1988-06-06","data_matricula":"2026-03-04","endereco":"RUA EUGENIO BEZERRA","bairro":"CENTRO","cidade":"JAPOATÃ","uf":"SE","cep":"49950000","sexo":"F","rg":"20453400","orgao_emissor":"SSP/SE","rg_uf_emissao":"SE","tipo_documento":"RG (ANTIGO)","nome_mae":"PAULO ALVES DOS SANTOS","nome_pai":"OGITA DOS SANTOS","nacionalidade":"BRASILEIRA","naturalidade":"SÃO VICENTE"},{"linha":7,"turma_origem":"TÉC. RADIOLOGIA T-01 INT","nome":"ELOÍSA BARRETO VITAL","cpf":"08214707528","email":"eloizabarreto18@gmail.com","telefone":"(79) 99647-5541","data_nascimento":"2000-11-08","data_matricula":"2026-03-04","endereco":"TRAVESSA SÃO LUIZ","bairro":null,"cidade":"ILHA DAS FLORES","uf":"SE","cep":"49990000","sexo":"F","rg":"082.147.075-28","orgao_emissor":"SSP/SE","rg_uf_emissao":"SE","tipo_documento":"CARTEIRA NACIONAL DE IDENTIFICAÇÃO","nome_mae":"RITA ANDRÉA PEREIRA BARRETO","nome_pai":"EDIVILSON LESSA VITAL","nacionalidade":"BRASILEIRA","naturalidade":"PENEDO","certidao_tipo":"NASCIMENTO","certidao_modelo":"NOVO","certidao_matricula":"11071801552000100018257001623118"},{"linha":8,"turma_origem":"TÉC. RADIOLOGIA T-01 INT","nome":"FABIO PEREIRA LIMA","cpf":"06502751440","email":"fabioplima16@gmail.com","telefone":"(82) 99670-3146","data_nascimento":"1985-08-01","data_matricula":"2026-06-05","endereco":"AVENIDA DE MARIO VIEIRA DANTAS","bairro":"CENTRO","cidade":"PORTO REAL DO COLÉGIO","uf":"AL","cep":"57290000","sexo":"M","rg":"3.021.102-6","orgao_emissor":"SSP/AL","rg_uf_emissao":"AL","tipo_documento":"RG (ANTIGO)","nome_mae":"MARLENE PEREIRA LIMA","nome_pai":null,"nacionalidade":"BRASILEIRA","naturalidade":"SÃO PAULO"},{"linha":9,"turma_origem":"TÉC. RADIOLOGIA T-01 INT","nome":"GILVANICE DOS SANTOS","cpf":"06007340562","email":"gilvanicesantos21@gmail.com","telefone":"(79) 99852-6528","data_nascimento":"1990-07-27","data_matricula":"2026-03-27","endereco":"AVENIDA GOVERNADOR VALADARES","bairro":"CENTRO","cidade":"MALHADA DOS BOIS","uf":"SE","cep":"49940000","sexo":"F","rg":"03.517.610-5","orgao_emissor":"SSP/SE","rg_uf_emissao":"SE","tipo_documento":"RG (ANTIGO)","nome_mae":"IZAURA SOUZA SANTOS","nome_pai":"JOSÉ EDIVALDO DOS SANTOS","nacionalidade":"BRASILEIRA","naturalidade":"PROPRIÁ","certidao_tipo":"NASCIMENTO","certidao_modelo":"NOVO","certidao_matricula":"11050201551990100004234000294819"},{"linha":10,"turma_origem":"TÉC. RADIOLOGIA T-01 INT","nome":"JAIENE DA SILVA SANTOS","cpf":"06260044542","email":"jaienesilva19@gmail.com","telefone":"(79) 99817-3990","data_nascimento":"1996-08-18","data_matricula":"2026-04-18","endereco":"ASSENTAMENTO MARIA JOANA HERMINIA","bairro":"AREA RURAL","cidade":"SÃO FRANCISCO","uf":"SE","cep":"49945000","sexo":"F","rg":"2.597.069","orgao_emissor":"SSP/SE","rg_uf_emissao":"SE","tipo_documento":"RG (ANTIGO)","nome_mae":"MARIA ANTONIA DA SILVA","nome_pai":"MANOEL DOS SANTOS","nacionalidade":"BRASILEIRA","naturalidade":"ARACAJU","certidao_tipo":"NASCIMENTO","certidao_modelo":"ANTIGO","certidao_termo":"1900","certidao_livro":"05","certidao_folha":"267"},{"linha":11,"turma_origem":"TÉC. RADIOLOGIA T-01 INT","nome":"JANAINA STEFANNY RAMOS","cpf":"07390799560","email":"07390799560@proesc.com","telefone":"(79) 99689-5034","data_nascimento":"1996-06-21","data_matricula":"2026-04-22","endereco":"RUA: SÃO FÉLIX","bairro":"CENTRO","cidade":"JAPOATÃ","uf":"SE","cep":"49950000","sexo":"F","rg":"073.907.995-60","orgao_emissor":"SSP/SE","rg_uf_emissao":"SE","tipo_documento":"CARTEIRA NACIONAL DE IDENTIFICAÇÃO","nome_mae":"MARIA EDILDE RAMOS","nome_pai":null,"nacionalidade":"BRASILEIRA","naturalidade":"ARACAJU"},{"linha":12,"turma_origem":"TÉC. RADIOLOGIA T-01 INT","nome":"JESSICA POSSIDONIO BATISTA","cpf":"04820386590","email":"jessicapossidonio299@gmail.com","telefone":"(79) 99970-1629","data_nascimento":"1990-09-13","data_matricula":"2026-04-11","endereco":"RESIDENCIAL BELA VISTA","bairro":"CENTRO","cidade":"PROPRIÁ","uf":"SE","cep":"49900000","sexo":"F","rg":"048.203.865-90","orgao_emissor":"SSP/SE","rg_uf_emissao":"SE","tipo_documento":"CARTEIRA NACIONAL DE IDENTIFICAÇÃO","nome_mae":"GISÊLIA POSSIDONIO NETO","nome_pai":"JOSÉ CARLOS BATISTA","nacionalidade":"BRASILEIRA","naturalidade":"SÃO PAULO"},{"linha":13,"turma_origem":"TÉC. RADIOLOGIA T-01 INT","nome":"JÚLIA REGINA SOARES DA ROCHA","cpf":"12386401502","email":"julia.regina2@icloud.com","telefone":"(79) 99918-7122","data_nascimento":"2008-02-08","data_matricula":"2026-01-23","endereco":"RUA: ERONILDES DE CARVALHO","bairro":"CENTRO","cidade":"AMPARO DE SÃO FRANCISCO","uf":"SE","cep":"49920000","sexo":"F","rg":"09.435.331-0","orgao_emissor":"SSP/SE","rg_uf_emissao":"SE","tipo_documento":"RG (ANTIGO)","nome_mae":"JAQUELINE SOARES SANTANA","nome_pai":"JOSÉ ORMINIO DA ROCHA JÚNIOR","nacionalidade":"BRASILEIRA","naturalidade":"ARACAJU"},{"linha":14,"turma_origem":"TÉC. RADIOLOGIA T-01 INT","nome":"KALYNE MATOS DA SILVEIRA","cpf":"10576248533","email":"kalynematos965@gmail.com","telefone":"(79) 99999-9887","data_nascimento":"2002-07-31","data_matricula":"2026-05-30","endereco":"RUA: DA CAIXA D' ÁGUA","bairro":"CENTRO","cidade":"NOSSA SENHORA DE LOURDES","uf":"SE","cep":"49890000","sexo":"F","rg":null,"orgao_emissor":null,"rg_uf_emissao":null,"tipo_documento":"RG (ANTIGO)","nome_mae":"MARAIZA VIEIRA MATOS","nome_pai":"JOSÉ GUILHERME DA SILVEIRA","nacionalidade":"BRASILEIRA","naturalidade":"NOSSA SENHORA DA GLÓRIA","certidao_tipo":"NASCIMENTO","certidao_modelo":"NOVO","certidao_matricula":"11012201552003100029088001186921"},{"linha":15,"turma_origem":"TÉC. RADIOLOGIA T-01 INT","nome":"LUANA MIRELLY CALUMBY DOS SANTOS","cpf":"13336413540","email":"luanacalumby890@gmail.com","telefone":"(79) 99949-6153","data_nascimento":"2007-12-28","data_matricula":"2026-03-04","endereco":"TRAVESSA SÃO LUÍZ","bairro":"CENTRO","cidade":"ILHA DAS FLORES","uf":"SE","cep":"49990000","sexo":"F","rg":"133.364.135-40","orgao_emissor":"SSP/SE","rg_uf_emissao":"SE","tipo_documento":"CARTEIRA NACIONAL DE IDENTIFICAÇÃO","nome_mae":"JANDIRALVES CALUMBY DA SILVA","nome_pai":"JANILSON FRANÇA DOS SANTOS FILHO","nacionalidade":"BRASILEIRA","naturalidade":"CAPELA","certidao_tipo":"NASCIMENTO","certidao_modelo":"NOVO","certidao_matricula":"11008001552008100024131001769958"},{"linha":16,"turma_origem":"TÉC. RADIOLOGIA T-01 INT","nome":"LUIZA FERREIRA TOJAL","cpf":"11281114545","email":"tojalluiza@gmail.com","telefone":null,"data_nascimento":"2009-10-02","data_matricula":"2026-04-10","endereco":"POV. TERRA VERMELHA, SÍTIO XEXÉU","bairro":"ÁREA RURAL","cidade":"BREJO GRANDE","uf":"SE","cep":"49995000","sexo":"F","rg":"112.811.145-45","orgao_emissor":"SSP/SE","rg_uf_emissao":"SE","tipo_documento":"CARTEIRA NACIONAL DE IDENTIFICAÇÃO","nome_mae":"FLÁVIA RIBEIRO TOJAL FERREIRA","nome_pai":"CARLOS EDUARDO SANTOS FERREIRA","nacionalidade":"BRASILEIRA","naturalidade":"ARACAJU"},{"linha":17,"turma_origem":"TÉC. RADIOLOGIA T-01 INT","nome":"MATHEUS RYCHARD DE JESUS CABRAL","cpf":"11740220510","email":"matheusrychard638@gmail.com","telefone":null,"data_nascimento":"2009-10-10","data_matricula":"2026-04-10","endereco":"RUA: AUGUSTO MAYNARD GOMES","bairro":"CENTRO","cidade":"NEÓPOLIS","uf":"SE","cep":"49980000","sexo":"M","rg":"4.135.080-4","orgao_emissor":"SSP/SE","rg_uf_emissao":"SE","tipo_documento":"RG (ANTIGO)","nome_mae":"MARIA ANDRESA DE JESUS CABRAL","nome_pai":"ROLAND ALVES DE SOUZA JÚNIOR","nacionalidade":"BRASILEIRA","naturalidade":"ARACAJU"},{"linha":18,"turma_origem":"TÉC. RADIOLOGIA T-01 INT","nome":"MELICIO DOS SANTOS FILHO","cpf":"00762345500","email":"00762345500@proesc.com","telefone":"(79) 99640-7961","data_nascimento":"1984-09-02","data_matricula":"2026-06-19","endereco":"RUA: F","bairro":"CENTRO","cidade":"NEÓPOLIS","uf":"SE","cep":"49980000","sexo":"M","rg":"3.146.848-9","orgao_emissor":"SSP/SE","rg_uf_emissao":"SE","tipo_documento":"RG (ANTIGO)","nome_mae":"LEULIRA DOS SANTOS","nome_pai":"MELICIO DOS SANTOS","nacionalidade":"BRASILEIRA","naturalidade":"PENEDO"},{"linha":19,"turma_origem":"TÉC. RADIOLOGIA T-01 INT","nome":"NATALY MARIA SANTOS","cpf":"08990447518","email":"natalymaria296@gmail.com","telefone":"(79) 99898-6226","data_nascimento":"2007-12-25","data_matricula":"2026-02-06","endereco":"RUA: EUGÊNIO BEZERRA","bairro":"CENTRO","cidade":"JAPOATÃ","uf":"SE","cep":"49950000","sexo":"F","rg":"089.904.475-18","orgao_emissor":"SSP/SE","rg_uf_emissao":"SE","tipo_documento":"CARTEIRA NACIONAL DE IDENTIFICAÇÃO","nome_mae":"CELIA MARIA SANTOS","nome_pai":"JOSÉ RAIMUNDO DOS SANTOS","nacionalidade":"BRASILEIRA","naturalidade":"JAPOATÃ","certidao_tipo":"NASCIMENTO","certidao_modelo":"ANTIGO","certidao_termo":"14557","certidao_livro":"A-21","certidao_folha":"283"},{"linha":20,"turma_origem":"TÉC. RADIOLOGIA T-01 INT","nome":"PEDRO HENRIQUE SANT\" ANA DA CRUZ","cpf":"10285274546","email":"p773260@gmail.com","telefone":null,"data_nascimento":"2008-04-21","data_matricula":"2026-03-03","endereco":"RUA: SANTO ANTÕNIO","bairro":"CENTRO","cidade":"SANTANA DO SÃO FRANCISCO","uf":"SE","cep":"49985000","sexo":"M","rg":"102.852.745-46","orgao_emissor":"SSP/SE","rg_uf_emissao":"SE","tipo_documento":"CARTEIRA NACIONAL DE IDENTIFICAÇÃO","nome_mae":"MÁRCIA DA SILVA SANT\" ANA CRUZ","nome_pai":"LUÍS FERNANDO SANT \"ANA DA CRUZ","nacionalidade":"BRASILEIRA","naturalidade":"NEÓPOLIS"},{"linha":21,"turma_origem":"TÉC. RADIOLOGIA T-01 INT","nome":"RENIVAN SANTOS SOUZA E SILVA","cpf":"96377488572","email":"renivansouza@hotmail.com","telefone":"(79) 99885-6625","data_nascimento":"1978-09-08","data_matricula":"2026-02-06","endereco":"RUA: PACATUBA","bairro":"CENTRO","cidade":"JAPOATÃ","uf":"SE","cep":"49950000","sexo":"M","rg":"963.774.885-72","orgao_emissor":"SSP/SE","rg_uf_emissao":"SE","tipo_documento":"CARTEIRA NACIONAL DE IDENTIFICAÇÃO","nome_mae":"MARIA RITA SANTOS SOUZA","nome_pai":"JOÃO VIEIRA DE SOUZA","nacionalidade":"BRASILEIRA","naturalidade":"JAPOATÃ"},{"linha":22,"turma_origem":"TÉC. RADIOLOGIA T-01 INT","nome":"ROBERT LEVI NUNES DOS SANTOS","cpf":"10061552526","email":"robertlevipro10@gmail.com","telefone":"(79) 99132-8625","data_nascimento":"2006-11-13","data_matricula":"2026-06-11","endereco":"AVENIDA ABRAÃO FREIRE","bairro":"CENTRO","cidade":"AMPARO DE SÃO FRANCISCO","uf":"SE","cep":"49920000","sexo":"M","rg":null,"orgao_emissor":null,"rg_uf_emissao":null,"tipo_documento":"RG (ANTIGO)","nome_mae":"GILVANIA DOS SANTOS","nome_pai":"JOSÉ ROBERTO NUNES","nacionalidade":"BRASILEIRA","naturalidade":"ARACAJU"},{"linha":23,"turma_origem":"TÉC. RADIOLOGIA T-01 INT","nome":"RONALDO VIEIRA DOS SANTOS","cpf":"00875866573","email":"ronaldojpvieira@gmail.com","telefone":"(79) 99629-4901","data_nascimento":"1981-10-29","data_matricula":"2026-05-09","endereco":"POVOADO TENÓRIO","bairro":"AREA RURAL","cidade":"NEÓPOLIS","uf":"SE","cep":"49980000","sexo":"M","rg":"31469205","orgao_emissor":"SSP/SE","rg_uf_emissao":"SE","tipo_documento":"RG (ANTIGO)","nome_mae":"GILVANETE VIEIRA SANTOS","nome_pai":"ARNALDO DOS SANTOS","nacionalidade":"BRASILEIRA","naturalidade":"PROPRIÁ","certidao_tipo":"NASCIMENTO","certidao_modelo":"ANTIGO","certidao_termo":"12776","certidao_livro":"14","certidao_folha":"147"},{"linha":24,"turma_origem":"TÉC. RADIOLOGIA T-01 INT","nome":"SAULO DA SILVA BALBINO","cpf":"07280727506","email":"balbinosaulo302@gmail.com","telefone":"(79) 99800-7174","data_nascimento":"2005-09-05","data_matricula":"2026-03-13","endereco":"RUA: JUVENAL MELO","bairro":"CENTRO","cidade":"JAPOATÃ","uf":"SE","cep":"49950000","sexo":"M","rg":"072.807.275-06","orgao_emissor":"SSP/SE","rg_uf_emissao":"SE","tipo_documento":"CARTEIRA NACIONAL DE IDENTIFICAÇÃO","nome_mae":"ELIANE DA SILVA","nome_pai":"REGINALDO BALBINO DOS SANTOS","nacionalidade":"BRASILEIRA","naturalidade":"NEÓPOLIS"},{"linha":25,"turma_origem":"TÉC. RADIOLOGIA T-01 INT","nome":"VERÔNICA LAIZA SANTOS BATISTA","cpf":"06265755595","email":"verabatista46@gmail.com","telefone":"(79) 99856-7972","data_nascimento":"1992-05-25","data_matricula":"2026-01-28","endereco":"CONJ. BEZERRA CALDAS","bairro":"CENTRO","cidade":"JAPOATÃ","uf":"SE","cep":"49950000","sexo":"F","rg":"2.684.195-9","orgao_emissor":"SSP/SE","rg_uf_emissao":"SE","tipo_documento":"RG (ANTIGO)","nome_mae":"MARIA JOSÉ SANTOS BATISTA","nome_pai":"JOSÉ CARLOS REZENDE BATISTA","nacionalidade":"BRASILEIRA","naturalidade":"ARACAJU"},{"linha":26,"turma_origem":"TÉC. RADIOLOGIA T-01 INT","nome":"VIVIANE FREIRE BRASIL","cpf":"04968130562","email":"vivianefreirebrasil@gmail.com","telefone":"(79) 99905-2947","data_nascimento":"1988-12-24","data_matricula":"2026-07-09","endereco":"POV. CRUZ DA DONZELA , SÍTIO.","bairro":"ÁREA RURAL","cidade":"MALHADA DOS BOIS","uf":"SE","cep":"49940000","sexo":"F","rg":null,"orgao_emissor":null,"rg_uf_emissao":null,"tipo_documento":"RG (ANTIGO)","nome_mae":"LAURA BRASIL GONÇALVES","nome_pai":"JOSÉ ELIAS FREIRE","nacionalidade":"BRASILEIRA","naturalidade":null},{"linha":27,"turma_origem":"TÉC. RADIOLOGIA T-01 INT","nome":"WALASY SANTOS MELO","cpf":"08649337546","email":"walasysantos@gmail.com","telefone":"(79) 99862-5087","data_nascimento":"1998-04-12","data_matricula":"2026-05-16","endereco":"RUA: MANOEL CANDIDO","bairro":"CENTRO","cidade":"PROPRIÁ","uf":"SE","cep":"49900000","sexo":"M","rg":"7.101.182-0","orgao_emissor":"SSP/SE","rg_uf_emissao":"SE","tipo_documento":"RG (ANTIGO)","nome_mae":"MARIA REJANE DOS SANTOS","nome_pai":"ERIOSVALDO OLIVEIRA MELO","nacionalidade":"BRASILEIRA","naturalidade":"ARACAJU","certidao_tipo":"NASCIMENTO","certidao_modelo":"NOVO","certidao_matricula":"11098101551998100030163002704077"}]$source$::jsonb;
  v_turma public.turmas%rowtype;
  v_row record;
  v_parceiro_id uuid;
  v_curso_id uuid;
  v_polo_id uuid;
  v_turma_criada boolean := false;
begin
  if jsonb_array_length(v_source) <> 26 then
    raise exception 'A importação Radiologia T-01 exige exatamente 26 registros.';
  end if;

  perform pg_advisory_xact_lock(hashtext('importacao-rad-t01-20260726'));

  select id into strict v_curso_id
  from public.cursos
  where nome = 'Técnico em Radiologia' and modalidade = 'TECNICO';

  select id into strict v_polo_id
  from public.polos
  where is_matriz = true and status = 'ativo';

  if not exists (select 1 from public.turmas where codigo='RAD-T01-INT-MAT') then
    insert into public.turmas (
      codigo, nome, curso_id, polo_id, data_inicio, data_previsao_termino,
      turno, status, vagas_totais, gerar_cobrancas_futuras,
      sincronizar_asaas_futuro, obs_financeira_origem
    ) values (
      'RAD-T01-INT-MAT', 'RAD T-01 INT', v_curso_id, v_polo_id,
      date '2026-02-07', date '2028-02-06',
      'INTEGRAL', 'PLANEJADA', 40, false, false,
      'Turma cadastrada a partir de radiologia 01.xls; sem geração automática de financeiro.'
    );
    v_turma_criada := true;
  end if;

  select * into v_turma
  from public.turmas
  where codigo = 'RAD-T01-INT-MAT'
  for update;

  if not found then
    raise exception 'Não foi possível localizar ou criar RAD-T01-INT-MAT.';
  end if;

  if v_turma.polo_id <> v_polo_id or v_turma.curso_id <> v_curso_id then
    raise exception 'RAD-T01-INT-MAT existe com polo ou curso divergente.';
  end if;

  if v_turma_criada then
    perform internal_academic.authorize_transition(
      'TURMA_STATUS', v_turma.id, 'EM_ANDAMENTO'
    );
    update public.turmas
    set status='EM_ANDAMENTO'
    where id=v_turma.id;
    v_turma.status := 'EM_ANDAMENTO';
  end if;

  for v_row in
    select *
    from jsonb_to_recordset(v_source) as s(
      linha integer, turma_origem text, nome text, cpf text, email text,
      telefone text, data_nascimento date, data_matricula date, endereco text,
      bairro text, cidade text, uf text, cep text, sexo text, rg text,
      orgao_emissor text, rg_uf_emissao text, tipo_documento text,
      nome_mae text, nome_pai text, nacionalidade text, naturalidade text,
      certidao_tipo text, certidao_modelo text, certidao_matricula text,
      certidao_termo text, certidao_livro text, certidao_folha text
    )
    order by linha
  loop
    v_parceiro_id := null;

    select p.id into v_parceiro_id
    from public.parceiros p
    where regexp_replace(coalesce(p.cpf_cnpj, ''), '\\D', '', 'g') = v_row.cpf
    order by p.created_at, p.id
    limit 1;

    if v_parceiro_id is null then
      insert into public.parceiros (
        tipo, nome, cpf_cnpj, email, telefone, cep, endereco, bairro, cidade, uf,
        polo_id, status, observacao, data_nascimento, sexo, rg, orgao_emissor,
        nacionalidade, naturalidade, nome_mae, nome_pai, rg_uf_emissao,
        tipo_documento, certidao_tipo, certidao_modelo, certidao_matricula,
        certidao_termo, certidao_livro, certidao_folha
      ) values (
        'Aluno', v_row.nome, v_row.cpf, v_row.email, v_row.telefone, v_row.cep,
        v_row.endereco, v_row.bairro, v_row.cidade, v_row.uf, v_turma.polo_id,
        'ATIVO',
        'Importado de radiologia 01.xls sem criação de usuário Auth e sem financeiro.',
        v_row.data_nascimento, v_row.sexo, v_row.rg, v_row.orgao_emissor,
        coalesce(v_row.nacionalidade, 'BRASILEIRA'), v_row.naturalidade,
        v_row.nome_mae, v_row.nome_pai, v_row.rg_uf_emissao, v_row.tipo_documento,
        v_row.certidao_tipo, v_row.certidao_modelo, v_row.certidao_matricula,
        v_row.certidao_termo, v_row.certidao_livro, v_row.certidao_folha
      )
      returning id into v_parceiro_id;
    end if;

    if not exists (
      select 1 from public.matriculas m
      where m.aluno_id = v_parceiro_id and m.turma_id = v_turma.id
    ) then
      perform internal_academic.authorize_enrollment_upsert(
        v_parceiro_id, v_turma.id, 'PENDENTE'
      );

      insert into public.matriculas (
        aluno_id, turma_id, status, data_matricula, financeiro_herdado,
        gerar_cobranca_inicial, gerar_cobranca_futura, sincronizar_asaas
      ) values (
        v_parceiro_id, v_turma.id, 'PENDENTE',
        v_row.data_matricula::timestamp at time zone 'America/Maceio',
        false, false, false, false
      );
    end if;
  end loop;
end;
$migration$;
