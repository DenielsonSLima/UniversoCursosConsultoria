import React, { useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { HeartHandshake, User, UsersRound } from 'lucide-react';
import AccessCheckingScreen from '../shared/components/AccessCheckingScreen';
import ConfirmModal from '../shared/components/ConfirmModal';
import { useInactivityLogout } from '../shared/hooks/useInactivityLogout';
import { usePortalLogout } from '../shared/hooks/usePortalLogout';
import { usePortalContextAccess } from '../login/usePortalContextAccess';
import {
  resolveResponsavelModuleFromPath,
  resolveResponsavelPathFromModule,
  type ResponsavelModuleId,
} from './responsavel.contract';
import ResponsavelConnectionError from './components/ResponsavelConnectionError';
import ResponsavelDependentesPanel from './components/ResponsavelDependentesPanel';
import ResponsavelProfilePanel from './components/ResponsavelProfilePanel';
import ResponsavelShell, { type ResponsavelMenuItem } from './components/ResponsavelShell';
import { useResponsavelDependentes } from './hooks/useResponsavelDependentes';

const RESPONSAVEL_MENU: readonly ResponsavelMenuItem[] = [
  { id: 'dependentes', label: 'Dependentes', icon: <UsersRound size={20} /> },
  { id: 'perfil', label: 'Meu perfil', icon: <User size={20} /> },
];

const ResponsavelPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const contentScrollRef = useRef<HTMLDivElement>(null);
  const {
    profile,
    isLoading: isAuthLoading,
    connectionError,
    retry: retryAccess,
  } = usePortalContextAccess('Responsavel');
  const executeLogout = usePortalLogout({ loginPath: '/login' });
  const resolvedModule = resolveResponsavelModuleFromPath(location.pathname);
  const activeModule: ResponsavelModuleId = resolvedModule || 'dependentes';
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const dependentesQuery = useResponsavelDependentes(profile?.contextId);

  useInactivityLogout({
    isEnabled: Boolean(profile && !isAuthLoading),
    onTimeout: executeLogout,
  });

  if (connectionError) return <ResponsavelConnectionError onRetry={retryAccess} />;
  if (isAuthLoading || !profile) return <AccessCheckingScreen portal="Responsavel" />;

  const renderContent = () => {
    if (activeModule === 'perfil') {
      return <ResponsavelProfilePanel nome={profile.nome} email={profile.email} />;
    }

    return (
      <section>
        <div className="mb-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-purple-50 text-purple-700"><HeartHandshake size={24} /></span>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-purple-600">Portal do responsável</p>
              <h1 className="mt-1 text-2xl font-black tracking-tight text-[#001a33]">Olá, {profile.nome}</h1>
              <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-slate-500">Veja apenas os dependentes que o serviço devolveu com vínculo verificado e vigente.</p>
            </div>
          </div>
        </div>
        <ResponsavelDependentesPanel
          dependentes={dependentesQuery.data || []}
          isLoading={dependentesQuery.isPending}
          isError={dependentesQuery.isError}
          onRetry={() => void dependentesQuery.refetch()}
        />
      </section>
    );
  };

  return (
    <>
      <ResponsavelShell
        activeModule={activeModule}
        contentScrollRef={contentScrollRef}
        email={profile.email}
        isMobileMenuOpen={isMobileMenuOpen}
        menuItems={RESPONSAVEL_MENU}
        nome={profile.nome}
        onLogout={() => setIsLogoutConfirmOpen(true)}
        onMobileMenuChange={setIsMobileMenuOpen}
        onModuleChange={(moduleId) => navigate(resolveResponsavelPathFromModule(moduleId))}
      >
        {renderContent()}
      </ResponsavelShell>
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

export default ResponsavelPage;
