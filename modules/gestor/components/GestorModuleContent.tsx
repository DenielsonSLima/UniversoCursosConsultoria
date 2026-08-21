import React, { lazy, Suspense } from 'react';
import { Lock, RefreshCw, Settings, TriangleAlert } from 'lucide-react';
import type { PortalAuthProfile } from '../../login/portal-session';
import { canAccessGestorModule, canAccessTab, getEffectiveFinanceiroTabs } from '../access-control';
import type { GestorPermissions } from '../access-control';
import { POLO_CADASTROS_ALLOWED } from '../gestor-navigation';
import type { ParceiroFormType } from '../parceiros/ParceirosPage';

export const loadSecretariaPage = () => import('../secretaria/SecretariaPage');
export const loadCaixaPage = () => import('../caixa/CaixaPage');
const BibliotecaPage = lazy(() => import('../biblioteca/BibliotecaPage'));
const CadastrosPage = lazy(() => import('../cadastros/CadastrosPage'));
const ChecklistEstagioPage = lazy(() => import('../cadastros/checklist-estagio/ChecklistEstagioPage'));
const CursosEadPage = lazy(() => import('../cadastros/cursos-ead/CursosEadPage'));
const CursosEspecializacaoPage = lazy(() => import('../cadastros/cursos-especializacao/CursosEspecializacaoPage'));
const CursosLivresPage = lazy(() => import('../cadastros/cursos-livres/CursosLivresPage'));
const CursosTecnicosPage = lazy(() => import('../cadastros/cursos-tecnicos/CursosTecnicosPage'));
const EnsinoSuperiorPage = lazy(() => import('../cadastros/ensino-superior/EnsinoSuperiorPage'));
const FichaMatriculaPage = lazy(() => import('../cadastros/ficha-matricula/FichaMatriculaPage'));
const ModelosDocumentosPage = lazy(() => import('../cadastros/modelos-documentos/ModelosDocumentosPage'));
const CalendarioPage = lazy(() => import('../calendario/CalendarioPage'));
const ComunicacaoPage = lazy(() => import('../comunicacao/ComunicacaoPage'));
const UnifiedCommunicationPage = lazy(() => import('../comunicacao/UnifiedCommunicationPage'));
const AutomacoesMulticanalPage = lazy(() => import('../comunicacao/automacoes-multicanal/AutomacoesMulticanalPage'));
const MultichannelOperationsPage = lazy(() => import('../comunicacao/multicanal/MultichannelOperationsPage'));
const AtendimentoConfigPage = lazy(() => import('../comunicacao/atendimento-config/AtendimentoConfigPage'));
const NotificacoesPushPage = lazy(() => import('../comunicacao/notificacoes-push/NotificacoesPushPage'));
const ConfiguracoesPage = lazy(() => import('../configuracoes/ConfiguracoesPage'));
const DashboardPage = lazy(() => import('../dashboard/DashboardPage'));
const FinanceiroPage = lazy(() => import('../financeiro/FinanceiroPage'));
const PatrimonioPage = lazy(() => import('../patrimonio/PatrimonioPage'));
const GestaoPage = lazy(() => import('../gestao/GestaoPage'));
const MeuPerfilPage = lazy(() => import('../meu-perfil/MeuPerfilPage'));
const ParceirosPage = lazy(() => import('../parceiros/ParceirosPage'));
const RelatoriosPage = lazy(() => import('../relatorios/RelatoriosPage'));
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
  profileAvatarUrl: string | null;
  onAutomationDraftDirtyChange: (dirty: boolean) => void;
  onProfileUpdated: (updated: {
    id: string;
    nome: string;
    email: string;
    telefone: string | null;
    fotoPath: string | null;
  }) => void;
}

const AccessDenied = () => (
  <div className="animate-fadeIn rounded-[2rem] border border-rose-100 bg-white p-10 text-center shadow-sm">
    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-600"><Lock size={26} /></div>
    <h2 className="text-xl font-black uppercase tracking-tight text-[#001a33]">Acesso negado</h2>
    <p className="mx-auto mt-2 max-w-xl text-sm font-medium text-slate-500">Seu usuário não possui permissão para acessar este módulo.</p>
  </div>
);

const ModuleLoading = () => (
  <div role="status" aria-label="Carregando módulo" className="flex min-h-[420px] items-center justify-center rounded-[2rem] border border-slate-100 bg-white shadow-sm">
    <div className="flex flex-col items-center gap-3 text-slate-500">
      <div className="h-9 w-9 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600" />
      <span className="text-[10px] font-black uppercase tracking-[0.2em]">Carregando módulo</span>
    </div>
  </div>
);

interface ModuleErrorBoundaryProps {
  children: React.ReactNode;
  moduleId: string;
  onReturnHome: () => void;
}

interface ModuleErrorBoundaryState {
  hasError: boolean;
}

class ModuleErrorBoundary extends React.Component<ModuleErrorBoundaryProps, ModuleErrorBoundaryState> {
  declare readonly props: Readonly<ModuleErrorBoundaryProps>;
  declare setState: (state: Partial<ModuleErrorBoundaryState>) => void;

  state: ModuleErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ModuleErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[GestorModuleContent] Falha ao renderizar módulo.', error, info);
  }

  componentDidUpdate(previousProps: ModuleErrorBoundaryProps) {
    if (this.state.hasError && previousProps.moduleId !== this.props.moduleId) {
      this.setState({ hasError: false });
    }
  }

  private retry = () => {
    window.location.reload();
  };

  private returnHome = () => {
    this.setState({ hasError: false });
    this.props.onReturnHome();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div role="alert" className="rounded-[2rem] border border-amber-200 bg-white p-10 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
          <TriangleAlert size={28} />
        </div>
        <h2 className="mt-4 text-xl font-black uppercase tracking-tight text-[#001a33]">
          Não foi possível abrir este módulo
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm font-medium text-slate-500">
          O restante do portal continua disponível. Tente carregar novamente ou volte ao início.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={this.retry}
            className="inline-flex items-center gap-2 rounded-xl bg-[#001a33] px-5 py-3 text-xs font-black uppercase tracking-wider text-white transition-colors hover:bg-blue-900"
          >
            <RefreshCw size={16} />
            Recarregar página
          </button>
          <button
            type="button"
            onClick={this.returnHome}
            className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-xs font-black uppercase tracking-wider text-slate-600 transition-colors hover:bg-slate-50"
          >
            Voltar ao início
          </button>
        </div>
      </div>
    );
  }
}

const GestorModuleContentView: React.FC<GestorModuleContentProps> = ({
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
  profileAvatarUrl,
  onAutomationDraftDirtyChange,
  onProfileUpdated,
}) => {
  if (!canOpenModule(activeModule)) return <AccessDenied />;
  if (!isMatrizSelected && activeModule.startsWith('cadastros-') && !POLO_CADASTROS_ALLOWED.has(activeModule)) {
    return <CadastrosPage onNavigate={setActiveModule} readOnly allowedTabs={allowedCadastroTabs} />;
  }
  if (activeModule.startsWith('parceiros-novo-')) {
    const requestedForm = activeModule.replace('parceiros-novo-', '') as ParceiroFormType;
    const initialForm: ParceiroFormType = ['aluno', 'professor', 'pf', 'pj'].includes(requestedForm)
      ? requestedForm
      : 'selection';
    return (
      <ParceirosPage
        initialForm={initialForm}
        poloId={scopedPoloId}
        includeGlobal={isGlobal}
        onRequestScrollTop={onRequestScrollTop}
      />
    );
  }

  switch (activeModule) {
    case 'inicio': return <DashboardPage poloId={currentPoloId} onNavigate={setActiveModule} permissions={permissions} cacheIdentity={profile.id} />;
    case 'calendario': return <CalendarioPage poloId={scopedPoloId} />;
    case 'parceiros': return <ParceirosPage poloId={scopedPoloId} includeGlobal={isGlobal} onRequestScrollTop={onRequestScrollTop} />;
    case 'cadastros': return <CadastrosPage onNavigate={setActiveModule} readOnly={!isMatrizSelected} allowedTabs={allowedCadastroTabs} />;
    case 'cadastros-checklist': return <ChecklistEstagioPage />;
    case 'cadastros-ead': return <CursosEadPage />;
    case 'cadastros-especializacao': return <CursosEspecializacaoPage readOnly={!isMatrizSelected} />;
    case 'cadastros-livres': return <CursosLivresPage readOnly={!isMatrizSelected} />;
    case 'cadastros-tecnicos': return <CursosTecnicosPage />;
    case 'cadastros-superior': return <EnsinoSuperiorPage readOnly={!isMatrizSelected} />;
    case 'cadastros-ficha': return <FichaMatriculaPage />;
    case 'cadastros-modelos':
      return <ModelosDocumentosPage canEditValidationPolicies={isGlobal} />;
    case 'gestao':
      return (
        <ModuleErrorBoundary
          moduleId={`gestao:${currentPoloId || 'global'}`}
          onReturnHome={() => setActiveModule('inicio')}
        >
          <GestaoPage poloId={currentPoloId || undefined} activePoloId={currentPoloId || undefined} isMatriz={isMatrizSelected} poloNome={currentPoloName} onRequestScrollTop={onRequestScrollTop} permissions={permissions} gestorContextId={profile.contextId || ''} />
        </ModuleErrorBoundary>
      );
    case 'secretaria': return (
      <SecretariaPage
        key={scopedPoloId || 'sem-polo'}
        poloId={scopedPoloId}
        gestorContextId={profile.contextId || ''}
        gestorPermissions={permissions}
      />
    );
    case 'caixa': return <CaixaPage poloId={scopedPoloId} poloName={currentPoloName} isGlobal={isGlobal} isMatriz={isMatrizSelected} />;
    case 'financeiro': return <FinanceiroPage poloId={scopedPoloId} isMatriz={isMatrizSelected} allowedTabs={getEffectiveFinanceiroTabs(permissions)} />;
    case 'patrimonio': return (
      <PatrimonioPage
        poloId={scopedPoloId}
        isGlobal={isGlobal}
        canManageProductTypes={isMatrizSelected && isGlobal && canAccessGestorModule(permissions, 'configuracoes')}
      />
    );
    case 'biblioteca': return <BibliotecaPage />;
    case 'comunicacao':
      if (canAccessTab(permissions, 'comunicacao', 'comunicacao-mensagem') || canAccessTab(permissions, 'comunicacao', 'comunicacao-whatsapp')) return <UnifiedCommunicationPage gestorProfile={profile} canAccessInternal={canAccessTab(permissions, 'comunicacao', 'comunicacao-mensagem')} canAccessWhatsApp={canAccessTab(permissions, 'comunicacao', 'comunicacao-whatsapp')} />;
      if (permissions.allPolos && isMatrizSelected && canAccessTab(permissions, 'comunicacao', 'comunicacao-automacoes')) return <AutomacoesMulticanalPage canAccessLegacyWhatsApp={false} onDirtyChange={onAutomationDraftDirtyChange} />;
      return <AccessDenied />;
    case 'comunicacao-atendimento': return <UnifiedCommunicationPage gestorProfile={profile} canAccessInternal={canAccessTab(permissions, 'comunicacao', 'comunicacao-mensagem')} canAccessWhatsApp={canAccessTab(permissions, 'comunicacao', 'comunicacao-whatsapp')} />;
    case 'comunicacao-atendimento-config': return <AtendimentoConfigPage poloId={currentPoloId} isGlobal={isGlobal} />;
    case 'comunicacao-notificacoes-push': return <NotificacoesPushPage />;
    case 'comunicacao-atrasados': return <MultichannelOperationsPage mode="overdue" />;
    case 'comunicacao-automacoes': return <AutomacoesMulticanalPage canAccessLegacyWhatsApp={false} onDirtyChange={onAutomationDraftDirtyChange} />;
    case 'comunicacao-fluxos':
      return (
        <ComunicacaoPage
          gestorProfile={profile}
          channel="whatsapp"
          whatsappInitialTab="fluxos"
          showWhatsAppModuleTabs={false}
        />
      );
    case 'comunicacao-agentes': return <MultichannelOperationsPage mode="agents" />;
    case 'comunicacao-configuracoes':
      return (
        <ComunicacaoPage
          gestorProfile={profile}
          channel="whatsapp"
          whatsappInitialTab="perfil"
          showWhatsAppModuleTabs={false}
        />
      );
    case 'comunicacao-mensagem': return <UnifiedCommunicationPage gestorProfile={profile} canAccessInternal canAccessWhatsApp={canAccessTab(permissions, 'comunicacao', 'comunicacao-whatsapp')} />;
    case 'comunicacao-whatsapp': return <UnifiedCommunicationPage gestorProfile={profile} canAccessInternal={canAccessTab(permissions, 'comunicacao', 'comunicacao-mensagem')} canAccessWhatsApp />;
    case 'relatorios': return <RelatoriosPage poloId={scopedPoloId} />;
    case 'meu-perfil':
      return (
        <MeuPerfilPage
          profile={profile}
          avatarUrl={profileAvatarUrl}
          onProfileUpdated={onProfileUpdated}
        />
      );
    case 'configuracoes':
      if (!isMatrizSelected) {
        return <div className="animate-fadeIn rounded-[2rem] border border-amber-100 bg-white p-10 text-center shadow-sm"><div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600"><Settings size={26} /></div><h2 className="text-xl font-black uppercase tracking-tight text-[#001a33]">Configurações disponíveis apenas na matriz</h2><p className="mx-auto mt-2 max-w-xl text-sm font-medium text-slate-500">Troque para o polo matriz no seletor superior para alterar integrações, tokens e regras globais do sistema.</p></div>;
      }
      return (
        <ConfiguracoesPage
          poloId={currentPoloId}
          canManageProductTypes={isGlobal && canAccessGestorModule(permissions, 'configuracoes')}
        />
      );
    default:
      if (activeModule.startsWith('cadastros-')) {
        const submodule = activeModule.split('-')[1];
        return <div className="animate-fadeIn"><div className="mb-6 flex items-center justify-between"><h2 className="text-2xl font-black text-[#001a33] uppercase tracking-tight">Gerenciamento de {submodule.charAt(0).toUpperCase() + submodule.slice(1)}</h2><button onClick={() => setActiveModule('cadastros')} className="text-xs font-bold text-blue-600 hover:underline uppercase tracking-widest">Ver todos os cadastros</button></div><div className="bg-white p-12 rounded-[2.5rem] border border-slate-100 shadow-sm text-center"><div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4"><Settings className="animate-spin-slow" /></div><p className="text-slate-500 font-medium">O módulo de {submodule} está sendo preparado para você.</p></div></div>;
      }
      return <DashboardPage poloId={currentPoloId} onNavigate={setActiveModule} permissions={permissions} cacheIdentity={profile.id} />;
  }
};

const GestorModuleContent: React.FC<GestorModuleContentProps> = (props) => (
  <Suspense fallback={<ModuleLoading />}>
    <GestorModuleContentView {...props} />
  </Suspense>
);

export default GestorModuleContent;
