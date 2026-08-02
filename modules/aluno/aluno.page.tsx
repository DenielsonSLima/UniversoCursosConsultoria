import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AccessCheckingScreen from '../shared/components/AccessCheckingScreen';
import ConfirmModal from '../shared/components/ConfirmModal';
import { useInactivityLogout } from '../shared/hooks/useInactivityLogout';
import { usePortalLogout } from '../shared/hooks/usePortalLogout';
import AlunoPortalShell from './components/AlunoPortalShell';
import { useAlunoCourseAccessRealtime } from './hooks/useAlunoCourseAccessRealtime';
import { useAlunoCalendarEligibility, useAlunoUnreadChats } from './hooks/useAlunoPortalData';
import { useAlunoPortalProfile } from './hooks/useAlunoPortalProfile';
import type { PerfilTabId } from './perfil/perfil.types';

// Cada área é carregada apenas quando o aluno a acessa, reduzindo o peso inicial no celular.
const InicioPage = lazy(() => import('./inicio/InicioPage'));
const TurmasPage = lazy(() => import('./turmas/TurmasPage'));
const CursosPage = lazy(() => import('./cursos/CursosPage'));
const FinanceiroPage = lazy(() => import('./financeiro/FinanceiroPage'));
const BibliotecaPage = lazy(() => import('./biblioteca/BibliotecaPage'));
const ComunicacaoPage = lazy(() => import('./comunicacao/ComunicacaoPage'));
const PerfilPage = lazy(() => import('./perfil/PerfilPage'));
const SecretariaPage = lazy(() => import('./secretaria/SecretariaPage'));
const CalendarioAlunoPage = lazy(() => import('./calendario/CalendarioAlunoPage'));

const ALLOWED_MODULES = new Set([
  'inicio',
  'turmas',
  'cursos',
  'financeiro',
  'biblioteca',
  'comunicacao',
  'secretaria',
  'perfil',
]);

const ALLOWED_PROFILE_TABS = new Set<PerfilTabId>([
  'perfil',
  'documentos',
  'vacinas',
  'google',
  'senha',
]);

const AlunoModuleLoading = () => (
  <div className="flex min-h-[240px] items-center justify-center" role="status" aria-label="Carregando área do aluno">
    <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
  </div>
);

const AlunoPage: React.FC = () => {
  const navigate = useNavigate();
  const executeLogout = usePortalLogout({ loginPath: '/login' });
  const contentScrollRef = useRef<HTMLDivElement>(null);
  const [activeModule, setActiveModule] = useState('inicio');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const [profileNotice, setProfileNotice] = useState<'technical-enrollment' | null>(null);
  const [initialProfileTab, setInitialProfileTab] = useState<PerfilTabId>('perfil');
  const [initialCourseId, setInitialCourseId] = useState<string | null>(null);
  const [initialTurmaId, setInitialTurmaId] = useState<string | null>(null);
  const { profile, isAuthLoading, isAuthorized } = useAlunoPortalProfile();

  // O ID só é disponibilizado a queries e subscriptions depois da validação
  // autoritativa do perfil. Dados graváveis do sessionStorage nunca autorizam o portal.
  const alunoId = isAuthorized ? profile?.id || '' : '';
  const canViewCalendar = useAlunoCalendarEligibility(alunoId, isAuthorized);
  const unreadChatsCount = useAlunoUnreadChats(alunoId, isAuthorized);
  useAlunoCourseAccessRealtime(alunoId, isAuthorized);

  const scrollContentToTop = useCallback(() => {
    requestAnimationFrame(() => {
      contentScrollRef.current?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    });
  }, []);

  useEffect(() => {
    scrollContentToTop();
  }, [activeModule, scrollContentToTop]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedModule = params.get('module');
    const requestedCourseId = params.get('courseId');
    const requestedProfileTab = params.get('tab') as PerfilTabId | null;

    if (requestedModule && ALLOWED_MODULES.has(requestedModule)) {
      setActiveModule(requestedModule);
    }
    if (requestedCourseId) {
      setInitialCourseId(requestedCourseId);
      setActiveModule('cursos');
    }
    if (requestedProfileTab && ALLOWED_PROFILE_TABS.has(requestedProfileTab)) {
      setInitialProfileTab(requestedProfileTab);
    }
    if (params.get('technicalEnrollment') === '1') {
      setProfileNotice('technical-enrollment');
      setInitialProfileTab('documentos');
      setActiveModule('perfil');
      navigate('/aluno', { replace: true });
      return;
    }
    if (params.get('asaas') === 'success') {
      setActiveModule('turmas');
      navigate('/aluno', { replace: true });
    }
  }, [navigate]);

  useInactivityLogout({
    isEnabled: isAuthorized,
    onTimeout: executeLogout,
  });

  useEffect(() => {
    if (activeModule === 'calendario' && !canViewCalendar) {
      setActiveModule('inicio');
    }
  }, [activeModule, canViewCalendar]);

  if (isAuthLoading || !isAuthorized || !profile) {
    return <AccessCheckingScreen portal="Aluno" />;
  }

  const alunoNome = profile.nome || '';
  const alunoEmail = profile.email || '';

  const requireTechnicalProfileCompletion = () => {
    setProfileNotice('technical-enrollment');
    setActiveModule('perfil');
  };

  const renderContent = () => {
    switch (activeModule) {
      case 'inicio':
        return (
          <InicioPage
            alunoId={alunoId}
            canViewCalendar={canViewCalendar}
            onNavigate={setActiveModule}
            onOpenCourse={(courseId, turmaId, targetModule) => {
              setInitialCourseId(courseId);
              setInitialTurmaId(turmaId || null);
              setActiveModule(targetModule || 'cursos');
            }}
          />
        );
      case 'turmas':
        return (
          <TurmasPage
            alunoId={alunoId}
            initialCourseId={initialCourseId}
            initialTurmaId={initialTurmaId}
            onInitialSelectionConsumed={() => {
              setInitialCourseId(null);
              setInitialTurmaId(null);
            }}
          />
        );
      case 'cursos':
        return (
          <CursosPage
            alunoId={alunoId}
            initialCourseId={initialCourseId}
            onRequireTechnicalProfile={requireTechnicalProfileCompletion}
          />
        );
      case 'calendario':
        return <CalendarioAlunoPage alunoId={alunoId} />;
      case 'financeiro':
        return <FinanceiroPage alunoId={alunoId} />;
      case 'biblioteca':
        return <BibliotecaPage alunoId={alunoId} />;
      case 'comunicacao':
        return <ComunicacaoPage alunoId={alunoId} alunoNome={alunoNome} />;
      case 'secretaria':
        return <SecretariaPage alunoId={alunoId} />;
      case 'perfil':
        return (
          <PerfilPage
            alunoId={alunoId}
            initialTab={initialProfileTab}
            technicalEnrollmentNotice={profileNotice === 'technical-enrollment'}
            onTechnicalEnrollmentNoticeResolved={() => setProfileNotice(null)}
          />
        );
      default:
        return <InicioPage alunoId={alunoId} canViewCalendar={canViewCalendar} onNavigate={setActiveModule} />;
    }
  };

  return (
    <>
      <AlunoPortalShell
        activeModule={activeModule}
        alunoEmail={alunoEmail}
        alunoNome={alunoNome}
        canViewCalendar={canViewCalendar}
        contentScrollRef={contentScrollRef}
        isMobileMenuOpen={isMobileMenuOpen}
        unreadChatsCount={unreadChatsCount}
        onLogout={() => setIsLogoutConfirmOpen(true)}
        onMobileMenuChange={setIsMobileMenuOpen}
        onModuleChange={setActiveModule}
      >
        <Suspense fallback={<AlunoModuleLoading />}>
          {renderContent()}
        </Suspense>
      </AlunoPortalShell>

      <ConfirmModal
        isOpen={isLogoutConfirmOpen}
        title="Confirmação"
        message="Deseja realmente sair?"
        confirmText="Sair"
        cancelText="Cancelar"
        variant="danger"
        onClose={() => setIsLogoutConfirmOpen(false)}
        onConfirm={executeLogout}
      />
    </>
  );
};

export default AlunoPage;
