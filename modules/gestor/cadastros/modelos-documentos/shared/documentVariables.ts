export const BASE_DOCUMENT_VARIABLES = [
  { code: '{{ALUNO_NOME}}', label: 'Nome do Aluno' },
  { code: '{{ALUNO_CPF}}', label: 'CPF do Aluno' },
  { code: '{{ALUNO_RG}}', label: 'RG do Aluno' },
  { code: '{{ALUNO_MATRICULA}}', label: 'Matrícula' },
  { code: '{{CURSO_NOME}}', label: 'Nome do Curso' },
  { code: '{{TURMA_NOME}}', label: 'Nome da Turma' },
  { code: '{{POLO_NOME}}', label: 'Nome do Polo' },
  { code: '{{CIDADE_POLO}}', label: 'Cidade do Polo' },
  { code: '{{DATA_ATUAL}}', label: 'Data Atual' },
  { code: '{{SITUACAO_ACADEMICA}}', label: 'Situação Acadêmica' }
];

export const TRANSFERENCIA_VARIABLES = [
  ...BASE_DOCUMENT_VARIABLES,
  { code: '{{INSTITUICAO_DESTINO}}', label: 'Instituição de Destino' },
  { code: '{{CARGA_HORARIA_TOTAL}}', label: 'Carga Horária Total' },
  { code: '{{TABELA_COMPONENTES_CURRICULARES}}', label: 'Tabela de Componentes' },
  { code: '{{CARGA_HORARIA_CUMPRIDA}}', label: 'Carga Horária Cumprida' }
];

export const HISTORICO_VARIABLES = [
  ...BASE_DOCUMENT_VARIABLES,
  { code: '{{DATA_EMISSAO}}', label: 'Data de Emissão' },
  { code: '{{DATA_INICIO_CURSO}}', label: 'Início do Curso' },
  { code: '{{DATA_CONCLUSAO_CURSO}}', label: 'Conclusão do Curso' },
  { code: '{{DATA_EXPEDICAO_DIPLOMA}}', label: 'Expedição do Diploma' },
  { code: '{{ALUNO_NASCIMENTO}}', label: 'Nascimento do Aluno' },
  { code: '{{ALUNO_SEXO}}', label: 'Sexo do Aluno' },
  { code: '{{ALUNO_NATURALIDADE}}', label: 'Naturalidade' },
  { code: '{{ALUNO_NACIONALIDADE}}', label: 'Nacionalidade' },
  { code: '{{ALUNO_MAE}}', label: 'Nome da Mãe' },
  { code: '{{ALUNO_PAI}}', label: 'Nome do Pai' },
  { code: '{{ALUNO_RG_ORGAO}}', label: 'Órgão Expedidor do RG' },
  { code: '{{ALUNO_TITULO_ELEITOR}}', label: 'Título de Eleitor' },
  { code: '{{ALUNO_TITULO_ZONA}}', label: 'Zona Eleitoral' },
  { code: '{{ALUNO_TITULO_SECAO}}', label: 'Seção Eleitoral' },
  { code: '{{ALUNO_TITULO_EMISSAO}}', label: 'Emissão do Título de Eleitor' },
  { code: '{{ALUNO_TITULO_UF}}', label: 'UF do Título de Eleitor' },
  { code: '{{ALUNO_RESERVISTA}}', label: 'Certificado Militar' },
  { code: '{{ENSINO_MEDIO_ESCOLA}}', label: 'Escola do Ensino Médio' },
  { code: '{{ENSINO_MEDIO_ANO_CONCLUSAO}}', label: 'Ano de Conclusão do Ensino Médio' },
  { code: '{{EIXO_TECNOLOGICO}}', label: 'Eixo Tecnológico' },
  { code: '{{PERFIL_PROFISSIONAL_CONCLUSAO}}', label: 'Perfil Profissional de Conclusão' },
  { code: '{{POLO_UF}}', label: 'UF do Polo' },
  { code: '{{POLO_CNPJ}}', label: 'CNPJ do Polo' },
  { code: '{{POLO_ENDERECO_COMPLETO}}', label: 'Endereço do Polo' },
  { code: '{{POLO_TELEFONE}}', label: 'Telefone do Polo' },
  { code: '{{POLO_EMAIL}}', label: 'E-mail do Polo' },
  { code: '{{PERIODO_CURSO}}', label: 'Período do Curso' },
  { code: '{{TABELA_HISTORICO_ESCOLAR}}', label: 'Tabela do Histórico' },
  { code: '{{CARGA_HORARIA_CUMPRIDA}}', label: 'Carga Horária Cumprida' },
  { code: '{{CARGA_HORARIA_TOTAL}}', label: 'Carga Horária Total' },
  { code: '{{OBSERVACOES_HISTORICO}}', label: 'Observações' }
];

export const BOLETIM_TECNICO_VARIABLES = [
  ...BASE_DOCUMENT_VARIABLES,
  { code: '{{MODULO_PERIODO}}', label: 'Módulo / Período' },
  { code: '{{ANO_LETIVO}}', label: 'Ano Letivo' },
  { code: '{{TABELA_BOLETIM_TECNICO}}', label: 'Tabela de Notas e Frequência' },
  { code: '{{MEDIA_GERAL}}', label: 'Média Geral' },
  { code: '{{FREQUENCIA_GERAL}}', label: 'Frequência Geral' }
];

export const ATESTADO_CONCLUSAO_TECNICO_VARIABLES = [
  ...BASE_DOCUMENT_VARIABLES,
  { code: '{{DATA_CONCLUSAO}}', label: 'Data de Conclusão' },
  { code: '{{CARGA_HORARIA_TOTAL}}', label: 'Carga Horária Total' },
  { code: '{{MEDIA_GERAL}}', label: 'Média Geral' },
  { code: '{{FREQUENCIA_GERAL}}', label: 'Frequência Geral' },
  { code: '{{VALIDADE_DATA}}', label: 'Data Limite de Validade' },
  { code: '{{VALIDADE_DIAS}}', label: 'Prazo de Validade em Dias' },
  { code: '{{DATA_GERACAO}}', label: 'Data e Hora da Geração' },
];

export const ESTAGIO_VARIABLES = [
  ...BASE_DOCUMENT_VARIABLES,
  { code: '{{CONCEDENTE_NOME}}', label: 'Empresa Concedente' },
  { code: '{{CONCEDENTE_CNPJ}}', label: 'CNPJ da Concedente' },
  { code: '{{SUPERVISOR_NOME}}', label: 'Supervisor de Estágio' },
  { code: '{{PERIODO_ESTAGIO}}', label: 'Período do Estágio' },
  { code: '{{JORNADA_ESTAGIO}}', label: 'Jornada do Estágio' },
  { code: '{{CARGA_HORARIA_ESTAGIO}}', label: 'Carga Horária do Estágio' },
  { code: '{{PLANO_ATIVIDADES}}', label: 'Plano de Atividades' }
];
