import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  FileStack,
  Loader2,
  Printer,
  Search,
  Users,
  WalletCards,
  X,
} from 'lucide-react';
import { asaasIntegrationService } from '../../../asaas/asaas.service';
import { getSecretariaContext } from '../shared/secretaria-documentos.service';
import { secretariaDocumentosKeys } from '../shared/secretaria-documentos.keys';
import {
  SecretariaFinanceiraAluno,
  SecretariaFinanceiraRecebivel,
  SecretariaFinanceiraTurma,
  secretariaFinanceiraService,
} from './secretariaFinanceira.service';
import ToastNotification, { useToast } from '../../parceiros/components/shared/ToastNotification';

type SearchMode = 'aluno' | 'turma' | 'lote';
type StatusFilter = 'TODOS' | 'PENDENTE' | 'PAGO';

interface CarnetPreview {
  url: string;
  filename: string;
  count: number;
}

const PAGE_SIZE = 8;

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const formatDate = (value?: string) =>
  value ? new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR') : 'Sem vencimento';

const asaasStatusLabel = (status?: string) => {
  const normalized = (status || '').toUpperCase();
  if (!normalized) return 'Sem Asaas';
  const labels: Record<string, string> = {
    PENDING: 'Pendente',
    CONFIRMED: 'Confirmado',
    RECEIVED: 'Recebido',
    OVERDUE: 'Vencido',
    DELETED: 'Cancelado',
    REFUNDED: 'Estornado',
    REFUND_REQUESTED: 'Estorno solicitado',
    CHARGEBACK_REQUESTED: 'Chargeback solicitado',
    CHARGEBACK_DISPUTE: 'Chargeback em disputa',
    AWAITING_RISK_ANALYSIS: 'Em análise',
  };
  return labels[normalized] || normalized;
};

const statusBadgeClass = (status: string) => {
  const normalized = status.toUpperCase();
  if (normalized === 'PAGO') return 'bg-emerald-50 text-emerald-700 border-emerald-100';
  if (normalized === 'VENCIDO') return 'bg-rose-50 text-rose-700 border-rose-100';
  return 'bg-amber-50 text-amber-700 border-amber-100';
};

const isPaid = (item: SecretariaFinanceiraRecebivel) => item.status === 'PAGO';

const filterByStatus = (items: SecretariaFinanceiraRecebivel[], status: StatusFilter) => {
  if (status === 'TODOS') return items;
  if (status === 'PAGO') return items.filter(isPaid);
  return items.filter((item) => !isPaid(item));
};

const tabs: Array<{ id: SearchMode; label: string; icon: React.ElementType; description: string }> = [
  { id: 'aluno', label: 'Por aluno', icon: WalletCards, description: 'Digite o aluno e selecione as parcelas individuais.' },
  { id: 'turma', label: 'Por turma', icon: Users, description: 'Escolha uma turma e gere o carnê de vários alunos.' },
  { id: 'lote', label: 'Seleção avulsa', icon: FileStack, description: 'Monte um lote com pessoas e parcelas diferentes.' },
];

const SecretariaConsultaFinanceiraPage: React.FC = () => {
  const activeUserId = sessionStorage.getItem('logged_user_id');
  const activePoloId = sessionStorage.getItem('current_polo_id') || sessionStorage.getItem('active_polo_id');
  const context = useMemo(() => getSecretariaContext(), [activeUserId, activePoloId]);
  const { toasts, removeToast, toast } = useToast();

  const [mode, setMode] = useState<SearchMode>('aluno');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAluno, setSelectedAluno] = useState<SecretariaFinanceiraAluno | null>(null);
  const [selectedTurmaId, setSelectedTurmaId] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('PENDENTE');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [carnetPreview, setCarnetPreview] = useState<CarnetPreview | null>(null);
  const [isGeneratingCarnet, setIsGeneratingCarnet] = useState(false);
  const normalizedTerm = searchTerm.trim();

  useEffect(() => () => {
    if (carnetPreview?.url) URL.revokeObjectURL(carnetPreview.url);
  }, [carnetPreview?.url]);

  const alunosQuery = useQuery({
    queryKey: [...secretariaDocumentosKeys.context(context), 'financeiro-alunos', normalizedTerm],
    queryFn: () => secretariaFinanceiraService.searchAlunos(context.poloId, normalizedTerm),
    enabled: mode === 'aluno' && normalizedTerm.length >= 2,
    staleTime: 30_000,
  });

  const turmasQuery = useQuery({
    queryKey: [...secretariaDocumentosKeys.context(context), 'financeiro-turmas'],
    queryFn: () => secretariaFinanceiraService.getTurmas(context.poloId),
    enabled: mode === 'turma',
    staleTime: 60_000,
  });

  const alunoRecebiveisQuery = useQuery({
    queryKey: [...secretariaDocumentosKeys.context(context), 'financeiro-aluno-recebiveis', selectedAluno?.id],
    queryFn: () => secretariaFinanceiraService.getRecebiveisByAluno(selectedAluno!.id, context.poloId),
    enabled: mode === 'aluno' && Boolean(selectedAluno?.id),
    staleTime: 20_000,
  });

  const turmaRecebiveisQuery = useQuery({
    queryKey: [...secretariaDocumentosKeys.context(context), 'financeiro-turma-recebiveis', selectedTurmaId],
    queryFn: () => secretariaFinanceiraService.getRecebiveisByTurma(selectedTurmaId),
    enabled: mode === 'turma' && Boolean(selectedTurmaId),
    staleTime: 20_000,
  });

  const loteRecebiveisQuery = useQuery({
    queryKey: [...secretariaDocumentosKeys.context(context), 'financeiro-lote-recebiveis', normalizedTerm],
    queryFn: () => secretariaFinanceiraService.searchRecebiveis(context.poloId, normalizedTerm),
    enabled: mode === 'lote' && normalizedTerm.length >= 2,
    staleTime: 20_000,
  });

  const rawRecebiveis = useMemo(() => {
    if (mode === 'aluno') return alunoRecebiveisQuery.data || [];
    if (mode === 'turma') return turmaRecebiveisQuery.data || [];
    return loteRecebiveisQuery.data || [];
  }, [alunoRecebiveisQuery.data, loteRecebiveisQuery.data, mode, turmaRecebiveisQuery.data]);

  const filteredRecebiveis = useMemo(
    () => filterByStatus(rawRecebiveis, statusFilter),
    [rawRecebiveis, statusFilter]
  );

  const pageCount = Math.max(1, Math.ceil(filteredRecebiveis.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pagedRecebiveis = filteredRecebiveis.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const selectedItems = rawRecebiveis.filter((item) => selectedIds.has(item.id));

  const resetSelection = () => {
    setSelectedIds(new Set());
    setPage(1);
  };

  const changeMode = (nextMode: SearchMode) => {
    setMode(nextMode);
    setSearchTerm('');
    setSelectedAluno(null);
    setSelectedTurmaId('');
    setStatusFilter('PENDENTE');
    resetSelection();
  };

  const toggleItem = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleVisible = () => {
    setSelectedIds((current) => {
      const next = new Set(current);
      const visibleIds = pagedRecebiveis.map((item) => item.id);
      const allSelected = visibleIds.length > 0 && visibleIds.every((id) => next.has(id));
      visibleIds.forEach((id) => {
        if (allSelected) next.delete(id);
        else next.add(id);
      });
      return next;
    });
  };

  const toggleAllFiltered = () => {
    setSelectedIds((current) => {
      const next = new Set(current);
      const filteredIds = filteredRecebiveis.map((item) => item.id);
      const allSelected = filteredIds.length > 0 && filteredIds.every((id) => next.has(id));
      filteredIds.forEach((id) => {
        if (allSelected) next.delete(id);
        else next.add(id);
      });
      return next;
    });
  };

  const copyChargeLink = async (item: SecretariaFinanceiraRecebivel) => {
    if (!item.asaasInvoiceUrl) {
      toast.info('Sem link Asaas', 'Esta parcela ainda não possui link de cobrança vinculado.');
      return;
    }
    await navigator.clipboard.writeText(item.asaasInvoiceUrl);
    toast.success('Link copiado', 'O link da cobrança foi copiado para envio ao aluno.');
  };

  const previewCarnetPdf = async () => {
    if (!selectedItems.length) {
      toast.info('Selecione parcelas', 'Marque pelo menos uma parcela para montar o carnê.');
      return;
    }
    const paidItems = selectedItems.filter(isPaid);
    if (paidItems.length) {
      toast.info('Remova parcelas pagas', 'O carnê oficial do Asaas deve ser emitido apenas para parcelas em aberto.');
      return;
    }
    try {
      setIsGeneratingCarnet(true);
      const result = await asaasIntegrationService.generateOfficialCarnet(selectedItems.map((item) => item.id).filter(Boolean) as string[]);
      const binary = window.atob(result.base64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      if (carnetPreview?.url) URL.revokeObjectURL(carnetPreview.url);
      const url = URL.createObjectURL(new Blob([bytes], { type: result.contentType || 'application/pdf' }));
      setCarnetPreview({ url, filename: result.filename, count: result.count });
      toast.success('Carnê oficial pronto', 'O PDF oficial do Asaas foi carregado para conferência.');
    } catch (error) {
      toast.error('Não foi possível gerar o carnê oficial', error instanceof Error ? error.message : 'Confira a integração Asaas e tente novamente.');
    } finally {
      setIsGeneratingCarnet(false);
    }
  };

  const closeCarnetPreview = () => {
    if (carnetPreview?.url) URL.revokeObjectURL(carnetPreview.url);
    setCarnetPreview(null);
  };

  const downloadCarnetPreview = () => {
    if (!carnetPreview) return;
    const link = document.createElement('a');
    link.href = carnetPreview.url;
    link.download = carnetPreview.filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const printCarnetPreview = () => {
    if (!carnetPreview) return;
    const printWindow = window.open(carnetPreview.url, '_blank', 'noopener,noreferrer');
    if (!printWindow) {
      toast.info('Prévia bloqueada', 'Permita pop-ups ou use o botão de baixar para imprimir o PDF.');
      return;
    }
    printWindow.addEventListener('load', () => printWindow.print(), { once: true });
  };

  const isLoadingRecebiveis =
    alunoRecebiveisQuery.isFetching || turmaRecebiveisQuery.isFetching || loteRecebiveisQuery.isFetching;

  const activeTab = tabs.find((tab) => tab.id === mode) || tabs[0];
  const ActiveIcon = activeTab.icon;

  return (
    <div className="animate-fadeIn">
      <ToastNotification toasts={toasts} onRemove={removeToast} />
      <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 p-4">
          <div className="grid gap-2 md:grid-cols-3">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = tab.id === mode;
              return (
                <button
                  key={tab.id}
                  onClick={() => changeMode(tab.id)}
                  className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition-colors ${
                    active ? 'border-cyan-200 bg-cyan-50 text-cyan-800' : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200'
                  }`}
                >
                  <Icon size={20} />
                  <div>
                    <p className="text-xs font-black uppercase tracking-wider">{tab.label}</p>
                    <p className="mt-0.5 text-[11px] font-medium leading-snug">{tab.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-5 md:p-7">
          <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-cyan-700">
                <ActiveIcon size={16} /> {activeTab.label}
              </p>
              <h4 className="mt-1 text-xl font-black uppercase tracking-tight text-[#001a33]">Carnê de cobranças</h4>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <select
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value as StatusFilter);
                  setPage(1);
                }}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-black text-slate-600 outline-none focus:border-cyan-400"
              >
                <option value="PENDENTE">Pendentes</option>
                <option value="PAGO">Recebidos</option>
                <option value="TODOS">Todos</option>
              </select>
              <button
                onClick={previewCarnetPdf}
                disabled={isGeneratingCarnet}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#001a33] px-5 py-3 text-xs font-black uppercase tracking-wider text-white shadow-sm hover:bg-[#08294d]"
              >
                {isGeneratingCarnet ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                {isGeneratingCarnet ? 'Gerando...' : 'Carnê oficial Asaas'}
              </button>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
            {mode === 'turma' ? (
              <select
                value={selectedTurmaId}
                onChange={(event) => {
                  setSelectedTurmaId(event.target.value);
                  resetSelection();
                }}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-bold text-slate-600 outline-none focus:border-cyan-400"
              >
                <option value="">Selecione uma turma...</option>
                {(turmasQuery.data || []).map((turma: SecretariaFinanceiraTurma) => (
                  <option key={turma.id} value={turma.id}>
                    {turma.nome} · {turma.codigo} · {turma.poloNome}
                  </option>
                ))}
              </select>
            ) : (
              <div className="relative">
                <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={searchTerm}
                  onChange={(event) => {
                    setSearchTerm(event.target.value);
                    setSelectedAluno(null);
                    resetSelection();
                  }}
                  placeholder={mode === 'aluno' ? 'Buscar por nome ou CPF...' : 'Buscar aluno, CPF, turma, matrícula ou ID Asaas...'}
                  className="w-full pl-12 pr-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-cyan-500 text-sm font-medium"
                />
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={toggleVisible}
                disabled={!pagedRecebiveis.length}
                className="rounded-2xl border border-slate-200 px-4 py-3 text-xs font-black uppercase text-slate-600 disabled:opacity-50"
              >
                Selecionar página
              </button>
              <button
                onClick={toggleAllFiltered}
                disabled={!filteredRecebiveis.length}
                className="rounded-2xl border border-cyan-200 px-4 py-3 text-xs font-black uppercase text-cyan-700 disabled:opacity-50"
              >
                Selecionar todos
              </button>
            </div>
          </div>

          {mode === 'aluno' && normalizedTerm.length >= 2 && !selectedAluno && (
            <div className="mt-4 grid gap-2 md:grid-cols-2">
              {alunosQuery.isFetching ? (
                <div className="col-span-full py-8 flex justify-center"><Loader2 className="animate-spin text-cyan-600" /></div>
              ) : (alunosQuery.data || []).length ? (
                (alunosQuery.data || []).map((aluno) => (
                  <button
                    key={aluno.id}
                    onClick={() => {
                      setSelectedAluno(aluno);
                      resetSelection();
                    }}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left hover:border-cyan-300"
                  >
                    <p className="font-black text-sm text-[#001a33]">{aluno.nome}</p>
                    <p className="mt-1 text-xs font-bold text-slate-500">CPF: {aluno.cpf || 'Não informado'}</p>
                  </button>
                ))
              ) : (
                <p className="col-span-full py-8 text-center text-sm text-slate-400">Nenhum aluno encontrado nesta unidade.</p>
              )}
            </div>
          )}

          {selectedAluno && (
            <div className="mt-4 flex items-center justify-between rounded-2xl border border-cyan-100 bg-cyan-50 px-4 py-3">
              <div>
                <p className="text-sm font-black text-[#001a33]">{selectedAluno.nome}</p>
                <p className="text-xs font-bold text-slate-500">CPF: {selectedAluno.cpf || 'Não informado'}</p>
              </div>
              <button
                onClick={() => {
                  setSelectedAluno(null);
                  resetSelection();
                }}
                className="text-xs font-black uppercase text-cyan-700"
              >
                trocar aluno
              </button>
            </div>
          )}

          <div className="mt-5 rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <p className="text-xs font-bold text-slate-500">
                {filteredRecebiveis.length} parcela(s) encontradas · {selectedItems.length} selecionada(s)
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                  disabled={currentPage === 1}
                  className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 disabled:opacity-40"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                  Página {currentPage} de {pageCount}
                </span>
                <button
                  onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
                  disabled={currentPage === pageCount}
                  className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 disabled:opacity-40"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-[1.5rem] border border-slate-100">
            <div className="grid grid-cols-[44px_1.5fr_1.2fr_120px_120px_150px] bg-slate-50 px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-500 min-w-[980px]">
              <span />
              <span>Aluno</span>
              <span>Cobrança</span>
              <span>Vencimento</span>
              <span>Valor</span>
              <span>Asaas</span>
            </div>
            <div className="overflow-x-auto">
              {isLoadingRecebiveis ? (
                <div className="py-14 flex justify-center"><Loader2 className="animate-spin text-cyan-600" /></div>
              ) : pagedRecebiveis.length ? (
                <div className="min-w-[980px] divide-y divide-slate-100">
                  {pagedRecebiveis.map((item, index) => (
                    <div
                      key={item.id}
                      className={`grid grid-cols-[44px_1.5fr_1.2fr_120px_120px_150px] px-4 py-4 ${
                        index % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'
                      }`}
                    >
                      <div className="pt-1">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(item.id)}
                          onChange={() => toggleItem(item.id)}
                          className="h-4 w-4 accent-cyan-700"
                        />
                      </div>
                      <div>
                        <p className="text-sm font-black text-[#001a33]">{item.alunoNome}</p>
                        <p className="mt-1 text-[11px] font-bold text-slate-500">CPF: {item.alunoCpf || 'Não informado'}</p>
                        <p className="mt-1 text-[10px] font-black uppercase tracking-wider text-slate-400">{item.matricula}</p>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-700">{item.descricao}</p>
                        <p className="mt-1 text-[10px] font-black uppercase tracking-wider text-slate-400">
                          {item.turmaNome} {item.turmaCodigo ? `· ${item.turmaCodigo}` : ''}
                        </p>
                      </div>
                      <div className="text-xs font-black text-slate-600">{formatDate(item.dataVencimento)}</div>
                      <div>
                        <p className="text-sm font-black text-[#001a33]">{formatCurrency(item.valor)}</p>
                        <span className={`mt-2 inline-flex rounded-full border px-2 py-1 text-[10px] font-black uppercase ${statusBadgeClass(item.status)}`}>
                          {item.status}
                        </span>
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-wider text-blue-600">
                          {asaasStatusLabel(item.asaasStatus)}
                        </p>
                        {item.asaasPaymentId && (
                          <p className="mt-1 max-w-[140px] truncate font-mono text-[10px] text-slate-400">ID: {item.asaasPaymentId}</p>
                        )}
                        <div className="mt-2 flex gap-1.5">
                          <button onClick={() => copyChargeLink(item)} className="rounded-lg border border-emerald-200 p-1.5 text-emerald-700" title="Copiar link">
                            <Copy size={13} />
                          </button>
                          {item.asaasInvoiceUrl && (
                            <a href={item.asaasInvoiceUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-blue-200 p-1.5 text-blue-600" title="Abrir checkout">
                              <ExternalLink size={13} />
                            </a>
                          )}
                          {item.asaasBankSlipUrl && (
                            <a href={item.asaasBankSlipUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-200 p-1.5 text-slate-600" title="Abrir boleto oficial">
                              <Download size={13} />
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-white py-16 text-center">
                  <CheckCircle2 className="mx-auto mb-3 text-slate-300" size={26} />
                  <p className="text-sm font-bold text-slate-400">
                    {mode === 'aluno' && !selectedAluno
                      ? 'Busque e selecione um aluno para listar as parcelas.'
                      : mode === 'turma' && !selectedTurmaId
                        ? 'Selecione uma turma para carregar as parcelas.'
                        : 'Nenhuma parcela encontrada para os filtros atuais.'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {carnetPreview && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-[1.5rem] bg-white shadow-2xl">
            <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-cyan-700">Prévia do carnê</p>
                <h4 className="mt-1 text-lg font-black uppercase tracking-tight text-[#001a33]">
                  Carnê oficial Asaas · {carnetPreview.count} boleto(s)
                </h4>
                <p className="mt-1 text-xs font-bold text-slate-500">
                  Este PDF usa os boletos oficiais retornados pelo Asaas para as cobranças selecionadas.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={downloadCarnetPreview}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-600 hover:border-cyan-200 hover:text-cyan-700"
                >
                  <Download size={15} /> Baixar
                </button>
                <button
                  onClick={printCarnetPreview}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#001a33] px-4 py-3 text-xs font-black uppercase tracking-wider text-white hover:bg-[#08294d]"
                >
                  <Printer size={15} /> Imprimir
                </button>
                <button
                  onClick={closeCarnetPreview}
                  className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 p-3 text-slate-500 hover:border-rose-200 hover:text-rose-600"
                  title="Fechar prévia"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 bg-slate-100 p-4">
              <iframe
                src={carnetPreview.url}
                title="Prévia do carnê de cobranças"
                className="h-[74vh] w-full rounded-2xl border border-slate-200 bg-white"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SecretariaConsultaFinanceiraPage;
