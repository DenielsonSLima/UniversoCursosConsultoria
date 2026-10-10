import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Copy,
  ExternalLink,
  Loader2,
  Receipt,
  WalletCards,
} from 'lucide-react';
import { alunoExtratoService, AlunoExtratoRecebivel } from './alunoExtrato.service';
import ToastNotification, { useToast } from '../../../../../../parceiros/components/shared/ToastNotification';
import { ReceivableAmountSummary } from '../../../../../../financeiro/receber/components/modalidade-receber/ReceivableAmountSummary';
import { gestorBanesePaymentService } from '../../../../../../financeiro/receber/banese/gestor-banese-payment.service';
import { extratoChargeAction, extratoChargePresentation, extratoPaymentMethod, extratoPaymentOrigin } from './alunoExtrato.presentation';
import { alunoExtratoQueryKey, useAlunoExtratoRealtime } from './useAlunoExtratoRealtime';
import { canSettleExtratoReceivable } from './alunoExtrato.settlement-policy';
import { useAlunoExtratoSettlement } from './useAlunoExtratoSettlement';
import AlunoExtratoSettlementModal from './AlunoExtratoSettlementModal';

interface AlunoFinanceiroExtratoProps {
  matriculaId: string;
  turmaId?: string;
  canSettle?: boolean;
  onBack: () => void;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const formatDate = (value?: string) =>
  value ? new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR') : '—';

const StatusBadge = ({ status }: { status: string }) => (
  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${
    status === 'PAGO'
      ? 'bg-emerald-50 text-emerald-700'
      : status === 'VENCIDO'
        ? 'bg-rose-50 text-rose-700'
        : ['CANCELADO', 'ESTORNADO', 'DEVOLVIDO', 'SUSPENSO'].includes(status)
          ? 'bg-slate-100 text-slate-600'
        : 'bg-amber-50 text-amber-700'
  }`}>
    {status === 'PAGO' ? <CheckCircle2 size={12} /> : <Clock3 size={12} />}
    {status}
  </span>
);

const AlunoFinanceiroExtrato: React.FC<AlunoFinanceiroExtratoProps> = ({ matriculaId, turmaId, canSettle = false, onBack }) => {
  const { toasts, removeToast, toast } = useToast();
  const [openingId, setOpeningId] = useState<string | null>(null);
  useAlunoExtratoRealtime(matriculaId);
  const { data, isLoading, isError } = useQuery({
    queryKey: alunoExtratoQueryKey(matriculaId),
    queryFn: () => alunoExtratoService.getExtrato(matriculaId),
    staleTime: 10_000,
  });
  const settlement = useAlunoExtratoSettlement({ matriculaId, turmaId, canSettle, recebiveis: data?.recebiveis, toast });

  const copyChargeLink = async (item: AlunoExtratoRecebivel) => {
    const url = item.asaasInvoiceUrl || item.asaasBankSlipUrl;
    if (!url || extratoChargeAction(item) !== 'external') return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copiado', 'O link de cobrança foi copiado para envio ao aluno.');
    } catch {
      toast.error('Não foi possível copiar', 'Abra a cobrança e copie o endereço no navegador.');
    }
  };

  const openCharge = async (item: AlunoExtratoRecebivel) => {
    const action = extratoChargeAction(item);
    if (!action || openingId) return;
    if (action === 'external') {
      window.open(item.asaasBankSlipUrl || item.asaasInvoiceUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    const preparedTab = window.open('about:blank', '_blank');
    if (!preparedTab) {
      toast.error('Nova aba bloqueada', 'Permita pop-ups para este portal e tente abrir o boleto novamente.');
      return;
    }
    setOpeningId(item.id);
    try {
      await gestorBanesePaymentService.openBoletoPdfInNewTab(item.id, preparedTab);
    } catch (error) {
      toast.error('Boleto Banese indisponível', error instanceof Error ? error.message : 'Não foi possível abrir o boleto.');
    } finally {
      setOpeningId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-3 rounded-[2rem] border border-slate-100 bg-white py-20">
        <Loader2 className="animate-spin text-[#001a33]" size={24} />
        <span className="text-sm font-bold text-slate-500">Carregando extrato financeiro...</span>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="rounded-[2rem] border border-rose-100 bg-rose-50 p-8 text-center">
        <p className="text-sm font-black text-rose-700">Não foi possível carregar o extrato financeiro.</p>
        <button onClick={onBack} className="mt-4 rounded-xl bg-white px-4 py-2 text-xs font-black uppercase text-rose-700">
          Voltar
        </button>
      </div>
    );
  }

  return (
    <div className=" space-y-6">
      <ToastNotification toasts={toasts} onRemove={removeToast} />
      <AlunoExtratoSettlementModal controller={settlement} />
      <button
        onClick={onBack}
        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black uppercase tracking-wider text-slate-600 hover:bg-slate-50"
      >
        <ArrowLeft size={15} /> Voltar para financeiro da turma
      </button>

      <div className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-emerald-600">
              <Receipt size={16} /> Extrato financeiro do aluno
            </p>
            <h3 className="text-2xl font-black uppercase tracking-tight text-[#001a33]">{data.alunoNome}</h3>
            <p className="mt-1 text-xs font-bold text-slate-500">
              CPF: {data.alunoCpf || 'não informado'} · Matrícula: {data.matricula}
            </p>
            <p className="mt-1 text-xs font-semibold text-slate-400">
              {data.cursoNome || data.turmaNome} · {data.poloNome || 'Unidade não informada'}
            </p>
          </div>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-700">
            {data.statusMatricula || 'ATIVO'}
          </span>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-4">
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-[10px] font-black uppercase text-slate-400">Plano lançado</p>
            <p className="mt-1 text-xl font-black text-[#001a33]">{formatCurrency(data.total)}</p>
          </div>
          <div className="rounded-2xl bg-emerald-50 p-4">
            <p className="text-[10px] font-black uppercase text-emerald-700">Recebido</p>
            <p className="mt-1 text-xl font-black text-emerald-700">{formatCurrency(data.recebido)}</p>
          </div>
          <div className="rounded-2xl bg-amber-50 p-4">
            <p className="text-[10px] font-black uppercase text-amber-700">Pendente</p>
            <p className="mt-1 text-xl font-black text-amber-700">{formatCurrency(data.pendente)}</p>
          </div>
          <div className="rounded-2xl bg-rose-50 p-4">
            <p className="text-[10px] font-black uppercase text-rose-700">Vencido</p>
            <p className="mt-1 text-xl font-black text-rose-700">{formatCurrency(data.vencido)}</p>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-[2rem] border border-slate-100 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-5">
          <h4 className="flex items-center gap-2 text-sm font-black uppercase tracking-wider text-[#001a33]">
            <WalletCards size={17} /> Parcelas e histórico
          </h4>
          <p className="mt-1 text-xs font-medium text-slate-500">
            {data.pagos} paga(s), {data.pendentes} pendente(s), {data.recebiveis.length} lançamento(s) no total.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left">
            <thead className="bg-slate-50">
              <tr>
                {['Cobrança', 'Vencimento', 'Valor', 'Recebimento', 'Vínculo de cobrança', 'Ações'].map((label) => (
                  <th key={label} className="px-5 py-4 text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.recebiveis.map((item, index) => {
                const charge = extratoChargePresentation(item);
                const action = extratoChargeAction(item);
                const canReceive = canSettleExtratoReceivable(item, canSettle);
                return (
                <tr key={item.id} className={index % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                  <td className="px-5 py-4">
                    <p className="text-xs font-bold text-slate-700">{item.descricao}</p>
                    <p className="mt-1 text-[10px] font-black uppercase tracking-wider text-slate-400">
                      {item.tipoLancamento || 'Mensalidade'} {item.parcelaNumero !== undefined ? `· Parcela ${item.parcelaNumero}` : ''}
                    </p>
                  </td>
                  <td className="px-5 py-4 text-xs font-bold text-slate-600">{formatDate(item.dataVencimento)}</td>
                  <td className="px-5 py-4">
                    <ReceivableAmountSummary item={item} compact />
                  </td>
                  <td className="px-5 py-4">
                    <div className="space-y-1.5">
                      <StatusBadge status={item.status} />
                      <p className="text-[10px] font-bold text-slate-500">Forma: {extratoPaymentMethod(item)}</p>
                      <p className="text-[10px] font-bold text-slate-500">Origem: {extratoPaymentOrigin(item)}</p>
                      {item.status === 'PENDENTE' && <p className="text-[10px] font-bold text-slate-500">Aguardando pagamento</p>}
                      {item.dataPagamento && <p className="text-[10px] font-bold text-emerald-700">Pago: {formatDate(item.dataPagamento)}</p>}
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${
                      charge.tone === 'confirmed' ? 'text-emerald-700 bg-emerald-50 border-emerald-100'
                        : charge.tone === 'warning' ? 'text-amber-700 bg-amber-50 border-amber-100'
                          : 'text-slate-500 bg-slate-50 border-slate-100'
                    }`}>
                      {charge.label}
                    </span>
                    {charge.detail && <p className="mt-2 max-w-[220px] text-[10px] font-bold text-slate-500">{charge.detail}</p>}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex flex-col gap-2">
                      {canReceive && <button type="button" onClick={() => settlement.open(item, data.alunoNome)}
                        disabled={settlement.pending}
                        className="rounded-xl bg-[#001a33] px-3 py-2.5 text-[10px] font-black uppercase tracking-wider text-white hover:bg-emerald-700 disabled:opacity-50">
                        Receber
                      </button>}
                      {action === 'external' && <button type="button" onClick={() => copyChargeLink(item)} className="rounded-xl border border-emerald-200 p-2 text-emerald-700" title="Copiar link" aria-label="Copiar link de cobrança">
                        <Copy size={14} />
                      </button>}
                      {action && <button type="button" onClick={() => openCharge(item)} disabled={openingId !== null}
                        className="inline-flex items-center gap-1 rounded-xl border border-blue-200 p-2 text-[10px] font-black text-blue-600 disabled:opacity-50">
                        {openingId === item.id ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}
                        {action === 'banese' ? 'Abrir boleto' : 'Abrir cobrança'}
                      </button>}
                      {!action && !canReceive && <span className="text-[10px] font-bold text-slate-400">—</span>}
                    </div>
                  </td>
                </tr>
              );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AlunoFinanceiroExtrato;

