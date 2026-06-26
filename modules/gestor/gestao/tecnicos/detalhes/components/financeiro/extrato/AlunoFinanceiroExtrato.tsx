import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Copy,
  ExternalLink,
  FileText,
  Loader2,
  Receipt,
  WalletCards,
} from 'lucide-react';
import { alunoExtratoService, AlunoExtratoRecebivel } from './alunoExtrato.service';
import ToastNotification, { useToast } from '../../../../../../parceiros/components/shared/ToastNotification';

interface AlunoFinanceiroExtratoProps {
  matriculaId: string;
  onBack: () => void;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const formatDate = (value?: string) =>
  value ? new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR') : '—';

const paymentOriginLabel = (item: AlunoExtratoRecebivel) => {
  if (item.origemPagamento === 'ASAAS' || item.asaasPaymentId) return 'Asaas';
  if (item.origemPagamento === 'PRESENCIAL') return 'Manual';
  return item.status === 'PAGO' ? 'Manual' : 'Aguardando';
};

const paymentMethodLabel = (item: AlunoExtratoRecebivel) => {
  if (item.formaPagamento === 'CARTAO') return 'Cartão';
  if (item.formaPagamento === 'BOLETO') return 'Boleto';
  if (item.formaPagamento === 'PIX') return 'Pix';
  if (item.formaPagamento === 'DINHEIRO') return 'Dinheiro';
  return item.asaasPaymentId ? 'Link Asaas' : 'Não definido';
};

const asaasStatusLabel = (status?: string) => {
  const normalized = (status || '').toUpperCase();
  if (!normalized) return 'Sem sincronização';
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

const asaasStatusClass = (status?: string) => {
  const normalized = (status || '').toUpperCase();
  if (['CONFIRMED', 'RECEIVED'].includes(normalized)) return 'text-emerald-700 bg-emerald-50 border-emerald-100';
  if (['OVERDUE', 'DELETED', 'REFUNDED'].includes(normalized)) return 'text-rose-700 bg-rose-50 border-rose-100';
  if (normalized === 'PENDING') return 'text-amber-700 bg-amber-50 border-amber-100';
  return 'text-slate-500 bg-slate-50 border-slate-100';
};

const StatusBadge = ({ status }: { status: string }) => (
  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${
    status === 'PAGO'
      ? 'bg-emerald-50 text-emerald-700'
      : status === 'VENCIDO'
        ? 'bg-rose-50 text-rose-700'
        : 'bg-amber-50 text-amber-700'
  }`}>
    {status === 'PAGO' ? <CheckCircle2 size={12} /> : <Clock3 size={12} />}
    {status}
  </span>
);

const AlunoFinanceiroExtrato: React.FC<AlunoFinanceiroExtratoProps> = ({ matriculaId, onBack }) => {
  const { toasts, removeToast, toast } = useToast();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['turma-financeiro-extrato-aluno', matriculaId],
    queryFn: () => alunoExtratoService.getExtrato(matriculaId),
    staleTime: 10_000,
  });

  const copyChargeLink = async (item: AlunoExtratoRecebivel) => {
    if (!item.asaasInvoiceUrl) {
      toast.info('Cobrança sem link', 'Esta parcela ainda não possui link de cobrança no Asaas.');
      return;
    }
    await navigator.clipboard.writeText(item.asaasInvoiceUrl);
    toast.success('Link copiado', 'O link de cobrança foi copiado para envio ao aluno.');
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
    <div className="animate-fadeIn space-y-6">
      <ToastNotification toasts={toasts} onRemove={removeToast} />
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
                {['Cobrança', 'Vencimento', 'Valor', 'Recebimento', 'Asaas', 'Ações'].map((label) => (
                  <th key={label} className="px-5 py-4 text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.recebiveis.map((item, index) => (
                <tr key={item.id} className={index % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                  <td className="px-5 py-4">
                    <p className="text-xs font-bold text-slate-700">{item.descricao}</p>
                    <p className="mt-1 text-[10px] font-black uppercase tracking-wider text-slate-400">
                      {item.tipoLancamento || 'Mensalidade'} {item.parcelaNumero !== undefined ? `· Parcela ${item.parcelaNumero}` : ''}
                    </p>
                  </td>
                  <td className="px-5 py-4 text-xs font-bold text-slate-600">{formatDate(item.dataVencimento)}</td>
                  <td className="px-5 py-4">
                    <p className="text-sm font-black text-[#001a33]">{formatCurrency(item.valor)}</p>
                    {item.valorPago !== undefined && <p className="text-[10px] font-bold text-emerald-700">Recebido: {formatCurrency(item.valorPago)}</p>}
                  </td>
                  <td className="px-5 py-4">
                    <div className="space-y-1.5">
                      <StatusBadge status={item.status} />
                      <p className="text-[10px] font-bold text-slate-500">Forma: {paymentMethodLabel(item)}</p>
                      <p className="text-[10px] font-bold text-slate-500">Origem: {paymentOriginLabel(item)}</p>
                      {item.dataPagamento && <p className="text-[10px] font-bold text-emerald-700">Pago: {formatDate(item.dataPagamento)}</p>}
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${asaasStatusClass(item.asaasStatus)}`}>
                      {asaasStatusLabel(item.asaasStatus)}
                    </span>
                    {item.asaasPaymentId && (
                      <p className="mt-2 max-w-[170px] truncate text-[10px] font-mono text-slate-400">
                        ID Asaas: {item.asaasPaymentId}
                      </p>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex gap-2">
                      <button onClick={() => copyChargeLink(item)} className="rounded-xl border border-emerald-200 p-2 text-emerald-700" title="Copiar link">
                        <Copy size={14} />
                      </button>
                      {item.asaasInvoiceUrl && (
                        <a href={item.asaasInvoiceUrl} target="_blank" rel="noreferrer" className="rounded-xl border border-blue-200 p-2 text-blue-600" title="Abrir cobrança">
                          <ExternalLink size={14} />
                        </a>
                      )}
                      <button className="rounded-xl border border-slate-200 p-2 text-slate-500" title="Documento financeiro">
                        <FileText size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AlunoFinanceiroExtrato;
