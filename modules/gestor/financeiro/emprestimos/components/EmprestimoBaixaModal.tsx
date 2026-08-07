import React, { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Landmark, Loader2, WalletCards, X } from 'lucide-react';
import BankAccountPicker from '../../components/BankAccountPicker';
import { createEmprestimoRequestId } from '../emprestimos.service';
import type {
  BaixarEmprestimoParcelaInput,
  EmprestimoFormaPagamento,
  EmprestimoParcela,
} from '../emprestimos.types';
import type { ContaBancaria } from '../../financeiro.service';

const today = () => new Date().toISOString().slice(0, 10);

const formatCurrency = (value: number) => (
  Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
);

const formatDate = (value?: string) => (
  value ? new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR') : '—'
);

interface EmprestimoBaixaModalProps {
  parcela: EmprestimoParcela;
  poloResponsavelId: string;
  poloResponsavelNome: string;
  contas: ContaBancaria[];
  isPending?: boolean;
  error?: Error | null;
  onClose: () => void;
  onConfirm: (input: BaixarEmprestimoParcelaInput) => void;
}

const EmprestimoBaixaModal: React.FC<EmprestimoBaixaModalProps> = ({
  parcela,
  poloResponsavelId,
  poloResponsavelNome,
  contas,
  isPending = false,
  error,
  onClose,
  onConfirm,
}) => {
  const requestIdRef = useRef(createEmprestimoRequestId());
  const [contaBancariaId, setContaBancariaId] = useState('');
  const [dataPagamento, setDataPagamento] = useState(today());
  const [formaPagamento, setFormaPagamento] = useState<EmprestimoFormaPagamento>('PIX');
  const availableAccounts = useMemo(
    () => contas.filter((conta) => conta.ativo !== false),
    [contas],
  );

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!contaBancariaId || !dataPagamento) return;
    onConfirm({
      parcelaId: parcela.id,
      poloResponsavelId,
      requestId: requestIdRef.current,
      contaBancariaId,
      dataPagamento,
      formaPagamento,
    });
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[230] flex items-center justify-center overflow-hidden bg-black/40 p-4 backdrop-blur-sm animate-fadeIn overscroll-contain">
      <div className="w-full max-w-lg rounded-[2rem] bg-white p-7 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-indigo-600"><Landmark size={14} /> Baixa do polo responsável</p>
            <h3 className="mt-1 text-lg font-black uppercase tracking-tight text-[#001a33]">Baixar parcela {parcela.numero}</h3>
            <p className="mt-0.5 text-xs font-medium text-slate-500">O pagamento é registrado na conta de {poloResponsavelNome || 'o polo responsável'}.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            aria-label="Fechar baixa"
            className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
          >
            <X size={19} />
          </button>
        </div>

        <div className="mt-5 rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-indigo-700">Valor canônico da parcela</p>
              <p className="mt-1 text-2xl font-black text-[#001a33]">{formatCurrency(parcela.valorTotal)}</p>
            </div>
            <div className="text-right text-xs font-semibold text-slate-600">
              <p>Vencimento</p>
              <p className="mt-0.5 font-black text-[#001a33]">{formatDate(parcela.dataVencimento)}</p>
            </div>
          </div>
          <p className="mt-3 text-[11px] font-medium leading-relaxed text-slate-500">
            Não há edição de valor nesta baixa: a parcela e, quando existir, o rateio por polo foram definidos pelo backend.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-400"><WalletCards size={11} className="mr-1 inline" /> Conta do polo responsável *</label>
            <BankAccountPicker
              accounts={availableAccounts}
              value={contaBancariaId}
              onChange={setContaBancariaId}
              placeholder="Selecionar conta para a baixa..."
              tone="indigo"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-400">Data do pagamento *</label>
            <input
              type="date"
              value={dataPagamento}
              onChange={(event) => setDataPagamento(event.target.value)}
              required
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-400">Forma de pagamento *</label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(['PIX', 'TED', 'DINHEIRO', 'BOLETO'] as EmprestimoFormaPagamento[]).map((forma) => (
                <button
                  key={forma}
                  type="button"
                  onClick={() => setFormaPagamento(forma)}
                  className={`rounded-xl border py-2.5 text-[10px] font-black uppercase tracking-wide transition-colors ${
                    formaPagamento === forma
                      ? 'border-indigo-600 bg-indigo-600 text-white shadow-md shadow-indigo-900/15'
                      : 'border-slate-200 text-slate-500 hover:border-indigo-200 hover:text-indigo-600'
                  }`}
                >
                  {forma}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">
              {error.message || 'Não foi possível concluir a baixa.'}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-bold uppercase text-slate-500 transition-colors hover:bg-slate-50 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!contaBancariaId || !dataPagamento || isPending}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-sm font-black uppercase tracking-wide text-white shadow-md shadow-indigo-900/20 transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
              Confirmar baixa
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
};

export default EmprestimoBaixaModal;
