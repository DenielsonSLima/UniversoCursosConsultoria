import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  CreditCard,
  GraduationCap,
  Loader2,
  MonitorPlay,
  Plus,
  Search,
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
  useLiberarMatriculaEadMutation,
  useMatricularAlunoEadMutation,
} from './hooks/useTurmaEadMutations';
import { useTurmaEadRealtime } from './hooks/useTurmaEadRealtime';

interface TurmaEadDetalhesProps {
  turma: Turma;
  onBack: () => void;
}

const formatCurrency = (value?: number | null) =>
  Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const paymentMethodLabel = (value?: string | null) => {
  switch (value) {
    case 'PIX':
      return 'Pix';
    case 'BOLETO':
      return 'Boleto';
    case 'CREDIT_CARD':
    case 'CARTAO':
      return 'Cartão';
    default:
      return value || '-';
  }
};

const statusStyle = (status?: string | null) => {
  switch (normalizeStatus(status)) {
    case 'PENDENTE':
    case 'AGUARDANDO_PAGAMENTO':
    case 'AGUARDANDO_CONFIRMACAO':
      return 'bg-amber-50 text-amber-700 border-amber-100';
    case 'ATIVO':
      return 'bg-emerald-50 text-emerald-700 border-emerald-100';
    case 'CONCLUIDO':
      return 'bg-blue-50 text-blue-700 border-blue-100';
    case 'CANCELADO':
    case 'DESISTENTE':
      return 'bg-rose-50 text-rose-700 border-rose-100';
    default:
      return 'bg-slate-50 text-slate-600 border-slate-100';
  }
};

const statusLabel = (status?: string | null) => {
  switch (normalizeStatus(status)) {
    case 'PENDENTE':
    case 'AGUARDANDO_PAGAMENTO':
    case 'AGUARDANDO_CONFIRMACAO':
      return 'Aguardando pagamento';
    case 'ATIVO':
      return 'Liberado';
    case 'CONCLUIDO':
      return 'Concluido';
    case 'TRANCADO':
      return 'Trancado';
    case 'CANCELADO':
      return 'Cancelado';
    case 'DESISTENTE':
      return 'Desistente';
    default:
      return status || 'Sem status';
  }
};

const EAD_ACTIVE_STATUSES = new Set(['ATIVO', 'CONCLUIDO']);
const EAD_PENDING_STATUSES = new Set(['PENDENTE', 'AGUARDANDO_PAGAMENTO', 'AGUARDANDO_CONFIRMACAO']);
const normalizeStatus = (status?: string | null) =>
  String(status || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
const isEadEnrollmentActive = (status?: string | null) => EAD_ACTIVE_STATUSES.has(normalizeStatus(status));
const isEadEnrollmentPending = (status?: string | null) => EAD_PENDING_STATUSES.has(normalizeStatus(status));

const StatCard = ({ label, value, icon, tone = 'slate' }: { label: string; value: string | number; icon: React.ReactNode; tone?: 'slate' | 'purple' | 'emerald' | 'amber' | 'blue' }) => {
  const tones = {
    slate: 'bg-white border-slate-200 text-slate-500',
    purple: 'bg-purple-50 border-purple-100 text-purple-700',
    emerald: 'bg-emerald-50 border-emerald-100 text-emerald-700',
    amber: 'bg-amber-50 border-amber-100 text-amber-700',
    blue: 'bg-blue-50 border-blue-100 text-blue-700',
  };

  return (
    <div className={`rounded-2xl border p-5 ${tones[tone]}`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="text-[10px] font-black uppercase tracking-widest">{label}</span>
        {icon}
      </div>
      <p className="text-3xl font-black text-[#001a33]">{value}</p>
    </div>
  );
};

const TurmaEadDetalhes: React.FC<TurmaEadDetalhesProps> = ({ turma, onBack }) => {
  const { toasts, removeToast, toast } = useToast();
  const [activeTab, setActiveTab] = useState<'resumo' | 'alunos' | 'financeiro' | 'configuracoes'>('resumo');
  const [searchAluno, setSearchAluno] = useState('');
  const [showAddAluno, setShowAddAluno] = useState(false);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [turma.id]);

  useTurmaEadRealtime(turma.id);

  const resumoQuery = useTurmaEadResumo(turma.id);
  const alunosQuery = useTurmaEadAlunos(turma.id);
  const alunosDisponiveisQuery = useTurmaEadAlunosDisponiveis(turma.id, searchAluno, showAddAluno);
  const liberarMutation = useLiberarMatriculaEadMutation(
    turma.id,
    (error: any) => toast.error('Não foi possível liberar', error?.message || 'Tente novamente em alguns instantes.'),
  );
  const matricularMutation = useMatricularAlunoEadMutation(
    turma.id,
    (alunosDisponiveisQuery.data || []) as AlunoDisponivel[],
    {
      onSuccess: (alunoNome) => {
      toast.success(
        'Aluno adicionado',
        `${alunoNome} foi adicionado(a) à turma sem gerar pagamento e com acesso liberado.`
      );
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
  const pagamentosQuery = useTurmaEadPagamentos(turma.id);

  const tabs = [
    { id: 'resumo', label: 'Resumo', icon: <BarChart3 size={17} /> },
    { id: 'alunos', label: 'Alunos', icon: <Users size={17} /> },
    { id: 'financeiro', label: 'Financeiro', icon: <CreditCard size={17} /> },
    { id: 'configuracoes', label: 'Configuracoes', icon: <Settings size={17} /> },
  ] as const;

  const renderResumo = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <StatCard label="Alunos com acesso" value={alunosLiberados} icon={<Users size={18} />} tone="purple" />
        <StatCard label="Pendentes" value={alunosPendentesCount} icon={<CreditCard size={18} />} tone="amber" />
        <StatCard label="Liberados" value={alunosLiberados} icon={<ShieldCheck size={18} />} tone="emerald" />
        <StatCard label="Concluidos" value={alunosConcluidos} icon={<GraduationCap size={18} />} tone="blue" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 lg:col-span-2">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-black uppercase tracking-tight text-[#001a33]">Operacao da turma</h3>
              <p className="text-xs font-bold text-slate-500">Acompanhamento EAD separado da gestao tecnica.</p>
            </div>
            <span className="rounded-full border border-purple-100 bg-purple-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-purple-700">
              {resumo?.area || 'EAD'}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Curso</p>
              <p className="mt-1 text-sm font-black text-[#001a33]">{resumo?.cursoNome || turma.cursoNome}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Valor publico</p>
              <p className="mt-1 text-sm font-black text-emerald-700">{formatCurrency(resumo?.valor)}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Aulas e atividades</p>
              <p className="mt-1 text-sm font-black text-[#001a33]">
                {resumo?.configuracao?.conteudos?.length || 0} aulas / {resumo?.configuracao?.atividades?.length || 0} atividades
              </p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Tempo minimo</p>
              <p className="mt-1 text-sm font-black text-[#001a33]">
                {resumo?.configuracao?.regras?.tempoMinimoMinutos || 0} minutos
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6">
          <h3 className="text-lg font-black uppercase tracking-tight text-[#001a33]">Certificados</h3>
          <div className="mt-5 space-y-3">
            <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-4 text-sm font-black">
              <span className="text-slate-500">Pendentes</span>
              <span className="text-amber-600">{resumo?.certificadosPendentes ?? 0}</span>
            </div>
            <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-4 text-sm font-black">
              <span className="text-slate-500">Emitidos</span>
              <span className="text-emerald-600">{resumo?.certificadosEmitidos ?? 0}</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );

  const renderAlunos = () => (
    <div className="rounded-3xl border border-slate-200 bg-white p-6">
      <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h3 className="text-lg font-black uppercase tracking-tight text-[#001a33]">Alunos da turma EAD</h3>
          <p className="text-xs font-bold text-slate-500">Somente matrículas com acesso liberado à turma.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowAddAluno(true)}
          className="flex items-center justify-center gap-2 rounded-xl bg-purple-600 px-5 py-3 text-[10px] font-black uppercase tracking-widest text-white shadow-lg shadow-purple-900/20 hover:bg-purple-700"
        >
          <Plus size={15} /> Adicionar aluno
        </button>
      </div>

      {alunosQuery.isLoading ? (
        <div className="py-12 text-center text-sm font-bold text-slate-400">Carregando alunos...</div>
      ) : alunosComAcesso.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center text-sm font-bold text-slate-400">
          Nenhum aluno com acesso nesta turma EAD no momento.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-100">
          <div className="grid min-w-[900px] grid-cols-[1.4fr_0.9fr_0.9fr_0.8fr_0.7fr] gap-3 bg-slate-50 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400">
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
                  <p className="truncate font-black text-[#001a33]" title={aluno.nome}>{aluno.nome}</p>
                  <p className="truncate text-xs font-bold text-slate-400" title={aluno.email || ''}>{aluno.email || 'Sem email'}</p>
                </div>
                <div>
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${statusStyle(aluno.status)}`}>
                    {statusLabel(aluno.status)}
                  </span>
                  {aluno.inscricaoStatus === 'AGUARDANDO_PAGAMENTO' && (
                    <p className="mt-1 text-[10px] font-bold text-amber-600">boleto/pagamento pendente</p>
                  )}
                </div>
                <div>
                  <p className="text-sm font-black text-[#001a33]">{aluno.progressoPercentual}%</p>
                  <p className="text-[10px] font-bold uppercase text-slate-400">
                    {aluno.aulasConcluidas}/{aluno.totalAulas} aulas • {aluno.atividadesConcluidas}/{aluno.totalAtividades} atividades
                  </p>
                </div>
                <div>
                  <p className="text-xs font-black uppercase text-slate-600">{aluno.certificadoStatus || 'Nao emitido'}</p>
                  <p className="text-[10px] font-bold text-slate-400">Prova: {aluno.notaProva ?? '-'}</p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-black uppercase text-slate-300">Sem ação</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {alunosPendentes.length > 0 && (
        <div className="mt-6 rounded-3xl border border-amber-100 bg-amber-50/40 p-6">
          <div className="mb-4">
            <h4 className="text-sm font-black uppercase tracking-tight text-[#001a33]">Pendências de pagamento</h4>
            <p className="text-xs font-bold text-slate-500">Não entram como acesso ativo até a confirmação da matrícula.</p>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-amber-100 bg-white">
            <div className="grid min-w-[900px] grid-cols-[1.4fr_0.9fr_0.9fr_0.8fr_0.7fr] gap-3 bg-amber-50 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-amber-700">
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
                    <p className="truncate font-black text-[#001a33]" title={aluno.nome}>{aluno.nome}</p>
                    <p className="truncate text-xs font-bold text-slate-400" title={aluno.email || ''}>{aluno.email || 'Sem email'}</p>
                  </div>
                  <div>
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${statusStyle(aluno.status)}`}>
                      {statusLabel(aluno.status)}
                    </span>
                    {aluno.inscricaoStatus === 'AGUARDANDO_PAGAMENTO' && (
                      <p className="mt-1 text-[10px] font-bold text-amber-600">boleto/pagamento pendente</p>
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-black text-[#001a33]">{aluno.progressoPercentual}%</p>
                    <p className="text-[10px] font-bold uppercase text-slate-400">
                      {aluno.aulasConcluidas}/{aluno.totalAulas} aulas • {aluno.atividadesConcluidas}/{aluno.totalAtividades} atividades
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase text-slate-600">{aluno.certificadoStatus || 'Nao emitido'}</p>
                    <p className="text-[10px] font-bold text-slate-400">Prova: {aluno.notaProva ?? '-'}</p>
                  </div>
                  <div className="text-right">
                    <button
                      type="button"
                      disabled={liberarMutation.isPending}
                      onClick={() => liberarMutation.mutate(aluno.matriculaId)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-[10px] font-black uppercase text-white hover:bg-emerald-700 disabled:opacity-60"
                    >
                      {liberarMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                      Liberar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showAddAluno && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h4 className="text-lg font-black uppercase tracking-tight text-[#001a33]">Adicionar aluno EAD</h4>
                <p className="text-xs font-bold text-slate-500">Matricula manual liberada, sem gerar recebimento.</p>
              </div>
              <button type="button" onClick={() => setShowAddAluno(false)} className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-black uppercase text-slate-500">
                Fechar
              </button>
            </div>

            <div className="mb-4 flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <Search size={16} className="text-slate-400" />
              <input
                value={searchAluno}
                onChange={(event) => setSearchAluno(event.target.value)}
                placeholder="Buscar por nome, email ou CPF"
                className="w-full bg-transparent text-sm font-bold outline-none placeholder:text-slate-400"
              />
            </div>

            <div className="max-h-[380px] overflow-y-auto rounded-2xl border border-slate-100">
              {alunosDisponiveisQuery.isLoading ? (
                <div className="py-10 text-center text-sm font-bold text-slate-400">Buscando alunos...</div>
              ) : (alunosDisponiveisQuery.data || []).length === 0 ? (
                <div className="py-10 text-center text-sm font-bold text-slate-400">Nenhum aluno disponivel.</div>
              ) : (
                (alunosDisponiveisQuery.data || []).map((aluno) => (
                  <div key={aluno.id} className="flex items-center justify-between gap-4 border-b border-slate-100 px-4 py-3 last:border-b-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-[#001a33]">{aluno.nome}</p>
                      <p className="truncate text-xs font-bold text-slate-400">{aluno.email || aluno.cpfCnpj || 'Sem contato'}</p>
                    </div>
                    <button
                      type="button"
                      disabled={matricularMutation.isPending}
                      onClick={() => matricularMutation.mutate(aluno.id)}
                      className="rounded-lg bg-purple-600 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white hover:bg-purple-700 disabled:opacity-60"
                    >
                      Matricular
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderFinanceiro = () => (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <StatCard label="Receita prevista" value={formatCurrency(resumo?.receitaPrevista)} icon={<CreditCard size={18} />} tone="purple" />
      <StatCard label="Receita liberada" value={formatCurrency(resumo?.receitaConfirmada)} icon={<ShieldCheck size={18} />} tone="emerald" />
      <StatCard label="Pendentes" value={resumo?.alunosPendentes ?? 0} icon={<CreditCard size={18} />} tone="amber" />
      <section className="rounded-3xl border border-slate-200 bg-white p-6 lg:col-span-3">
        <div className="mb-6 flex flex-col justify-between gap-3 md:flex-row md:items-center">
          <div>
            <h3 className="text-lg font-black uppercase tracking-tight text-[#001a33]">Recebimentos dos alunos</h3>
            <p className="text-xs font-bold text-slate-500">A configuração do checkout fica no cadastro do curso EAD.</p>
          </div>
          {resumo?.asaasUrl && (
            <a
              href={resumo.asaasUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50"
            >
              Abrir link Asaas
            </a>
          )}
        </div>

        {pagamentosQuery.isLoading ? (
          <div className="rounded-2xl bg-slate-50 p-8 text-center text-sm font-black text-slate-400">Carregando pagamentos...</div>
        ) : pagamentosQuery.isError ? (
          <div className="rounded-2xl bg-rose-50 p-4 text-sm font-black text-rose-700">Nao foi possivel carregar os pagamentos desta turma.</div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-100">
            <div className="grid min-w-[980px] grid-cols-[1.4fr_0.75fr_0.85fr_1fr_1fr_0.8fr] gap-3 bg-slate-50 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400">
              <span>Aluno</span>
              <span>Valor</span>
              <span>Status</span>
              <span>Recebido em</span>
              <span>Confirmado em</span>
              <span>Forma</span>
            </div>
            <div className="divide-y divide-slate-100">
              {alunos.map((aluno) => {
                const pagamento = (pagamentosQuery.data || []).find(item => item.matricula_id === aluno.matriculaId);
                const matriculaStatus = normalizeStatus(aluno.status);
                const statusPagamento = pagamento?.status || (matriculaStatus === 'ATIVO' || matriculaStatus === 'CONCLUIDO' ? 'PAGO' : 'PENDENTE');
                return (
                  <div key={aluno.matriculaId} className="grid min-w-[980px] grid-cols-[1.4fr_0.75fr_0.85fr_1fr_1fr_0.8fr] gap-3 px-4 py-4 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-black text-[#001a33]" title={aluno.nome}>{aluno.nome}</p>
                      <p className="truncate text-xs font-bold text-slate-400" title={aluno.email || pagamento?.email || ''}>{aluno.email || pagamento?.email || 'Sem email'}</p>
                    </div>
                    <p className="font-black text-emerald-700">{formatCurrency(pagamento?.valor ?? aluno.valorPago ?? resumo?.valor)}</p>
                    <span className={`w-fit rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${statusPagamento === 'PAGO' ? 'border-emerald-100 bg-emerald-50 text-emerald-700' : 'border-amber-100 bg-amber-50 text-amber-700'}`}>
                      {statusPagamento === 'PAGO' ? 'Confirmado' : 'Pendente'}
                    </span>
                    <p className="text-xs font-bold text-slate-600">{formatDateTime(pagamento?.pago_em)}</p>
                    <p className="text-xs font-bold text-slate-600">{formatDateTime(pagamento?.confirmado_em || pagamento?.pago_em)}</p>
                    <p className="text-xs font-black uppercase text-slate-500">
                      {pagamento?.forma_pagamento ? paymentMethodLabel(pagamento.forma_pagamento) : matriculaStatus === 'ATIVO' && !pagamento ? 'Manual' : '-'}
                    </p>
                  </div>
                );
              })}
              {alunos.length === 0 && (
                <div className="px-4 py-10 text-center text-sm font-bold text-slate-400">Nenhum aluno matriculado nesta turma.</div>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );

  const renderConfiguracoes = () => (
    <section className="rounded-3xl border border-slate-200 bg-white p-6">
      <h3 className="text-lg font-black uppercase tracking-tight text-[#001a33]">Configuracoes da turma</h3>
      <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-2xl bg-slate-50 p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Codigo</p>
          <p className="mt-1 text-sm font-black text-[#001a33]">{turma.codigo}</p>
        </div>
        <div className="rounded-2xl bg-slate-50 p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Status</p>
          <p className="mt-1 text-sm font-black text-[#001a33]">{turma.status.replace('_', ' ')}</p>
        </div>
        <div className="rounded-2xl bg-slate-50 p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Inicio</p>
          <p className="mt-1 text-sm font-black text-[#001a33]">{new Date(turma.dataInicio).toLocaleDateString('pt-BR')}</p>
        </div>
        <div className="rounded-2xl bg-slate-50 p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Previsao de termino</p>
          <p className="mt-1 text-sm font-black text-[#001a33]">{new Date(turma.dataPrevisaoTermino).toLocaleDateString('pt-BR')}</p>
        </div>
      </div>
    </section>
  );

  const renderContent = () => {
    if (resumoQuery.isLoading) {
      return <div className="rounded-3xl bg-white py-16 text-center text-sm font-bold text-slate-400">Carregando turma EAD...</div>;
    }

    if (resumoQuery.error) {
      return <div className="rounded-3xl bg-rose-50 p-6 text-sm font-bold text-rose-700">Nao foi possivel carregar esta turma EAD.</div>;
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
    <div className="animate-fadeIn min-h-screen pb-20">
      <div className="-mx-8 -mt-8 mb-8 border-b border-slate-200 bg-white px-6 py-4 shadow-sm">
        <div className="mx-auto max-w-7xl">
          <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={onBack}
                className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-slate-400 transition-colors hover:border-purple-200 hover:text-purple-600"
              >
                <ArrowLeft size={20} />
              </button>
              <div>
                <div className="mb-1 flex items-center gap-2">
                  <span className="rounded border border-purple-200 bg-purple-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-purple-700">
                    {turma.codigo}
                  </span>
                  <span className="rounded border border-blue-100 bg-blue-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-blue-600">
                    EAD
                  </span>
                </div>
                <h2 className="text-xl font-black uppercase leading-none tracking-tight text-[#001a33]">{turma.nome}</h2>
                <p className="mt-1 text-xs font-bold text-slate-500">{turma.cursoNome} • {statusLabel(turma.status)}</p>
              </div>
            </div>
          </div>

          <div className="flex gap-1 overflow-x-auto pb-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 whitespace-nowrap rounded-xl px-5 py-2.5 text-xs font-bold uppercase tracking-wider transition-all ${
                  activeTab === tab.id
                    ? 'bg-[#001a33] text-white shadow-lg shadow-blue-900/20'
                    : 'bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 md:px-0">{renderContent()}</div>
      <ToastNotification toasts={toasts} onRemove={removeToast} />
    </div>
  );
};

export default TurmaEadDetalhes;
