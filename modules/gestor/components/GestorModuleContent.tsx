import React, { lazy } from 'react';
import { Lock, Settings } from 'lucide-react';
import { PortalAuthProfile } from '../../login/portal-session';
import { canAccessTab, GestorPermissions } from '../access-control';
import BibliotecaPage from '../biblioteca/BibliotecaPage';
import CadastrosPage from '../cadastros/CadastrosPage';
import ChecklistEstagioPage from '../cadastros/checklist-estagio/ChecklistEstagioPage';
import CursosEadPage from '../cadastros/cursos-ead/CursosEadPage';
import CursosEspecializacaoPage from '../cadastros/cursos-especializacao/CursosEspecializacaoPage';
import CursosLivresPage from '../cadastros/cursos-livres/CursosLivresPage';
import CursosTecnicosPage from '../cadastros/cursos-tecnicos/CursosTecnicosPage';
import EnsinoSuperiorPage from '../cadastros/ensino-superior/EnsinoSuperiorPage';
import FichaMatriculaPage from '../cadastros/ficha-matricula/FichaMatriculaPage';
import ModelosDocumentosPage from '../cadastros/modelos-documentos/ModelosDocumentosPage';
import CalendarioPage from '../calendario/CalendarioPage';
import ComunicacaoPage from '../comunicacao/ComunicacaoPage';
import ConfiguracoesPage from '../configuracoes/ConfiguracoesPage';
import DashboardPage from '../dashboard/DashboardPage';
import FinanceiroPage from '../financeiro/FinanceiroPage';
import GestaoPage from '../gestao/GestaoPage';
import { POLO_CADASTROS_ALLOWED } from '../gestor-navigation';
import ParceirosPage from '../parceiros/ParceirosPage';
import RelatoriosPage from '../relatorios/RelatoriosPage';

export const loadSecretariaPage = () => import('../secretaria/SecretariaPage');
export const loadCaixaPage = () => import('../caixa/CaixaPage');
const SecretariaPage = lazy(loadSecretariaPage);
const CaixaPage = lazy(loadCaixaPage);

interface GestorModuleContentProps {
  activeModule: string;
  canOpenModule: (moduleId: string) => boolean;
  isMatrizSelected: boolean;
  allowedCadastroTabs: string[];
  setActiveModule: (moduleId: string) => void;
  currentPoloId: string | null;
  scopedPoloId: string | null;
  isGlobal: boolean;
  currentPoloName?: string;
  onRequestScrollTop: () => void;
  permissions: GestorPermissions;
  profile: PortalAuthProfile;
}

const AccessDenied = () => (
  <div className="animate-fadeIn rounded-[2rem] border border-rose-100 bg-white p-10 text-center shadow-sm">
    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-600"><Lock size={26} /></div>
    <h2 className="text-xl font-black uppercase tracking-tight text-[#001a33]">Acesso negado</h2>
    <p className="mx-auto mt-2 max-w-xl text-sm font-medium text-slate-500">Seu usuário não possui permissão para acessar este módulo.</p>
  </div>
);

const GestorModuleContent: React.FC<GestorModuleContentProps> = ({
  activeModule,
  canOpenModule,
  isMatrizSelected,
  allowedCadastroTabs,
  setActiveModule,
  currentPoloId,
  scopedPoloId,
  isGlobal,
  currentPoloName,
  onRequestScrollTop,
  permissions,
  profile,
}) => {
  if (!canOpenModule(activeModule)) return <AccessDenied />;
  if (!isMatrizSelected && activeModule.startsWith('cadastros-') && !POLO_CADASTROS_ALLOWED.has(activeModule)) {
    return <CadastrosPage onNavigate={setActiveModule} readOnly allowedTabs={allowedCadastroTabs} />;
  }

  switch (activeModule) {
    case 'inicio': return <DashboardPage poloId={currentPoloId} onNavigate={setActiveModule} />;
    case 'calendario': return <CalendarioPage />;
    case 'parceiros': return <ParceirosPage poloId={scopedPoloId} includeGlobal={isGlobal} onRequestScrollTop={onRequestScrollTop} />;
    case 'cadastros': return <CadastrosPage onNavigate={setActiveModule} readOnly={!isMatrizSelected} allowedTabs={allowedCadastroTabs} />;
    case 'cadastros-checklist': return <ChecklistEstagioPage />;
    case 'cadastros-ead': return <CursosEadPage />;
    case 'cadastros-especializacao': return <CursosEspecializacaoPage readOnly={!isMatrizSelected} />;
    case 'cadastros-livres': return <CursosLivresPage readOnly={!isMatrizSelected} />;
    case 'cadastros-tecnicos': return <CursosTecnicosPage />;
    case 'cadastros-superior': return <EnsinoSuperiorPage readOnly={!isMatrizSelected} />;
    case 'cadastros-ficha': return <FichaMatriculaPage />;
    case 'cadastros-modelos': return <ModelosDocumentosPage />;
    case 'gestao': return <GestaoPage poloId={currentPoloId || undefined} activePoloId={currentPoloId || undefined} isMatriz={isMatrizSelected} poloNome={currentPoloName} onRequestScrollTop={onRequestScrollTop} />;
    case 'secretaria': return <SecretariaPage key={scopedPoloId || 'sem-polo'} poloId={scopedPoloId} gestorPermissions={permissions} />;
    case 'caixa': return <CaixaPage poloId={scopedPoloId} isGlobal={isGlobal} />;
    case 'financeiro': return <FinanceiroPage poloId={scopedPoloId} allowedTabs={permissions.financeiroTabs} />;
    case 'biblioteca': return <BibliotecaPage />;
    case 'comunicacao': return canAccessTab(permissions, 'comunicacao', 'comunicacao-mensagem') ? <ComunicacaoPage gestorProfile={profile} channel="mensagem" /> : <ComunicacaoPage gestorProfile={profile} channel="whatsapp" />;
    case 'comunicacao-mensagem': return <ComunicacaoPage gestorProfile={profile} channel="mensagem" />;
    case 'comunicacao-whatsapp': return <ComunicacaoPage gestorProfile={profile} channel="whatsapp" />;
    case 'relatorios': return <RelatoriosPage poloId={scopedPoloId} />;
    case 'configuracoes':
      if (!isMatrizSelected) {
        return <div className="animate-fadeIn rounded-[2rem] border border-amber-100 bg-white p-10 text-center shadow-sm"><div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600"><Settings size={26} /></div><h2 className="text-xl font-black uppercase tracking-tight text-[#001a33]">Configurações disponíveis apenas na matriz</h2><p className="mx-auto mt-2 max-w-xl text-sm font-medium text-slate-500">Troque para o polo matriz no seletor superior para alterar integrações, tokens e regras globais do sistema.</p></div>;
      }
      return <ConfiguracoesPage />;
    default:
      if (activeModule.startsWith('cadastros-')) {
        const submodule = activeModule.split('-')[1];
        return <div className="animate-fadeIn"><div className="mb-6 flex items-center justify-between"><h2 className="text-2xl font-black text-[#001a33] uppercase tracking-tight">Gerenciamento de {submodule.charAt(0).toUpperCase() + submodule.slice(1)}</h2><button onClick={() => setActiveModule('cadastros')} className="text-xs font-bold text-blue-600 hover:underline uppercase tracking-widest">Ver todos os cadastros</button></div><div className="bg-white p-12 rounded-[2.5rem] border border-slate-100 shadow-sm text-center"><div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4"><Settings className="animate-spin-slow" /></div><p className="text-slate-500 font-medium">O módulo de {submodule} está sendo preparado para você.</p></div></div>;
      }
      return <DashboardPage poloId={currentPoloId} onNavigate={setActiveModule} />;
  }
};

export default GestorModuleContent;
