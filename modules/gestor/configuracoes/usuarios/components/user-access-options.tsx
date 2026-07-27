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

export const USER_FORM_MODULES = [
  { id: 'inicio', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
  { id: 'parceiros', label: 'Parceiros', icon: <Handshake size={18} /> },
  { id: 'cadastros', label: 'Cadastros', icon: <UserPlus size={18} /> },
  { id: 'gestao', label: 'Gestão', icon: <Briefcase size={18} /> },
  { id: 'secretaria', label: 'Secretaria', icon: <FileText size={18} /> },
  { id: 'caixa', label: 'Caixa', icon: <ShoppingCart size={18} /> },
  { id: 'financeiro', label: 'Financeiro', icon: <TrendingUp size={18} /> },
  { id: 'biblioteca', label: 'Biblioteca', icon: <BookOpen size={18} /> },
  { id: 'calendario', label: 'Calendário', icon: <CalendarDays size={18} /> },
  { id: 'comunicacao', label: 'Comunicação', icon: <MessageSquare size={18} /> },
  { id: 'relatorios', label: 'Relatórios', icon: <BarChart size={18} /> },
  { id: 'configuracoes', label: 'Configurações', icon: <Settings size={18} /> },
];

export const USER_FORM_FINANCEIRO_TABS = [
  { id: 'resumo', label: 'Resumo', icon: <Layers size={16} /> },
  { id: 'receber', label: 'Contas a Receber', icon: <TrendingUp size={16} /> },
  { id: 'despesas', label: 'Despesas', icon: <TrendingDown size={16} /> },
  { id: 'transferencias', label: 'Transferências', icon: <ArrowRightLeft size={16} /> },
  { id: 'conciliacao-bancaria', label: 'Conciliação Bancária', icon: <FileText size={16} /> },
  { id: 'outros-debitos', label: 'Outros Débitos', icon: <TrendingDown size={16} /> },
  { id: 'outros-creditos', label: 'Outros Créditos', icon: <TrendingUp size={16} /> },
];

const CADASTROS_TABS = [
  { id: 'cadastros-checklist', label: 'Check List Estágio' },
  { id: 'cadastros-ead', label: 'Cursos EAD' },
  { id: 'cadastros-especializacao', label: 'Cursos Especialização' },
  { id: 'cadastros-livres', label: 'Cursos Livres' },
  { id: 'cadastros-tecnicos', label: 'Cursos Técnicos' },
  { id: 'cadastros-superior', label: 'Ensino Superior' },
  { id: 'cadastros-ficha', label: 'Ficha Cadastral' },
  { id: 'cadastros-modelos', label: 'Modelos Documentos' },
];

const COMUNICACAO_TABS = [
  { id: 'comunicacao-mensagem', label: 'Mensagens internas' },
  { id: 'comunicacao-whatsapp', label: 'WhatsApp' },
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
