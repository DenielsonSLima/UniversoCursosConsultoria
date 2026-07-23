import React, { useMemo, useState } from 'react';

/** Fallback for non-secure contexts (HTTP over LAN) where crypto.randomUUID is unavailable. */
const safeRandomUUID = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback: build a v4 UUID from crypto.getRandomValues
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 1
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, CheckCircle2, Loader2, ReceiptText, Search, WalletCards, X } from 'lucide-react';
import { financeiroService } from '../../financeiro/financeiro.service';
import ToastNotification, { useToast } from '../../parceiros/components/shared/ToastNotification';
import { getSecretariaContext } from '../shared/secretaria-documentos.service';
import { secretariaDocumentosKeys } from '../shared/secretaria-documentos.keys';
import SecretariaAlunoSearchCard from '../shared/SecretariaAlunoSearchCard';
import {
  SecretariaFinanceiraAluno,
  SecretariaFinanceiraRecebivel,
  secretariaFinanceiraService,
} from './secretariaFinanceira.service';

const today = () => new Date().toISOString().slice(0, 10);
const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
}).format(value);
const formatDate = (value?: string) => value
  ? new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR')
  : 'Não informado';
const formatCurrencyInput = (value: number) => value.toLocaleString('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const SecretariaConsultaFinanceiraPage: React.FC = () => {
  const activeUserId = sessionStorage.getItem('logged_user_id');
  const activePoloId = sessionStorage.getItem('current_polo_id') || sessionStorage.getItem('active_polo_id');
  const context = useMemo(() => getSecretariaContext(), [activeUserId, activePoloId]);
  const queryClient = useQueryClient();
  const { toasts, removeToast, toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAluno, setSelectedAluno] = useState<SecretariaFinanceiraAluno | null>(null);
  const [selected, setSelected] = useState<SecretariaFinanceiraRecebivel | null>(null);
  const [accountId, setAccountId] = useState('');
  const [paymentDate, setPaymentDate] = useState(today());
  const [paymentMethod, setPaymentMethod] = useState<'BOLETO' | 'PIX' | 'CARTAO' | 'DINHEIRO'>('DINHEIRO');
  const [paidValue, setPaidValue] = useState('');
  const [interestValue, setInterestValue] = useState('');
  const [penaltyValue, setPenaltyValue] = useState('');
  const [discountValue, setDiscountValue] = useState('');
  const [additionValue, setAdditionValue] = useState('');
  const [settlementAttemptId, setSettlementAttemptId] = useState(() => safeRandomUUID());
  const normalizedTerm = searchTerm.trim();

  const alunosQuery = useQuery({
    queryKey: [...secretariaDocumentosKeys.context(context), 'recebimentos-alunos', normalizedTerm],
    queryFn: () => secretariaFinanceiraService.searchAlunos(context.poloId, normalizedTerm),
    enabled: normalizedTerm.length >= 2,
    staleTime: 30_000,
  });

  const recebiveisQuery = useQuery({
    queryKey: [...secretariaDocumentosKeys.context(context), 'recebimentos-abertos', selectedAluno?.id],
    queryFn: () => secretariaFinanceiraService.getRecebiveisByAluno(selectedAluno!.id, context.poloId),
    enabled: Boolean(selectedAluno?.id),
  });

  const contasQuery = useQuery({
    queryKey: [...secretariaDocumentosKeys.context(context), 'recebimentos-contas'],
    queryFn: () => secretariaFinanceiraService.getContasParaRecebimento(context.poloId),
    enabled: Boolean(selected),
    staleTime: 60_000,
  });

  const openSettlement = (item: SecretariaFinanceiraRecebivel) => {
    setSelected(item);
    setPaidValue(formatCurrencyInput(item.valor));
    setPaymentDate(today());
    setPaymentMethod('DINHEIRO');
    setAccountId('');
    setInterestValue('');
    setPenaltyValue('');
    setDiscountValue('');
    setAdditionValue('');
    setSettlementAttemptId(safeRandomUUID());
  };

  const settlementMutation = useMutation({
    mutationFn: () => financeiroService.markReceivablePaid(selected!.id, {
      idempotencyKey: settlementAttemptId,
      contaBancariaId: accountId,
      valorPago: paidValue,
      valorJuros: interestValue || '0',
      valorMulta: penaltyValue || '0',
      valorDesconto: discountValue || '0',
      valorAcrescimo: additionValue || '0',
      dataPagamento: paymentDate,
      formaPagamento: paymentMethod,
    }),
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [...secretariaDocumentosKeys.context(context), 'recebimentos-abertos'] }),
        queryClient.invalidateQueries({ queryKey: ['financeiro-recebiveis'] }),
        queryClient.invalidateQueries({ queryKey: ['aluno-financeiro'] }),
      ]);
      toast.success(
        'Recebimento confirmado',
        result.futureSyncWarning
          ? `Baixa registrada. Atenção: ${result.futureSyncWarning}`
          : 'A dívida foi baixada e saiu da lista de valores em aberto.',
      );
      setSelected(null);
    },
    onError: (error: any) => toast.error(
      'Não foi possível dar baixa',
      error?.message || 'Confira os dados e tente novamente.',
    ),
  });

  const confirmDisabled = !accountId || !paymentDate || !/[1-9]/.test(paidValue) || settlementMutation.isPending;
  const debts = recebiveisQuery.data || [];
  const totalOpen = debts.reduce((sum, item) => sum + item.valor, 0);

  return (
    <div className="space-y-5">
      <ToastNotification toasts={toasts} onRemove={removeToast} />

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700">
            <WalletCards size={21} />
          </div>
          <div>
            <p className="text-sm font-black uppercase tracking-tight text-[#001a33]">Pesquisar pessoa</p>
            <p className="text-xs font-medium text-slate-500">Digite nome ou CPF para consultar todas as dívidas em aberto.</p>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={19} />
          <input
            value={searchTerm}
            onChange={(event) => {
              setSearchTerm(event.target.value);
              setSelectedAluno(null);
            }}
            placeholder="Nome ou CPF"
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3.5 pl-12 pr-4 text-sm font-semibold text-slate-700 outline-none transition focus:border-cyan-400 focus:bg-white"
          />
        </div>

        {alunosQuery.isFetching && <div className="flex justify-center py-5"><Loader2 className="animate-spin text-cyan-600" /></div>}
        {!selectedAluno && normalizedTerm.length >= 2 && !alunosQuery.isFetching && (
          <div className="mt-4 space-y-2">
            {(alunosQuery.data || []).map((aluno) => (
              <SecretariaAlunoSearchCard
                key={aluno.id}
                {...aluno}
                tone="cyan"
                actionLabel="Ver dívidas"
                onClick={() => setSelectedAluno(aluno)}
              />
            ))}
            {alunosQuery.data?.length === 0 && <p className="py-4 text-center text-sm font-semibold text-slate-400">Nenhuma pessoa encontrada.</p>}
          </div>
        )}

        {selectedAluno && (
          <div className="mt-4">
            <SecretariaAlunoSearchCard {...selectedAluno} tone="cyan" selected actionLabel="Trocar pessoa" onClick={() => setSelectedAluno(null)} />
          </div>
        )}
      </section>

      {selectedAluno && (
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-2 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-black uppercase tracking-tight text-[#001a33]">Dívidas em aberto</h3>
              <p className="text-xs font-medium text-slate-500">Todos os cursos e modalidades vinculados à pessoa.</p>
            </div>
            <div className="text-left sm:text-right">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total em aberto</p>
              <strong className="text-lg font-black text-cyan-700">{formatCurrency(totalOpen)}</strong>
            </div>
          </div>

          {recebiveisQuery.isLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="animate-spin text-cyan-600" /></div>
          ) : debts.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <CheckCircle2 className="text-emerald-500" size={34} />
              <p className="font-black text-slate-700">Nenhuma dívida em aberto</p>
              <p className="text-sm text-slate-400">Não há parcelas pendentes ou vencidas para esta pessoa.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {debts.map((item) => (
                <div key={item.id} className="grid gap-4 px-5 py-4 md:grid-cols-[1fr_170px_130px] md:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-widest ${item.status === 'VENCIDO' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}`}>{item.status}</span>
                      {item.modalidade && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-slate-600">{item.modalidade}</span>}
                    </div>
                    <p className="mt-2 font-black text-[#001a33]">{item.descricao}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">{item.cursoNome || 'Cobrança sem curso'} · {item.matricula}</p>
                  </div>
                  <div>
                    <p className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-slate-400"><CalendarDays size={13} /> Vencimento</p>
                    <p className="mt-1 text-sm font-black text-slate-700">{formatDate(item.dataVencimento)}</p>
                    <p className="mt-1 text-base font-black text-[#001a33]">{formatCurrency(item.valor)}</p>
                  </div>
                  <button type="button" onClick={() => openSettlement(item)} className="rounded-xl bg-[#001a33] px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-cyan-700">
                    Receber
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {selected && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-700">Baixa manual</p>
                <h3 className="mt-1 text-xl font-black text-[#001a33]">Confirmar recebimento</h3>
                <p className="mt-1 text-sm font-medium text-slate-500">{selected.alunoNome} · {selected.descricao}</p>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"><X size={20} /></button>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="sm:col-span-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Conta de recebimento</span>
                <select value={accountId} onChange={(event) => setAccountId(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-cyan-400">
                  <option value="">Selecione a conta</option>
                  {(contasQuery.data || []).map((conta) => <option key={conta.id} value={conta.id}>{conta.banco} · Ag. {conta.agencia} · {conta.conta}</option>)}
                </select>
              </label>
              <label>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Forma de pagamento</span>
                <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as typeof paymentMethod)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-cyan-400">
                  <option value="DINHEIRO">Dinheiro</option><option value="PIX">Pix</option><option value="CARTAO">Cartão</option><option value="BOLETO">Boleto</option>
                </select>
              </label>
              <label>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Data do recebimento</span>
                <input type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-cyan-400" />
              </label>
              <label className="sm:col-span-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Valor recebido</span>
                <input value={paidValue} onChange={(event) => setPaidValue(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-black text-slate-700 outline-none focus:border-cyan-400" />
              </label>
              <label>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Juros recebidos</span>
                <input value={interestValue} onChange={(event) => setInterestValue(event.target.value)} placeholder="0,00" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-black text-slate-700 outline-none focus:border-cyan-400" />
              </label>
              <label>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Multa recebida</span>
                <input value={penaltyValue} onChange={(event) => setPenaltyValue(event.target.value)} placeholder="0,00" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-black text-slate-700 outline-none focus:border-cyan-400" />
              </label>
              <label>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Desconto concedido</span>
                <input value={discountValue} onChange={(event) => setDiscountValue(event.target.value)} placeholder="0,00" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-black text-slate-700 outline-none focus:border-cyan-400" />
              </label>
              <label>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Outros acréscimos</span>
                <input value={additionValue} onChange={(event) => setAdditionValue(event.target.value)} placeholder="0,00" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-black text-slate-700 outline-none focus:border-cyan-400" />
              </label>
            </div>

            <p className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-3 text-xs font-semibold text-slate-600">
              O servidor confere se principal + juros + multa + acréscimos − desconto corresponde exatamente ao valor recebido. Nenhum cálculo financeiro é consolidado nesta tela.
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setSelected(null)} className="rounded-xl border border-slate-200 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-600">Cancelar</button>
              <button type="button" disabled={confirmDisabled} onClick={() => settlementMutation.mutate()} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-[10px] font-black uppercase tracking-widest text-white disabled:cursor-not-allowed disabled:opacity-50">
                {settlementMutation.isPending ? <Loader2 className="animate-spin" size={15} /> : <ReceiptText size={15} />} Confirmar baixa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SecretariaConsultaFinanceiraPage;
