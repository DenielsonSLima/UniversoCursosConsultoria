import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router';
import {
  BookOpenCheck,
  FileSignature,
  LayoutDashboard,
  Loader2,
  RefreshCw,
  ShieldCheck,
  User,
  UsersRound,
} from 'lucide-react';
import AccessCheckingScreen from '../shared/components/AccessCheckingScreen';
import ConfirmModal from '../shared/components/ConfirmModal';
import { useInactivityLogout } from '../shared/hooks/useInactivityLogout';
import { usePortalLogout } from '../shared/hooks/usePortalLogout';
import ProfessorShell, {
  type ProfessorMenuItem,
  type ProfessorPolo,
} from '../professor/components/ProfessorShell';
import { usePortalContextAccess } from '../login/usePortalContextAccess';
import ElectronicSignatureInbox from '../shared/assinatura-eletronica/ElectronicSignatureInbox';
import {
  coordenadorQueryKeys,
  resolveCoordenadorModuleFromPath,
  resolveCoordenadorPathFromModule,
  type CoordenadorAtribuicao,
} from './coordenador.contract';
import { listarAtribuicoesCoordenador } from './coordenador.service';

const COORDENADOR_MENU: readonly ProfessorMenuItem[] = [
  { id: 'inicio', label: 'Início', icon: <LayoutDashboard size={20} /> },
  { id: 'turmas-diarios', label: 'Turmas e diários', icon: <BookOpenCheck size={20} /> },
  { id: 'assinaturas', label: 'Assinaturas', icon: <FileSignature size={20} /> },
  { id: 'perfil', label: 'Meu perfil', icon: <User size={20} /> },
];

const formatVigencia = (value: string | null) => {
  if (!value) return 'Vigência atual';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Vigência informada pelo serviço';
  return `Desde ${parsed.toLocaleDateString('pt-BR')}`;
};

const ScopesPanel: React.FC<{
  assignments: readonly CoordenadorAtribuicao[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}> = ({ assignments, isLoading, isError, onRetry }) => {
  if (isLoading) {
    return <div className="flex min-h-52 items-center justify-center gap-3 rounded-3xl border border-slate-200 bg-white text-sm font-bold text-slate-500"><Loader2 size={20} className="animate-spin text-purple-600" /> Carregando escopos autorizados…</div>;
  }
  if (isError) {
    return (
      <div className="rounded-3xl border border-rose-100 bg-rose-50 p-6">
        <p className="text-sm font-black text-rose-800">Não foi possível conferir seus escopos de coordenação.</p>
        <p className="mt-1 text-xs font-medium leading-relaxed text-rose-700">Nenhuma turma ou diário é exibido até o serviço autorizado responder.</p>
        <button type="button" onClick={onRetry} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-black text-rose-700 shadow-sm ring-1 ring-rose-100"><RefreshCw size={15} /> Tentar novamente</button>
      </div>
    );
  }
  if (assignments.length === 0) {
    return <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center"><ShieldCheck className="mx-auto text-slate-400" size={26} /><p className="mt-3 text-sm font-black text-[#001a33]">Nenhum escopo de coordenação ativo</p><p className="mx-auto mt-1 max-w-lg text-xs font-medium leading-relaxed text-slate-500">Quando houver uma atribuição vigente, o serviço a apresentará aqui. Este portal não libera acesso por conta própria.</p></div>;
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {assignments.map((assignment) => (
        <article key={assignment.coordenacaoId} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-purple-600">Escopo vigente</p><h3 className="mt-1 text-base font-black text-[#001a33]">{assignment.cursoNome}</h3></div><span className="rounded-full bg-purple-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-purple-700">Somente leitura</span></div>
          <dl className="mt-4 grid gap-3 text-xs"><div className="rounded-xl bg-slate-50 p-3"><dt className="text-[9px] font-black uppercase tracking-wider text-slate-400">Polo</dt><dd className="mt-1 font-bold text-slate-700">{assignment.poloNome}</dd></div><div className="rounded-xl bg-slate-50 p-3"><dt className="text-[9px] font-black uppercase tracking-wider text-slate-400">Vigência</dt><dd className="mt-1 font-bold text-slate-700">{formatVigencia(assignment.vigenteDe)}{assignment.vigenteAte ? ` · até ${new Date(assignment.vigenteAte).toLocaleDateString('pt-BR')}` : ''}</dd></div></dl>
        </article>
      ))}
    </div>
  );
};

const PortalConnectionError: React.FC<{ onRetry: () => void }> = ({ onRetry }) => (
  <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
    <section className="w-full max-w-xl rounded-3xl border border-rose-100 bg-white p-8 text-center shadow-xl">
      <RefreshCw className="mx-auto text-rose-600" size={28} />
      <h1 className="mt-4 text-xl font-black text-[#001a33]">Não foi possível conferir o acesso</h1>
      <p className="mt-2 text-sm font-medium leading-relaxed text-slate-500">Nenhum escopo de coordenação foi liberado. Verifique a conexão e tente novamente; sua sessão não foi encerrada.</p>
      <button type="button" onClick={onRetry} className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-[#001a33] px-5 text-xs font-black uppercase tracking-wide text-white hover:bg-blue-900"><RefreshCw size={16} /> Tentar novamente</button>
    </section>
  </main>
);

const coordinatorPolosFromScopes = (scopes: readonly Record<string, unknown>[] | undefined) => {
  const unique = new Map<string, ProfessorPolo>();
  for (const scope of scopes || []) {
    const id = typeof scope.poloId === 'string' ? scope.poloId.trim() : '';
    const nome = typeof scope.poloNome === 'string' ? scope.poloNome.trim() : '';
    if (id && nome) unique.set(id, { id, nome });
  }
  return [...unique.values()];
};

const CoordenadorPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const contentScrollRef = useRef<HTMLDivElement>(null);
  const {
    profile,
    isLoading: isAuthLoading,
    connectionError,
    retry: retryAccess,
  } = usePortalContextAccess('Coordenador');
  const executeLogout = usePortalLogout({ loginPath: '/sistema/login' });
  const activeModule = resolveCoordenadorModuleFromPath(location.pathname) || 'inicio';
  const [activePoloId, setActivePoloId] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const [isPoloSelectorOpen, setIsPoloSelectorOpen] = useState(false);
  const assignmentsQuery = useQuery({
    queryKey: coordenadorQueryKeys.atribuicoes(
      profile?.contextId || 'sem-contexto',
      activePoloId,
    ),
    queryFn: () => {
      if (!profile?.contextId || !activePoloId) {
        throw new Error('O contexto e o polo ativo são obrigatórios para consultar as coordenações.');
      }
      return listarAtribuicoesCoordenador(profile.contextId, activePoloId);
    },
    enabled: Boolean(profile?.contextId && activePoloId),
    staleTime: 30_000,
    retry: false,
  });
  const activePolos = useMemo(() => {
    const scopedPolos = coordinatorPolosFromScopes(
      profile?.scopes as readonly Record<string, unknown>[] | undefined,
    );
    if (scopedPolos.length > 0) return scopedPolos;
    const unique = new Map<string, ProfessorPolo>();
    for (const assignment of assignmentsQuery.data || []) {
      unique.set(assignment.poloId, { id: assignment.poloId, nome: assignment.poloNome });
    }
    return [...unique.values()];
  }, [assignmentsQuery.data, profile?.scopes]);
  const activePoloFingerprint = activePolos.map((polo) => polo.id).join(':');
  const currentPolo = activePolos.find((polo) => polo.id === activePoloId) || null;

  useEffect(() => {
    if (!profile) return;
    const requestedPoloId = new URLSearchParams(location.search).get('polo');
    const allowedPoloIds = activePolos.map((polo) => polo.id);
    const requestedPoloIsAllowed = Boolean(requestedPoloId && allowedPoloIds.includes(requestedPoloId));
    const nextPoloId = [requestedPoloId, profile.activePoloId, ...allowedPoloIds]
      .find((candidate): candidate is string => Boolean(candidate && allowedPoloIds.includes(candidate))) || null;
    setActivePoloId((current) => (
      requestedPoloIsAllowed
        ? requestedPoloId
        : current && allowedPoloIds.includes(current)
          ? current
          : nextPoloId
    ));
  }, [activePoloFingerprint, activePolos, location.search, profile]);

  useInactivityLogout({
    isEnabled: Boolean(profile && !isAuthLoading),
    onTimeout: executeLogout,
  });

  if (connectionError) return <PortalConnectionError onRetry={retryAccess} />;
  if (isAuthLoading || !profile) return <AccessCheckingScreen portal="Coordenador" />;

  const assignments = assignmentsQuery.data || [];
  const renderContent = () => {
    if (activeModule === 'turmas-diarios') {
      return <section><div className="mb-6"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-purple-600">Consulta autorizada</p><h1 className="mt-1 text-2xl font-black tracking-tight text-[#001a33]">Turmas e diários</h1><p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-slate-500">Os escopos abaixo vêm do serviço. A consulta detalhada e qualquer lançamento continuam bloqueados nesta fundação.</p></div><ScopesPanel assignments={assignments} isLoading={assignmentsQuery.isPending} isError={assignmentsQuery.isError} onRetry={() => void assignmentsQuery.refetch()} /></section>;
    }
    if (activeModule === 'assinaturas') {
      return (
        <ElectronicSignatureInbox
          audience="coordenador"
          profile="COORDENADOR"
          contextId={profile.contextId}
          heading="Assinaturas do coordenador"
          poloId={activePoloId}
        />
      );
    }
    if (activeModule === 'perfil') {
      return <section className="max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-purple-600">Perfil do portal</p><h1 className="mt-1 text-2xl font-black text-[#001a33]">{profile.nome}</h1><dl className="mt-6 grid gap-3 sm:grid-cols-2"><div className="rounded-2xl bg-slate-50 p-4"><dt className="text-[9px] font-black uppercase tracking-wider text-slate-400">E-mail</dt><dd className="mt-1 break-all text-sm font-bold text-slate-700">{profile.email}</dd></div><div className="rounded-2xl bg-slate-50 p-4"><dt className="text-[9px] font-black uppercase tracking-wider text-slate-400">Contexto</dt><dd className="mt-1 text-sm font-bold text-slate-700">Coordenação de cursos</dd></div></dl></section>;
    }
    return <section><div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-start gap-4"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-purple-50 text-purple-700"><UsersRound size={24} /></span><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-purple-600">Portal do coordenador</p><h1 className="mt-1 text-2xl font-black tracking-tight text-[#001a33]">Olá, {profile.nome}</h1><p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-slate-500">Consulte seus escopos de curso e acompanhe a preparação das assinaturas. A autorização continua sendo conferida pelo serviço em cada operação.</p></div></div></div><div className="mt-5"><ScopesPanel assignments={assignments} isLoading={assignmentsQuery.isPending} isError={assignmentsQuery.isError} onRetry={() => void assignmentsQuery.refetch()} /></div></section>;
  };

  const navigateToModule = (moduleId: string) => {
    const params = new URLSearchParams();
    if (activePoloId) params.set('polo', activePoloId);
    const search = params.toString();
    navigate(`${resolveCoordenadorPathFromModule(moduleId)}${search ? `?${search}` : ''}`);
  };
  const changePolo = (poloId: string) => {
    if (!activePolos.some((polo) => polo.id === poloId)) return;
    setActivePoloId(poloId);
    setIsPoloSelectorOpen(false);
    const params = new URLSearchParams(location.search);
    params.set('polo', poloId);
    navigate(`${resolveCoordenadorPathFromModule(activeModule)}?${params.toString()}`, { replace: true });
  };

  return <><ProfessorShell activeModule={activeModule} activePolos={activePolos} contentScrollRef={contentScrollRef} currentPolo={currentPolo} currentPoloId={activePoloId} isMobileMenuOpen={isMobileMenuOpen} isPoloSelectorOpen={isPoloSelectorOpen} professorEmail={profile.email} professorNome={profile.nome} menuItems={COORDENADOR_MENU} portalTitle="Portal do Coordenador" portalRoleLabel="Coordenação" logoutAriaLabel="Sair do portal do coordenador" onLogout={() => setIsLogoutConfirmOpen(true)} onModuleChange={navigateToModule} onMobileMenuChange={setIsMobileMenuOpen} onPoloChange={changePolo} onPoloSelectorChange={setIsPoloSelectorOpen}>{renderContent()}</ProfessorShell><ConfirmModal isOpen={isLogoutConfirmOpen} title="Confirmação" message="Deseja realmente sair?" confirmText="Sair" cancelText="Cancelar" variant="danger" onClose={() => setIsLogoutConfirmOpen(false)} onConfirm={executeLogout} /></>;
};

export default CoordenadorPage;
