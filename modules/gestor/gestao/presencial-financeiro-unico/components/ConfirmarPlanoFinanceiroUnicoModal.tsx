import React from 'react';
import { CalendarDays, CheckCircle2, FileText, Loader2, ReceiptText, X } from 'lucide-react';
import { formatCurrencyBRL, formatDateBR, formatPercentageBR } from '../formatters';
import type { RegraPlanoFinanceiroUnico } from '../types';

interface ConfirmarPlanoFinanceiroUnicoModalProps {
  turmaNome: string;
  student: { nome: string };
  regra: RegraPlanoFinanceiroUnico;
  pending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

const ConfirmarPlanoFinanceiroUnicoModal: React.FC<ConfirmarPlanoFinanceiroUnicoModalProps> = ({
  turmaNome,
  student,
  regra,
  pending,
  onClose,
  onConfirm,
}) => (
  <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
    <section
      role="dialog"
      aria-modal="true"
      aria-labelledby="plano-unico-title"
      className="max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-[2rem] bg-white shadow-2xl"
    >
      <header className="flex items-start justify-between gap-4 bg-[#001a33] p-6 text-white">
        <div>
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300">
            <ReceiptText size={14} /> Plano financeiro da turma
          </p>
          <h3 id="plano-unico-title" className="mt-1 text-xl font-black">Confirmar pré-matrícula e parcelas</h3>
          <p className="mt-1 text-xs font-semibold text-blue-100">{student.nome} · {turmaNome}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          aria-label="Fechar confirmação"
          className="rounded-full p-2 text-blue-200 hover:bg-white/10 disabled:opacity-50"
        >
          <X size={20} />
        </button>
      </header>

      <div className="max-h-[calc(90vh-157px)] overflow-y-auto p-6">
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-xs font-semibold leading-relaxed text-emerald-900">
          <CheckCircle2 size={18} className="mb-2 text-emerald-600" />
          Este é o plano já configurado para a turma. Não existe cobrança de matrícula ou rematrícula neste fluxo: a confirmação cria a pré-matrícula e gera somente os títulos das parcelas em boleto abaixo. O aluno é ativado quando o primeiro pagamento for confirmado.
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Valor total</p>
            <p className="mt-1 text-xl font-black text-[#001a33]">{formatCurrencyBRL(regra.valorTotal)}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Parcelamento</p>
            <p className="mt-1 text-xl font-black text-[#001a33]">{regra.qtdParcelas}x no boleto</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Primeiro vencimento</p>
            <p className="mt-1 text-xl font-black text-[#001a33]">{formatDateBR(regra.primeiroVencimento)}</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 text-xs sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 p-3"><p className="font-black uppercase tracking-wide text-slate-400">Desconto pontualidade</p><p className="mt-1 font-black text-[#001a33]">{formatCurrencyBRL(regra.descontoPontualidade)}</p></div>
          <div className="rounded-xl border border-slate-200 p-3"><p className="font-black uppercase tracking-wide text-slate-400">Juros de atraso</p><p className="mt-1 font-black text-[#001a33]">{formatPercentageBR(regra.jurosAtrasoPercentual)}% ao mês</p></div>
          <div className="rounded-xl border border-slate-200 p-3"><p className="font-black uppercase tracking-wide text-slate-400">Multa de atraso</p><p className="mt-1 font-black text-[#001a33]">{formatCurrencyBRL(regra.multaAtraso)}</p></div>
        </div>

        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200">
          <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
            <CalendarDays size={16} className="text-blue-600" />
            <p className="text-xs font-black uppercase tracking-wider text-[#001a33]">Cronograma que será gerado</p>
          </div>
          <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
            {regra.cronograma.map((parcela) => (
              <div key={parcela.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                <div>
                  <p className="font-bold text-[#001a33]">{parcela.label}</p>
                  <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Vence em {formatDateBR(parcela.dataVencimento)}</p>
                </div>
                <p className="shrink-0 font-black text-[#001a33]">{formatCurrencyBRL(parcela.valor)}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="mt-4 flex items-start gap-2 text-[11px] font-semibold leading-relaxed text-slate-500">
          <FileText size={14} className="mt-0.5 shrink-0" />
          A regra e o cronograma são apenas para consulta nesta etapa. A turma define a quantidade de parcelas; não há uma quantidade fixa. Após gerar os títulos, a emissão bancária é feita em Financeiro › Receber.
        </p>
      </div>

      <footer className="flex gap-3 border-t border-slate-100 bg-white p-5">
        <button type="button" onClick={onClose} disabled={pending} className="flex-1 rounded-xl border border-slate-200 py-3 text-[10px] font-black uppercase tracking-wider text-slate-500 disabled:opacity-50">
          Voltar
        </button>
        <button type="button" onClick={onConfirm} disabled={pending} className="flex-[1.45] rounded-xl bg-emerald-600 py-3 text-[10px] font-black uppercase tracking-wider text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 disabled:opacity-50">
          {pending ? <span className="flex items-center justify-center gap-2"><Loader2 size={14} className="animate-spin" /> Gerando...</span> : `Matricular e gerar ${regra.qtdParcelas} parcela${regra.qtdParcelas === 1 ? '' : 's'}`}
        </button>
      </footer>
    </section>
  </div>
);

export default ConfirmarPlanoFinanceiroUnicoModal;
