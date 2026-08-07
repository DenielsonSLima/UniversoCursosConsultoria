-- Cria a T46 da matriz e importa seus alunos sem Auth, e-mail ou financeiro.
-- O início usa 25/07/2026, sábado da última matrícula informada no arquivo.

do $migration$
declare
  v_source jsonb := $source$[{"linha":2,"turma_origem":"TÉC ENF. T-46 INT","nome":"ANNIELLI CRISLEY FEITOSA DA SILVA","cpf":"11126142573","email":"anniellicrisley15@gmail.com","telefone":"(79) 99805-1823","data_nascimento":"2006-04-18","data_matricula":"2026-07-09","endereco":"RUA: MÁRIO GONÇALVES, VILA OPERÁRIA, POV. PASSAGEM","bairro":"ÁREA RURAL","cidade":"NEÓPOLIS","uf":"SE","cep":"49980000","sexo":"F","rg":null,"orgao_emissor":null,"rg_uf_emissao":null,"tipo_documento":"RG (ANTIGO)","nome_mae":"ANA CARLA FEITOSA DA SILVA","nome_pai":"CLEZIO SANTOS DA SILVA","nacionalidade":"BRASILEIRA","naturalidade":"CAPELA","certidao_tipo":"NASCIMENTO","certidao_modelo":"NOVO","certidao_matricula":"11011401552006100061073004449038"},{"linha":3,"turma_origem":"TÉC ENF. T-46 INT","nome":"EDILANIA JUCIELE DOS SANTOS","cpf":"05289193502","email":"edilaniajuciele1991@gmail.com","telefone":"(79) 99949-3948","data_nascimento":"1991-11-13","data_matricula":"2026-06-17","endereco":"POV. PROJETO LADEIRINHAS \"A\"","bairro":"ÁREA RURAL","cidade":"JAPOATÃ","uf":"SE","cep":"49950000","sexo":"F","rg":"3460590","orgao_emissor":"SSP/SE","rg_uf_emissao":"SE","tipo_documento":"RG (ANTIGO)","nome_mae":"EDNA MARIA DOS SANTOS","nome_pai":null,"nacionalidade":"BRASILEIRA","naturalidade":"CORURIPE"},{"linha":4,"turma_origem":"TÉC ENF. T-46 INT","nome":"GABRIEL HENRIQUES FERREIRA","cpf":"11000088537","email":"gabrieljphenrique2222@gmail.com","telefone":"(79) 99884-1548","data_nascimento":"2007-05-07","data_matricula":"2026-07-15","endereco":"ESTRADA DAS TABOCAS","bairro":"ÁREA RURAL","cidade":"JAPOATÃ","uf":"SE","cep":"49950000","sexo":"M","rg":"09.427.035-0","orgao_emissor":"SSP/SE","rg_uf_emissao":"SE","tipo_documento":"RG (ANTIGO)","nome_mae":"MARIA VANIA HENRIQUES SANTOS FERREIRA","nome_pai":"GILMAR GOMES FERREIRA","nacionalidade":"BRASILEIRA","naturalidade":"CAPELA"},{"linha":5,"turma_origem":"TÉC ENF. T-46 INT","nome":"IZABELLY BOMFIM SANTOS","cpf":"07686918505","email":"izabellybiza@gmail.com","telefone":"(79) 99674-9788","data_nascimento":"2006-03-22","data_matricula":"2026-07-25","endereco":"RUA: LUIZ GONZAGA MACHADO BARRETO","bairro":"CENTRO","cidade":"NEÓPOLIS","uf":"SE","cep":"49980000","sexo":"F","rg":null,"orgao_emissor":null,"rg_uf_emissao":null,"tipo_documento":"RG (ANTIGO)","nome_mae":"CRISTIANA DOS SANTOS BOMFIM","nome_pai":"CHARLES GOMES SANTOS","nacionalidade":"BRASILEIRA","naturalidade":"NEÓPOLIS","certidao_tipo":"NASCIMENTO","certidao_modelo":"NOVO","certidao_matricula":"11011401552006100061026004444322"},{"linha":6,"turma_origem":"TÉC ENF. T-46 INT","nome":"JOSSIELE DE JESUS SANTOS","cpf":"10857123548","email":"jossielesantos4@gmail.com","telefone":"(79) 98879-0023","data_nascimento":"2005-04-14","data_matricula":"2026-07-09","endereco":"RUA: NOSSA SENHORA DA PAZ","bairro":"CENTRO","cidade":"NEÓPOLIS","uf":"SE","cep":"49980000","sexo":"F","rg":null,"orgao_emissor":null,"rg_uf_emissao":null,"tipo_documento":"RG (ANTIGO)","nome_mae":"MÔNICA SANTOS DE JESUS","nome_pai":"JOSÉ ANTÔNIO SANTOS","nacionalidade":"BRASILEIRA","naturalidade":"CAPELA","certidao_tipo":"NASCIMENTO","certidao_modelo":"NOVO","certidao_matricula":"11011401552005100060006004412500"},{"linha":7,"turma_origem":"TÉC ENF. T-46 INT","nome":"JOYCE PAULA SOUZA DOS SANTOS","cpf":"05864807575","email":"joycep.souza@yahoo.com.br","telefone":"(79) 99801-7753","data_nascimento":"1993-09-30","data_matricula":"2026-07-18","endereco":"DR. JOAQUIM PEIXOTO","bairro":"CENTRO","cidade":"NEÓPOLIS","uf":"SE","cep":"49980000","sexo":"F","rg":"34225676","orgao_emissor":"SSP/SE","rg_uf_emissao":"SE","tipo_documento":"RG (ANTIGO)","nome_mae":"DIONE DE SOUZA CHAVES","nome_pai":"JOSÉ PAULO AGUSTINHO DOS SANTOS","nacionalidade":"BRASILEIRA","naturalidade":"PENEDO"},{"linha":8,"turma_origem":"TÉC ENF. T-46 INT","nome":"KETTILYN EMANUELY SANTOS BEZERRA","cpf":"10668189592","email":"kettilynemanueles6@icloud.com","telefone":"(79) 99973-6353","data_nascimento":"2010-06-06","data_matricula":"2026-06-17","endereco":"POV. MATA DAS VARAS","bairro":"ÁREA RURAL","cidade":"NEÓPOLIS","uf":"SE","cep":"49980000","sexo":"F","rg":"4.065.129-0","orgao_emissor":"SSP/SE","rg_uf_emissao":"SE","tipo_documento":"RG (ANTIGO)","nome_mae":"VIVIANE MOURA DOS SANTOS","nome_pai":"CARLOS ERNANE LIMA BEZERRA","nacionalidade":"BRASILEIRA","naturalidade":"ARACAJU","certidao_tipo":"NASCIMENTO","certidao_modelo":"ANTIGO","certidao_termo":"46255","certidao_livro":"067","certidao_folha":"A-034"},{"linha":9,"turma_origem":"TÉC ENF. T-46 INT","nome":"MARIA GISLAINE CORREIA SANTOS","cpf":"12809877580","email":"mg426084@gmail.com","telefone":"(79) 99607-5704","data_nascimento":"2008-01-30","data_matricula":"2026-06-18","endereco":"POV. CAMARÁ","bairro":"ÁREA RURAL","cidade":"MURIBECA","uf":"SE","cep":"49780000","sexo":"F","rg":"09.469.266-1","orgao_emissor":"SSP/SE","rg_uf_emissao":"SE","tipo_documento":"RG (ANTIGO)","nome_mae":"GILZA SANTOS CORREIA","nome_pai":"JENIVAL SABINO SANTOS","nacionalidade":"BRASILEIRA","naturalidade":"CAPELA"}]$source$::jsonb;
  v_turma public.turmas%rowtype;
  v_row record;
  v_parceiro_id uuid;
  v_curso_id uuid;
  v_polo_id uuid;
begin
  if jsonb_array_length(v_source) <> 8 then
    raise exception 'A importação T46 exige exatamente 8 registros de origem.';
  end if;

  perform pg_advisory_xact_lock(hashtext('importacao-enf-t46-20260726'));

  select id into strict v_curso_id
  from public.cursos
  where nome = 'Técnico em Enfermagem';

  select id into strict v_polo_id
  from public.polos
  where is_matriz = true and status = 'ativo';

  insert into public.turmas (
    codigo, nome, curso_id, polo_id, data_inicio, data_previsao_termino,
    turno, status, vagas_totais, gerar_cobrancas_futuras,
    sincronizar_asaas_futuro, obs_financeira_origem
  )
  select
    'ENF-T46-INT-MAT', 'ENF T-46 INT', v_curso_id, v_polo_id,
    date '2026-07-25', date '2028-07-24',
    'INTEGRAL', 'PLANEJADA', 40, false, false,
    'Turma cadastrada a partir de turma 46.xls; sem geração automática de financeiro.'
  where not exists (
    select 1 from public.turmas where codigo = 'ENF-T46-INT-MAT'
  );

  select * into v_turma
  from public.turmas
  where codigo = 'ENF-T46-INT-MAT'
  for update;

  if not found then
    raise exception 'Não foi possível localizar ou criar ENF-T46-INT-MAT.';
  end if;

  if v_turma.polo_id <> v_polo_id or v_turma.curso_id <> v_curso_id then
    raise exception 'ENF-T46-INT-MAT existe com polo ou curso divergente.';
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
        'Importado de turma 46.xls sem criação de usuário Auth e sem financeiro.',
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
