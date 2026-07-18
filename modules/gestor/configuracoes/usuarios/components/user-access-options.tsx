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
  { id: 'cadastros-ficha', label: 'Ficha Matrícula' },
  { id: 'cadastros-modelos', label: 'Modelos Documentos' },
];

const SECRETARIA_TABS = [
  { id: 'solicitacoes', label: 'Solicitações' },
  { id: 'carteirinhas', label: 'Carteirinhas de Estudante' },
  { id: 'declaracoes', label: 'Declaração de Matrícula' },
  { id: 'historico', label: 'Histórico de Emissões' },
  { id: 'recebimentos', label: 'Recebimentos / Baixa' },
];

const COMUNICACAO_TABS = [
  { id: 'comunicacao-mensagem', label: 'Mensagens internas' },
  { id: 'comunicacao-whatsapp', label: 'WhatsApp' },
];

export const USER_FORM_MODULE_TABS: Record<string, { id: string; label: string }[]> = {
  cadastros: CADASTROS_TABS,
  secretaria: SECRETARIA_TABS,
  comunicacao: COMUNICACAO_TABS,
};

export const USER_FORM_SCHEDULE_DAYS: Array<[number, string]> = [
  [1, 'Seg'], [2, 'Ter'], [3, 'Qua'], [4, 'Qui'],
  [5, 'Sex'], [6, 'Sáb'], [0, 'Dom'],
];
