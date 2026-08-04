import React from 'react';
import {
  ArrowRightLeft,
  BarChart,
  BookOpen,
  Briefcase,
  CalendarDays,
  FileText,
  Handshake,
  Layers,
  LayoutDashboard,
  MessageSquare,
  Settings,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  UserPlus,
} from 'lucide-react';
import { SECRETARIA_ACCESS_OPTIONS } from '../../../secretaria/secretaria-access';
import {
  GESTOR_CADASTRO_NAVIGATION,
  GESTOR_MAIN_NAVIGATION,
} from '../../../gestor-navigation.config';

const USER_FORM_MODULE_ICONS: Record<string, React.ReactNode> = {
  inicio: <LayoutDashboard size={18} />,
  gestao: <Briefcase size={18} />,
  secretaria: <FileText size={18} />,
  calendario: <CalendarDays size={18} />,
  comunicacao: <MessageSquare size={18} />,
  parceiros: <Handshake size={18} />,
  financeiro: <TrendingUp size={18} />,
  caixa: <ShoppingCart size={18} />,
  cadastros: <UserPlus size={18} />,
  biblioteca: <BookOpen size={18} />,
  relatorios: <BarChart size={18} />,
  configuracoes: <Settings size={18} />,
};

export const USER_FORM_MODULES = GESTOR_MAIN_NAVIGATION.map(item => ({
  id: item.id,
  label: item.id === 'inicio' ? 'Dashboard' : item.label,
  icon: USER_FORM_MODULE_ICONS[item.id],
}));

export const USER_FORM_FINANCEIRO_TABS = [
  { id: 'resumo', label: 'Resumo', icon: <Layers size={16} /> },
  { id: 'receber', label: 'Contas a Receber', icon: <TrendingUp size={16} /> },
  { id: 'despesas', label: 'Despesas', icon: <TrendingDown size={16} /> },
  { id: 'transferencias', label: 'Transferências', icon: <ArrowRightLeft size={16} /> },
  { id: 'conciliacao-bancaria', label: 'Conciliação Bancária', icon: <FileText size={16} /> },
  { id: 'outros-debitos', label: 'Outros Débitos', icon: <TrendingDown size={16} /> },
  { id: 'outros-creditos', label: 'Outros Créditos', icon: <TrendingUp size={16} /> },
];

const CADASTROS_TABS = GESTOR_CADASTRO_NAVIGATION.map(item => ({ ...item }));

const COMUNICACAO_TABS = [
  { id: 'comunicacao-mensagem', label: 'Atendimento — Portal e app' },
  { id: 'comunicacao-whatsapp', label: 'Atendimento — WhatsApp e operações' },
  { id: 'comunicacao-automacoes', label: 'Automações multicanal' },
];

const GESTAO_TURMA_TABS = [
  { id: 'resumo', label: 'Resumo' },
  { id: 'alunos', label: 'Alunos' },
  { id: 'grade', label: 'Grade e Professores / Aulas' },
  { id: 'atividades', label: 'Atividades' },
  { id: 'diarios', label: 'Diários' },
  { id: 'financeiro', label: 'Financeiro da Turma' },
  { id: 'vacinas', label: 'Vacinas' },
  { id: 'estagio', label: 'Estágio' },
  { id: 'academico', label: 'Ciclo Acadêmico' },
  { id: 'configuracoes', label: 'Configurações da Turma' },
];

export const USER_FORM_MODULE_TABS: Record<string, { id: string; label: string }[]> = {
  gestao: GESTAO_TURMA_TABS,
  cadastros: CADASTROS_TABS,
  secretaria: [...SECRETARIA_ACCESS_OPTIONS],
  comunicacao: COMUNICACAO_TABS,
};

export const USER_FORM_SCHEDULE_DAYS: Array<[number, string]> = [
  [1, 'Seg'], [2, 'Ter'], [3, 'Qua'], [4, 'Qui'],
  [5, 'Sex'], [6, 'Sáb'], [0, 'Dom'],
];
