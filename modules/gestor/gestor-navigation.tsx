import React from 'react';
import {
  Award, BarChart, BellRing, BookOpen, Bot, Briefcase, Building, CalendarDays, ClipboardCheck,
  FileCode, FileSignature, FileText, Handshake, Inbox, LayoutDashboard,
  MessageSquare, MonitorPlay, Settings, Settings2, ShoppingCart, SlidersHorizontal, TrendingUp,
  UserPlus, WalletCards, Workflow, Zap, Archive,
} from 'lucide-react';
import { canAccessCommunicationRoute, canAccessTab, GestorPermissions } from './access-control';
import { GestorMenuItem } from './components/GestorPortalShell';
import {
  GESTOR_CADASTRO_NAVIGATION,
  GESTOR_COMMUNICATION_NAVIGATION,
  GESTOR_MAIN_NAVIGATION,
} from './gestor-navigation.config';

export { GESTOR_MODULE_ORDER } from './gestor-navigation.config';

export const POLO_CADASTROS_ALLOWED = new Set([
  'cadastros',
  'cadastros-especializacao',
  'cadastros-livres',
  'cadastros-superior',
]);

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
  const cadastroIcons: Record<string, React.ReactNode> = {
    'cadastros-tecnicos': <Briefcase size={16} />,
    'cadastros-livres': <Zap size={16} />,
    'cadastros-especializacao': <Award size={16} />,
    'cadastros-ead': <MonitorPlay size={16} />,
    'cadastros-superior': <Building size={16} />,
    'cadastros-ficha': <FileSignature size={16} />,
    'cadastros-checklist': <ClipboardCheck size={16} />,
    'cadastros-modelos': <FileCode size={16} />,
  };
  const cadastroSubItems = GESTOR_CADASTRO_NAVIGATION
    .map(item => ({ ...item, icon: cadastroIcons[item.id] }))
    .filter(item => canAccessTab(permissions, 'cadastros', item.id));
  const visibleCadastroSubItems = isMatrizSelected
    ? cadastroSubItems
    : cadastroSubItems.filter(item => POLO_CADASTROS_ALLOWED.has(item.id));
  const communicationIcons: Record<string, React.ReactNode> = {
    'comunicacao-atendimento': <Inbox size={16} />,
    'comunicacao-atrasados': <WalletCards size={16} />,
    'comunicacao-notificacoes-push': <BellRing size={16} />,
    'comunicacao-automacoes': <Workflow size={16} />,
    'comunicacao-fluxos': <Workflow size={16} />,
    'comunicacao-agentes': <Bot size={16} />,
    'comunicacao-atendimento-config': <SlidersHorizontal size={16} />,
    'comunicacao-configuracoes': <Settings2 size={16} />,
  };
  const communicationSubItems = GESTOR_COMMUNICATION_NAVIGATION
    .map(item => ({ ...item, icon: communicationIcons[item.id] }))
    .filter(item => canAccessCommunicationRoute(permissions, item.id))
    .filter(item => item.id !== 'comunicacao-automacoes' || (permissions.allPolos && isMatrizSelected));

  const menuIcons: Record<string, React.ReactNode> = {
    inicio: <LayoutDashboard size={20} />,
    gestao: <Briefcase size={20} />,
    secretaria: <FileText size={20} />,
    calendario: <CalendarDays size={20} />,
    comunicacao: <MessageSquare size={20} />,
    parceiros: <Handshake size={20} />,
    financeiro: <TrendingUp size={20} />,
    patrimonio: <Archive size={20} />,
    caixa: <ShoppingCart size={20} />,
    cadastros: <UserPlus size={20} />,
    biblioteca: <BookOpen size={20} />,
    relatorios: <BarChart size={20} />,
    configuracoes: <Settings size={20} />,
  };
  const menuItems: GestorMenuItem[] = GESTOR_MAIN_NAVIGATION.map(item => ({
    ...item,
    icon: menuIcons[item.id],
    ...(item.id === 'cadastros' ? { subItems: visibleCadastroSubItems } : {}),
    ...(item.id === 'comunicacao' ? { badge: pendingChatsCount, subItems: communicationSubItems } : {}),
  }));
  const visibleMenuItems = (isMatrizSelected ? menuItems : menuItems.filter(item => item.id !== 'configuracoes'))
    .filter(item => canOpenModule(item.id));

  return { visibleCadastroSubItems, visibleMenuItems };
};
