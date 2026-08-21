import React, { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router';
import {
  FileSignature,
  HeartHandshake,
  Loader2,
  RefreshCw,
  User,
  UsersRound,
} from 'lucide-react';
import AccessCheckingScreen from '../shared/components/AccessCheckingScreen';
import ConfirmModal from '../shared/components/ConfirmModal';
import { useInactivityLogout } from '../shared/hooks/useInactivityLogout';
import { usePortalLogout } from '../shared/hooks/usePortalLogout';
import ProfessorShell, { type ProfessorMenuItem } from '../professor/components/ProfessorShell';
import { usePortalContextAccess } from '../login/usePortalContextAccess';
import {
  resolveResponsavelModuleFromPath,
  resolveResponsavelPathFromModule,
  responsavelQueryKeys,
  type ResponsavelDependente,
} from './responsavel.contract';
import { listarDependentesResponsavel } from './responsavel.service';
import ElectronicSignatureInbox from '../shared/assinatura-eletronica/ElectronicSignatureInbox';

const RESPONSAVEL_MENU: readonly ProfessorMenuItem[] = [
  { id: 'dependentes', label: 'Dependentes', icon: <UsersRound size={20} /> },
  { id: 'assinaturas', label: 'Assinaturas', icon: <FileSignature size={20} /> },
  { id: 'perfil', label: 'Meu perfil', icon: <User size={20} /> },
];

const relationshipLabel: Record<ResponsavelDependente['parentesco'], string> = {
  MAE: 'Mãe',
  PAI: 'Pai',
  TUTOR: 'Tutor(a)',
  GUARDIAO_JUDICIAL: 'Guardião(ã) judicial',
  OUTRO: 'Outro vínculo',
};

const DependentesPanel: React.FC<{
  dependentes: readonly ResponsavelDependente[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}> = ({ dependentes, isLoading, isError, onRetry }) => {
  if (isLoading) return <div className="flex min-h-52 items-center justify-center gap-3 rounded-3xl border border-slate-200 bg-white text-sm font-bold text-slate-500"><Loader2 size={20} className="animate-spin text-purple-600" /> Conferindo dependentes vinculados…</div>;
  if (isError) return <div className="rounded-3xl border border-rose-100 bg-rose-50 p-6"><p className="text-sm font-black text-rose-800">Não foi possível conferir os dependentes deste perfil.</p><p className="mt-1 text-xs font-medium leading-relaxed text-rose-700">Nenhuma informação acadêmica é exibida enquanto o serviço autorizado não responder.</p><button type="button" onClick={onRetry} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-black text-rose-700 shadow-sm ring-1 ring-rose-100"><RefreshCw size={15} /> Tentar novamente</button></div>;
  if (dependentes.length === 0) return <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center"><HeartHandshake className="mx-auto text-slate-400" size={27} /><p className="mt-3 text-sm font-black text-[#001a33]">Nenhum dependente disponível</p><p className="mx-auto mt-1 max-w-lg text-xs font-medium leading-relaxed text-slate-500">A secretaria precisa concluir um vínculo verificado e vigente antes de ele aparecer neste portal.</p></div>;
  return <div className="grid gap-4 md:grid-cols-2">{dependentes.map((dependente) => <article key={dependente.vinculoId} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-base font-black text-[#001a33]">{dependente.nome}</p><p className="mt-1 text-xs font-bold text-slate-500">{relationshipLabel[dependente.parentesco]}</p></div><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-emerald-700">Vínculo ativo</span></div><div className="mt-4 rounded-2xl bg-slate-50 p-3"><p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Escopo informado pelo serviço</p><p className="mt-1 text-xs font-bold text-slate-700">{dependente.poloIds.length === 1 ? '1 polo vinculado' : `${dependente.poloIds.length} polos vinculados`}</p></div></article>)}</div>;
};

const PortalConnectionError: React.FC<{ onRetry: () => void }> = ({ onRetry }) => (
  <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
    <section className="w-full max-w-xl rounded-3xl border border-rose-100 bg-white p-8 text-center shadow-xl">
      <RefreshCw className="mx-auto text-rose-600" size={28} />
      <h1 className="mt-4 text-xl font-black text-[#001a33]">Não foi possível conferir o acesso</h1>
      <p className="mt-2 text-sm font-medium leading-relaxed text-slate-500">Nenhum dado do responsável foi liberado. Verifique a conexão e tente novamente; sua sessão não foi encerrada.</p>
      <button type="button" onClick={onRetry} className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-[#001a33] px-5 text-xs font-black uppercase tracking-wide text-white hover:bg-blue-900"><RefreshCw size={16} /> Tentar novamente</button>
    </section>
  </main>
);

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
  const activeModule = resolveResponsavelModuleFromPath(location.pathname) || 'dependentes';
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const dependentesQuery = useQuery({
    queryKey: responsavelQueryKeys.dependentes(profile?.contextId || 'sem-contexto'),
    queryFn: () => listarDependentesResponsavel(profile?.contextId || ''),
    enabled: Boolean(profile?.contextId),
    staleTime: 30_000,
    retry: false,
  });
  useInactivityLogout({ isEnabled: Boolean(profile && !isAuthLoading), onTimeout: executeLogout });

  if (connectionError) return <PortalConnectionError onRetry={retryAccess} />;
  if (isAuthLoading || !profile) return <AccessCheckingScreen portal="Responsavel" />;

  const renderContent = () => {
    if (activeModule === 'assinaturas') {
      return (
        <ElectronicSignatureInbox
          audience="responsavel"
          profile="RESPONSAVEL_LEGAL"
          contextId={profile.contextId || ''}
          heading="Assinaturas do responsável"
        />
      );
    }
    if (activeModule === 'perfil') return <section className="max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-purple-600">Perfil do portal</p><h1 className="mt-1 text-2xl font-black text-[#001a33]">{profile.nome}</h1><dl className="mt-6 grid gap-3 sm:grid-cols-2"><div className="rounded-2xl bg-slate-50 p-4"><dt className="text-[9px] font-black uppercase tracking-wider text-slate-400">E-mail</dt><dd className="mt-1 break-all text-sm font-bold text-slate-700">{profile.email}</dd></div><div className="rounded-2xl bg-slate-50 p-4"><dt className="text-[9px] font-black uppercase tracking-wider text-slate-400">Acesso</dt><dd className="mt-1 text-sm font-bold text-slate-700">Responsável legal</dd></div></dl></section>;
    return <section><div className="mb-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-start gap-4"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-purple-50 text-purple-700"><HeartHandshake size={24} /></span><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-purple-600">Portal do responsável</p><h1 className="mt-1 text-2xl font-black tracking-tight text-[#001a33]">Olá, {profile.nome}</h1><p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-slate-500">Veja apenas os dependentes que o serviço devolveu com vínculo verificado e vigente.</p></div></div></div><DependentesPanel dependentes={dependentesQuery.data || []} isLoading={dependentesQuery.isPending} isError={dependentesQuery.isError} onRetry={() => void dependentesQuery.refetch()} /></section>;
  };
  return <><ProfessorShell activeModule={activeModule} activePolos={[]} contentScrollRef={contentScrollRef} currentPolo={null} currentPoloId={null} isMobileMenuOpen={isMobileMenuOpen} isPoloSelectorOpen={false} professorEmail={profile.email} professorNome={profile.nome} menuItems={RESPONSAVEL_MENU} portalTitle="Portal do Responsável" portalRoleLabel="Responsável" logoutAriaLabel="Sair do portal do responsável" onLogout={() => setIsLogoutConfirmOpen(true)} onModuleChange={(moduleId) => navigate(resolveResponsavelPathFromModule(moduleId))} onMobileMenuChange={setIsMobileMenuOpen} onPoloChange={() => undefined} onPoloSelectorChange={() => undefined}>{renderContent()}</ProfessorShell><ConfirmModal isOpen={isLogoutConfirmOpen} title="Confirmação" message="Deseja realmente sair?" confirmText="Sair" cancelText="Cancelar" variant="danger" onClose={() => setIsLogoutConfirmOpen(false)} onConfirm={executeLogout} /></>;
};

export default ResponsavelPage;
