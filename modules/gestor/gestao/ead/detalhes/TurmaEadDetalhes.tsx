import { EadTrustAccessAction } from './components/EadTrustAccessAction';
import TurmaDetailsHeader from '../../components/TurmaDetailsHeader';
import React, { useEffect, useState } from 'react';
import {
  BarChart3,
  CreditCard,
  GraduationCap,
  LockKeyhole,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { Turma } from '../../gestao.types';
import ToastNotification, { useToast } from '../../../parceiros/components/shared/ToastNotification';
import { AlunoDisponivel } from './ead-turma.types';
import {
  useTurmaEadAlunos,
  useTurmaEadAlunosDisponiveis,
  useTurmaEadPagamentos,
  useTurmaEadResumo,
} from './hooks/useTurmaEadQueries';
import {
  useMatricularAlunoEadMutation,
} from './hooks/useTurmaEadMutations';
import { useTurmaEadRealtime } from './hooks/useTurmaEadRealtime';
import useDebouncedValue from './hooks/useDebouncedValue';
import { EadFinanceiroPanel } from './components/EadFinanceiroPanel';
import { EadEnrollmentAction } from './components/EadEnrollmentAction';
import { canAddAlunoEad, canChooseEadFinancial } from './ead-enrollment.model';
import AdicionarAlunoEadModal from './components/AdicionarAlunoEadModal';
import StatCard from './components/EadStatCard';
import { formatCurrency, statusStyle, statusLabel, normalizeStatus, isEadEnrollmentActive, isEadEnrollmentPending } from './ead-turma.presentation';
import {
  canAccessGestaoTurmaTab,
  type GestorPermissions,
} from '../../../access-control';

interface TurmaEadDetalhesProps {
  turma: Turma;
  onBack: () => void;
  permissions: GestorPermissions;
}

const TurmaEadDetalhes: React.FC<TurmaEadDetalhesProps> = ({ turma, onBack, permissions }) => {
  const { toasts, removeToast, toast } = useToast();
  const [activeTab, setActiveTab] = useState<'resumo' | 'alunos' | 'financeiro' | 'configuracoes'>('resumo');
  const canManageEnrollment = canAddAlunoEad(permissions);
  const canChooseFinancial = canChooseEadFinancial(permissions);
  const canViewFinanceiro = canAccessGestaoTurmaTab(permissions, 'financeiro');
  const [searchAluno, setSearchAluno] = useState('');
  const [showAddAluno, setShowAddAluno] = useState(false);
  const normalizedSearchAluno = searchAluno.trim();
  const debouncedSearchAluno = useDebouncedValue(normalizedSearchAluno, 300);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [turma.id]);

  useTurmaEadRealtime(turma.id);

  const resumoQuery = useTurmaEadResumo(turma.id);
  const alunosQuery = useTurmaEadAlunos(turma.id);
  const alunosDisponiveisQuery = useTurmaEadAlunosDisponiveis(turma.id, debouncedSearchAluno, showAddAluno && canManageEnrollment);
  const matricularMutation = useMatricularAlunoEadMutation(
    turma.id,
    turma.cursoId,
    (alunosDisponiveisQuery.data || []) as AlunoDisponivel[],
    canManageEnrollment,
    canChooseFinancial,
    {
      onSuccess: (alunoNome, result) => {
        if (result.mode === 'SEM_COBRANCA') {
          toast.success('Aluno adicionado sem cobrança', `${alunoNome} já tem acesso às aulas. Nenhum lançamento financeiro foi gerado.`);
        } else if (result.checkout.paymentReviewRequired) {
          toast.error('Cobrança em conferência', 'A matrícula permanece sem acesso. Confira a tentativa financeira antes de continuar.');
        } else {
          toast.success(
            result.checkout.alreadyPaid ? 'Matrícula já existente' : 'Aguardando pagamento',
            result.checkout.alreadyPaid
              ? `${alunoNome} já possui vínculo com este curso. Confira a situação da matrícula.`
              : `${alunoNome} está aguardando pagamento. O acesso será liberado automaticamente após a confirmação.`,
          );
        }
        setShowAddAluno(false);
        setSearchAluno('');
      },
      onError: (error: any) => {
        toast.error('Não foi possível adicionar', error?.message || 'Tente novamente em alguns instantes.');
      },
    },
  );

  const resumo = resumoQuery.data;
  const alunos = alunosQuery.data || [];
  const alunosComAcesso = alunos.filter((aluno) => isEadEnrollmentActive(aluno.status));
  const alunosPendentes = alunos.filter((aluno) => isEadEnrollmentPending(aluno.status));
  const alunosLiberados = alunosComAcesso.length;
  const alunosConcluidos = alunosComAcesso.filter((aluno) => normalizeStatus(aluno.status) === 'CONCLUIDO').length;
  const alunosPendentesCount = alunosPendentes.length;
  const pagamentosQuery = useTurmaEadPagamentos(turma.id, canViewFinanceiro);

  const tabs = [
    { id: 'resumo', label: 'Resumo', icon: <BarChart3 size={17} /> },
    { id: 'alunos', label: 'Alunos', icon: <Users size={17} /> },
    { id: 'financeiro', label: 'Financeiro', icon: <CreditCard size={17} /> },
    { id: 'configuracoes', label: 'Configuracoes', icon: <Settings size={17} /> },
  ].filter((tab) => canAccessGestaoTurmaTab(permissions, tab.id)) as Array<{
    id: 'resumo' | 'alunos' | 'financeiro' | 'configuracoes';
    label: string;
    icon: React.ReactNode;
  }>;

  useEffect(() => {
    if (!tabs.some((tab) => tab.id === activeTab)) {
      setActiveTab(tabs[0]?.id || 'resumo');
    }
  }, [activeTab, permissions]);

  const renderResumo = () => (
    <div className="space-y-4">
      <div className="turma-summary-metrics grid grid-cols-1 md:grid-cols-4">
        <StatCard label="Alunos com acesso" value={alunosLiberados} icon={<Users size={18} />} tone="purple" />
        {canViewFinanceiro && <StatCard label="Pendentes" value={alunosPendentesCount} icon={<CreditCard size={18} />} tone="amber" />}
        <StatCard label="Liberados" value={alunosLiberados} icon={<ShieldCheck size={18} />} tone="emerald" />
        <StatCard label="Concluidos" value={alunosConcluidos} icon={<GraduationCap size={18} />} tone="blue" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-[15px] font-medium tracking-tight text-[#001a33]">Operacao da turma</h3>
              <p className="text-xs font-normal text-slate-500">Acompanhamento EAD separado da gestao tecnica.</p>
            </div>
            <span className="rounded-full border border-purple-100 bg-purple-50 px-3 py-1 text-[11px] font-medium text-purple-700">
              {resumo?.area || 'EAD'}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-[11px] font-medium text-slate-400">Curso</p>
              <p className="mt-1 text-xs font-medium text-[#122b42]">{resumo?.cursoNome || turma.cursoNome}</p>
            </div>
            {canViewFinanceiro && (
              <div className="rounded-lg bg-slate-50 p-4">
                <p className="text-[11px] font-medium text-slate-400">Valor publico</p>
                <p className="mt-1 text-sm font-medium text-emerald-700">{formatCurrency(resumo?.valor)}</p>
              </div>
            )}
            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-[11px] font-medium text-slate-400">Aulas e atividades</p>
              <p className="mt-1 text-xs font-medium text-[#122b42]">
                {resumo?.configuracao?.conteudos?.length || 0} aulas / {resumo?.configuracao?.atividades?.length || 0} atividades
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-[11px] font-medium text-slate-400">Tempo minimo</p>
              <p className="mt-1 text-xs font-medium text-[#122b42]">
                {resumo?.configuracao?.regras?.tempoMinimoMinutos || 0} minutos
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="text-[15px] font-medium tracking-tight text-[#001a33]">Certificados</h3>
          <div className="mt-5 space-y-3">
            <div className="flex items-center justify-between rounded-lg bg-slate-50 p-4 text-sm font-medium">
              <span className="text-slate-500">Pendentes</span>
              <span className="text-amber-600">{resumo?.certificadosPendentes ?? 0}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-slate-50 p-4 text-sm font-medium">
              <span className="text-slate-500">Emitidos</span>
              <span className="text-emerald-600">{resumo?.certificadosEmitidos ?? 0}</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );

  const renderAlunos = () => (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h3 className="text-[15px] font-medium tracking-tight text-[#001a33]">Alunos da turma EAD</h3>
          <p className="text-xs font-normal text-slate-500">Somente matrículas com acesso liberado à turma.</p>
        </div>
        <EadEnrollmentAction permissions={permissions} onClick={() => setShowAddAluno(true)} />
      </div>

      {alunosQuery.isLoading ? (
        <div className="py-12 text-center text-sm font-normal text-slate-400">Carregando alunos...</div>
      ) : alunosComAcesso.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 py-12 text-center text-sm font-normal text-slate-400">
          Nenhum aluno com acesso nesta turma EAD no momento.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-100">
          <div className="grid min-w-[900px] grid-cols-[1.4fr_0.9fr_0.9fr_0.8fr_0.7fr] gap-3 bg-slate-50 px-4 py-3 text-[11px] font-medium text-slate-400">
            <span>Aluno</span>
            <span>Status</span>
            <span>Progresso</span>
            <span>Certificado</span>
            <span className="text-right">Acao</span>
          </div>
          <div className="divide-y divide-slate-100">
            {alunosComAcesso.map((aluno) => (
              <div key={aluno.matriculaId} className="grid min-w-[900px] grid-cols-[1.4fr_0.9fr_0.9fr_0.8fr_0.7fr] gap-3 px-4 py-4 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium text-[#001a33]" title={aluno.nome}>{aluno.nome}</p>
                  <p className="truncate text-xs font-normal text-slate-400" title={aluno.email || ''}>{aluno.email || 'Sem email'}</p>
                </div>
                <div>
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider ${statusStyle(aluno.status)}`}>
                    {statusLabel(aluno.status)}
                  </span>
                  {aluno.inscricaoStatus === 'AGUARDANDO_PAGAMENTO' && (
                    <p className="mt-1 text-[10px] font-normal text-amber-600">boleto/pagamento pendente</p>
                  )}
                </div>
                <div>
                  <p className="text-xs font-medium text-[#122b42]">{aluno.progressoPercentual}%</p>
                  <p className="text-[10px] font-normal uppercase text-slate-400">
                    {aluno.aulasConcluidas}/{aluno.totalAulas} aulas • {aluno.atividadesConcluidas}/{aluno.totalAtividades} atividades
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase text-slate-600">{aluno.certificadoStatus || 'Nao emitido'}</p>
                  <p className="text-[10px] font-normal text-slate-400">Prova: {aluno.notaProva ?? '-'}</p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-medium uppercase text-slate-300">Sem ação</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {canViewFinanceiro && alunosPendentes.length > 0 && (
        <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50/40 p-6">
          <div className="mb-4">
            <h4 className="text-sm font-medium uppercase tracking-tight text-[#001a33]">Pendências de pagamento</h4>
            <p className="text-xs font-normal text-slate-500">Não entram como acesso ativo até a confirmação da matrícula.</p>
          </div>

          <div className="overflow-x-auto rounded-lg border border-amber-100 bg-white">
            <div className="grid min-w-[900px] grid-cols-[1.4fr_0.9fr_0.9fr_0.8fr_0.7fr] gap-3 bg-amber-50 px-4 py-3 text-[11px] font-medium text-amber-700">
              <span>Aluno</span>
              <span>Status</span>
              <span>Progresso</span>
              <span>Certificado</span>
              <span className="text-right">Ação</span>
            </div>
            <div className="divide-y divide-amber-100">
              {alunosPendentes.map((aluno) => (
                <div key={aluno.matriculaId} className="grid min-w-[900px] grid-cols-[1.4fr_0.9fr_0.9fr_0.8fr_0.7fr] gap-3 px-4 py-4 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-[#001a33]" title={aluno.nome}>{aluno.nome}</p>
                    <p className="truncate text-xs font-normal text-slate-400" title={aluno.email || ''}>{aluno.email || 'Sem email'}</p>
                  </div>
                  <div>
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider ${statusStyle(aluno.status)}`}>
                      {statusLabel(aluno.status)}
                    </span>
                    {aluno.inscricaoStatus === 'AGUARDANDO_PAGAMENTO' && (
                      <p className="mt-1 text-[10px] font-normal text-amber-600">boleto/pagamento pendente</p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-[#122b42]">{aluno.progressoPercentual}%</p>
                    <p className="text-[10px] font-normal uppercase text-slate-400">
                      {aluno.aulasConcluidas}/{aluno.totalAulas} aulas • {aluno.atividadesConcluidas}/{aluno.totalAtividades} atividades
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase text-slate-600">{aluno.certificadoStatus || 'Nao emitido'}</p>
                    <p className="text-[10px] font-normal text-slate-400">Prova: {aluno.notaProva ?? '-'}</p>
                  </div>
                  <div className="text-right">
                    <EadTrustAccessAction matriculaId={aluno.matriculaId} turmaId={turma.id}
                      expiresAt={aluno.acessoTemporarioAte} allowed={canManageEnrollment} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <AdicionarAlunoEadModal
        open={showAddAluno && canManageEnrollment}
        canChooseFinancial={canChooseFinancial}
        cursoNome={resumo?.cursoNome || turma.cursoNome || turma.nome}
        valor={resumo?.valor}
        search={searchAluno}
        alunos={(alunosDisponiveisQuery.data || []) as AlunoDisponivel[]}
        isLoading={alunosDisponiveisQuery.isLoading}
        isFetching={alunosDisponiveisQuery.isFetching}
        isSearchSettling={showAddAluno && normalizedSearchAluno !== debouncedSearchAluno}
        isError={alunosDisponiveisQuery.isError}
        pendingAlunoId={matricularMutation.isPending ? matricularMutation.variables?.alunoId : null}
        onSearchChange={setSearchAluno}
        onClose={() => {
          if (matricularMutation.isPending) return;
          setShowAddAluno(false);
          setSearchAluno('');
        }}
        onRetry={() => void alunosDisponiveisQuery.refetch()}
        onMatricular={(input) => matricularMutation.mutate(input)}
      />
    </div>
  );

  const renderFinanceiro = () => <EadFinanceiroPanel resumo={resumo} alunos={alunos}
    pagamentos={pagamentosQuery.data || []} isLoading={pagamentosQuery.isLoading} isError={pagamentosQuery.isError} />;

  const renderConfiguracoes = () => (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h3 className="text-[15px] font-medium tracking-tight text-[#001a33]">Configuracoes da turma</h3>
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-lg bg-slate-50 p-4">
          <p className="text-[11px] font-medium text-slate-400">Codigo</p>
          <p className="mt-1 text-xs font-medium text-[#122b42]">{turma.codigo}</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-4">
          <p className="text-[11px] font-medium text-slate-400">Status</p>
          <p className="mt-1 text-xs font-medium text-[#122b42]">{turma.status.replace('_', ' ')}</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-4">
          <p className="text-[11px] font-medium text-slate-400">Inicio</p>
          <p className="mt-1 text-xs font-medium text-[#122b42]">{new Date(turma.dataInicio).toLocaleDateString('pt-BR')}</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-4">
          <p className="text-[11px] font-medium text-slate-400">Previsao de termino</p>
          <p className="mt-1 text-xs font-medium text-[#122b42]">{new Date(turma.dataPrevisaoTermino).toLocaleDateString('pt-BR')}</p>
        </div>
      </div>
    </section>
  );

  const renderContent = () => {
    if (!tabs.some((tab) => tab.id === activeTab)) return null;
    if (resumoQuery.isLoading) {
      return <div className="rounded-xl bg-white py-16 text-center text-sm font-normal text-slate-400">Carregando turma EAD...</div>;
    }

    if (resumoQuery.error) {
      return <div className="rounded-xl bg-rose-50 p-6 text-sm font-normal text-rose-700">Nao foi possivel carregar esta turma EAD.</div>;
    }

    switch (activeTab) {
      case 'resumo':
        return renderResumo();
      case 'alunos':
        return renderAlunos();
      case 'financeiro':
        return renderFinanceiro();
      case 'configuracoes':
        return renderConfiguracoes();
      default:
        return null;
    }
  };

  return (
    <div className="gestao-turma-details pb-6">
      <TurmaDetailsHeader
        code={turma.codigo}
        status="EAD"
        title={turma.nome}
        description={<>{turma.cursoNome} • {turma.status.replace(/_/g, ' ')}</>}
        onBack={onBack}
      >
        <nav aria-label="Seções da turma" className="gestao-turma-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              aria-current={activeTab === tab.id ? 'page' : undefined}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`gestao-turma-tab ${
                activeTab === tab.id
                  ? 'is-active'
                  : ''
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>
      </TurmaDetailsHeader>

      <div className="gestao-turma-content">
        {tabs.length === 0 ? (
          <div className="rounded-xl border border-amber-100 bg-amber-50 p-5 text-center">
            <LockKeyhole className="mx-auto text-amber-600" size={28} />
            <h3 className="mt-3 text-sm font-medium text-amber-900">Nenhuma área da turma liberada</h3>
            <p className="mt-1 text-sm font-medium text-amber-700">Solicite ao administrador uma permissão de aba para o módulo Gestão.</p>
          </div>
        ) : renderContent()}
      </div>
      <ToastNotification toasts={toasts} onRemove={removeToast} />
    </div>
  );
};

export default TurmaEadDetalhes;
