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
  { code: '{{TABELA_COMPONENTES_CURRICULARES}}', label: 'Tabela de Componentes' },
  { code: '{{CARGA_HORARIA_CUMPRIDA}}', label: 'Carga Horária Cumprida' }
];

export const HISTORICO_VARIABLES = [
  ...BASE_DOCUMENT_VARIABLES,
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
