-- Padroniza somente os campos textuais cadastrais de alunos existentes.
-- Identificadores, credenciais, e-mails, telefones, documentos numéricos e URLs não são alterados.
update public.parceiros
set
  nome = upper(nome),
  endereco = upper(endereco),
  numero = upper(numero),
  complemento = upper(complemento),
  bairro = upper(bairro),
  cidade = upper(cidade),
  uf = upper(uf),
  status = upper(status),
  observacao = upper(observacao),
  sexo = upper(sexo),
  rg = upper(rg),
  orgao_emissor = upper(orgao_emissor),
  nacionalidade = upper(nacionalidade),
  naturalidade = upper(naturalidade),
  titulo_eleitor = upper(titulo_eleitor),
  reservista = upper(reservista),
  nome_mae = upper(nome_mae),
  nome_pai = upper(nome_pai),
  nome_social = upper(nome_social),
  responsavel_nome = upper(responsavel_nome),
  responsavel_parentesco = upper(responsavel_parentesco),
  estado_civil = upper(estado_civil),
  pcd_tipo = upper(pcd_tipo),
  rg_uf_emissao = upper(rg_uf_emissao),
  escolaridade_anterior = upper(escolaridade_anterior),
  instituicao_origem = upper(instituicao_origem),
  ano_conclusao_ensino_medio = upper(ano_conclusao_ensino_medio),
  tipo_documento = upper(tipo_documento)
where upper(coalesce(tipo, '')) = 'ALUNO'
  and (
    nome is distinct from upper(nome)
    or endereco is distinct from upper(endereco)
    or numero is distinct from upper(numero)
    or complemento is distinct from upper(complemento)
    or bairro is distinct from upper(bairro)
    or cidade is distinct from upper(cidade)
    or uf is distinct from upper(uf)
    or status is distinct from upper(status)
    or observacao is distinct from upper(observacao)
    or sexo is distinct from upper(sexo)
    or rg is distinct from upper(rg)
    or orgao_emissor is distinct from upper(orgao_emissor)
    or nacionalidade is distinct from upper(nacionalidade)
    or naturalidade is distinct from upper(naturalidade)
    or titulo_eleitor is distinct from upper(titulo_eleitor)
    or reservista is distinct from upper(reservista)
    or nome_mae is distinct from upper(nome_mae)
    or nome_pai is distinct from upper(nome_pai)
    or nome_social is distinct from upper(nome_social)
    or responsavel_nome is distinct from upper(responsavel_nome)
    or responsavel_parentesco is distinct from upper(responsavel_parentesco)
    or estado_civil is distinct from upper(estado_civil)
    or pcd_tipo is distinct from upper(pcd_tipo)
    or rg_uf_emissao is distinct from upper(rg_uf_emissao)
    or escolaridade_anterior is distinct from upper(escolaridade_anterior)
    or instituicao_origem is distinct from upper(instituicao_origem)
    or ano_conclusao_ensino_medio is distinct from upper(ano_conclusao_ensino_medio)
    or tipo_documento is distinct from upper(tipo_documento)
  );
