import React from 'react';
import {
  Award, BarChart, BookOpen, Bot, Briefcase, Building, CalendarDays, ClipboardCheck,
  FileCode, FileSignature, FileText, Handshake, Inbox, LayoutDashboard,
  MessageSquare, MonitorPlay, Settings, Settings2, ShoppingCart, SlidersHorizontal, TrendingUp,
  UserPlus, UserRound, WalletCards, Workflow, Zap,
} from 'lucide-react';
import { canAccessCommunicationRoute, canAccessTab, GestorPermissions } from './access-control';
import { GestorMenuItem } from './components/GestorPortalShell';

export const POLO_CADASTROS_ALLOWED = new Set([
  'cadastros',
  'cadastros-especializacao',
  'cadastros-livres',
  'cadastros-superior',
]);

export const GESTOR_MODULE_ORDER = [
  'inicio', 'parceiros', 'cadastros', 'gestao', 'secretaria', 'caixa',
  'financeiro', 'biblioteca', 'calendario', 'comunicacao', 'relatorios',
  'configuracoes', 'meu-perfil',
];

interface BuildNavigationOptions {
  permissions: GestorPermissions;
  isMatrizSelected: boolean;
  pendingChatsCount: number;
  canOpenModule: (moduleId: string) => boolean;
}

export const buildGestorNavigation = ({
  permissions,
  isMatrizSelected,
  pendingChatsCount,
  canOpenModule,
}: BuildNavigationOptions) => {
  const cadastroSubItems = [
    { id: 'cadastros-checklist', label: 'Check List Estágio', icon: <ClipboardCheck size={16} /> },
    { id: 'cadastros-ead', label: 'Cursos EAD', icon: <MonitorPlay size={16} /> },
    { id: 'cadastros-especializacao', label: 'Cursos Especialização', icon: <Award size={16} /> },
    { id: 'cadastros-livres', label: 'Cursos Livres', icon: <Zap size={16} /> },
    { id: 'cadastros-tecnicos', label: 'Cursos Técnicos', icon: <Briefcase size={16} /> },
    { id: 'cadastros-superior', label: 'Ensino Superior', icon: <Building size={16} /> },
    { id: 'cadastros-ficha', label: 'Ficha Cadastral', icon: <FileSignature size={16} /> },
    { id: 'cadastros-modelos', label: 'Modelos Documentos', icon: <FileCode size={16} /> },
  ].filter(item => canAccessTab(permissions, 'cadastros', item.id));
  const visibleCadastroSubItems = isMatrizSelected
    ? cadastroSubItems
    : cadastroSubItems.filter(item => POLO_CADASTROS_ALLOWED.has(item.id));
  const communicationSubItems = [
    { id: 'comunicacao-atendimento', label: 'Atendimento', icon: <Inbox size={16} /> },
    { id: 'comunicacao-atendimento-config', label: 'Atendimento por polo', icon: <SlidersHorizontal size={16} /> },
    { id: 'comunicacao-atrasados', label: 'Atrasados', icon: <WalletCards size={16} /> },
    { id: 'comunicacao-automacoes', label: 'Automações', icon: <Workflow size={16} /> },
    { id: 'comunicacao-fluxos', label: 'Fluxos', icon: <Workflow size={16} /> },
    { id: 'comunicacao-agentes', label: 'Agentes', icon: <Bot size={16} /> },
    { id: 'comunicacao-configuracoes', label: 'Canais e perfis', icon: <Settings2 size={16} /> },
  ].filter(item => canAccessCommunicationRoute(permissions, item.id))
    .filter(item => item.id !== 'comunicacao-automacoes' || (permissions.allPolos && isMatrizSelected));

  const menuItems: GestorMenuItem[] = [
    { id: 'inicio', label: 'Início', icon: <LayoutDashboard size={20} /> },
    { id: 'parceiros', label: 'Parceiros', icon: <Handshake size={20} /> },
    { id: 'cadastros', label: 'Cadastros', icon: <UserPlus size={20} />, subItems: visibleCadastroSubItems },
    { id: 'gestao', label: 'Gestão', icon: <Briefcase size={20} /> },
    { id: 'secretaria', label: 'Secretaria', icon: <FileText size={20} /> },
    { id: 'caixa', label: 'Caixa', icon: <ShoppingCart size={20} /> },
    { id: 'financeiro', label: 'Financeiro', icon: <TrendingUp size={20} /> },
    { id: 'biblioteca', label: 'Biblioteca', icon: <BookOpen size={20} /> },
    { id: 'calendario', label: 'Calendário', icon: <CalendarDays size={20} /> },
    { id: 'comunicacao', label: 'Comunicação', icon: <MessageSquare size={20} />, badge: pendingChatsCount, subItems: communicationSubItems },
    { id: 'relatorios', label: 'Relatórios', icon: <BarChart size={20} /> },
    { id: 'meu-perfil', label: 'Meu Perfil', icon: <UserRound size={20} /> },
    { id: 'configuracoes', label: 'Configurações', icon: <Settings size={20} /> },
  ];
  const visibleMenuItems = (isMatrizSelected ? menuItems : menuItems.filter(item => item.id !== 'configuracoes'))
    .filter(item => canOpenModule(item.id));

  return { visibleCadastroSubItems, visibleMenuItems };
};
