export type GestorNavigationGroup =
  | 'visao-geral'
  | 'operacao-academica'
  | 'relacionamento'
  | 'financeiro'
  | 'estrutura-apoio'
  | 'inteligencia'
  | 'administracao';

export const GESTOR_NAVIGATION_GROUP_LABELS: Record<GestorNavigationGroup, string> = {
  'visao-geral': 'Visão geral',
  'operacao-academica': 'Operação acadêmica',
  relacionamento: 'Relacionamento',
  financeiro: 'Financeiro',
  'estrutura-apoio': 'Estrutura e apoio',
  inteligencia: 'Inteligência',
  administracao: 'Administração',
};

export const GESTOR_MAIN_NAVIGATION = [
  { id: 'inicio', label: 'Início', group: 'visao-geral' },
  { id: 'parceiros', label: 'Parceiros', group: 'relacionamento' },
  { id: 'gestao', label: 'Gestão', group: 'operacao-academica' },
  { id: 'secretaria', label: 'Secretaria', group: 'operacao-academica' },
  { id: 'calendario', label: 'Calendário', group: 'operacao-academica', dividerBefore: true },
  { id: 'comunicacao', label: 'Comunicação', group: 'relacionamento' },
  { id: 'caixa', label: 'Caixa', group: 'financeiro' },
  { id: 'financeiro', label: 'Financeiro', group: 'financeiro' },
  { id: 'patrimonio', label: 'Patrimônio', group: 'financeiro' },
  { id: 'cadastros', label: 'Formações', group: 'estrutura-apoio', dividerBefore: true },
  { id: 'biblioteca', label: 'Biblioteca', group: 'estrutura-apoio' },
  { id: 'relatorios', label: 'Relatórios', group: 'inteligencia' },
  { id: 'configuracoes', label: 'Configurações', group: 'administracao', dividerBefore: true },
] as const satisfies ReadonlyArray<{
  id: string;
  label: string;
  group: GestorNavigationGroup;
  dividerBefore?: boolean;
}>;

export const GESTOR_CADASTRO_NAVIGATION = [
  { id: 'cadastros-tecnicos', label: 'Cursos Técnicos' },
  { id: 'cadastros-livres', label: 'Cursos Livres' },
  { id: 'cadastros-especializacao', label: 'Cursos Especialização' },
  { id: 'cadastros-ead', label: 'Cursos EAD' },
  { id: 'cadastros-superior', label: 'Ensino Superior' },
  { id: 'cadastros-ficha', label: 'Ficha Cadastral' },
  { id: 'cadastros-checklist', label: 'Check List Estágio' },
  { id: 'cadastros-modelos', label: 'Modelos Documentos' },
] as const;

export const GESTOR_COMMUNICATION_NAVIGATION = [
  { id: 'comunicacao-atendimento', label: 'Atendimento' },
  { id: 'comunicacao-atrasados', label: 'Atrasados' },
  { id: 'comunicacao-notificacoes-push', label: 'Notificações e Push' },
  { id: 'comunicacao-automacoes', label: 'Automações' },
  { id: 'comunicacao-fluxos', label: 'Fluxos' },
  { id: 'comunicacao-agentes', label: 'Agentes' },
  { id: 'comunicacao-atendimento-config', label: 'Atendimento por polo' },
  { id: 'comunicacao-configuracoes', label: 'Canais e perfis' },
] as const;

export const GESTOR_MODULE_ORDER = [
  ...GESTOR_MAIN_NAVIGATION.map((item) => item.id),
  'meu-perfil',
];
