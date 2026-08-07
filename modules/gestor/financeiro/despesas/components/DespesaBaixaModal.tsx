import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, RefreshCw, X } from 'lucide-react';
import {
  createFinanceRequestId,
  DespesaBaixaParams,
  DespesaLancamento,
} from '../despesas.service';
import BankAccountPicker from '../../components/BankAccountPicker';
import {
  ContaBancaria,
  isContaDisponivelNoPolo,
} from '../../financeiro.service';

const parseCurrency = (value: string) => (
  Number(value.replace(/[^\d.,]/g, '').replace(/\./g, '').replace(',', '.') || 0)
);

const formatCurrency = (value: number) => (
  Number(value || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
);

const normalizeCurrency = (value: string) => {
  const parsed = parseCurrency(value);
  return parsed > 0 ? formatCurrency(parsed) : '';
};

const today = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

interface DespesaBaixaModalProps {
  item: DespesaLancamento;
  contas: ContaBancaria[];
  poloId: string;
  onConfirm: (params: DespesaBaixaParams) => void;
  onClose: () => void;
  isPending: boolean;
  tone?: 'emerald' | 'indigo';
}

const DespesaBaixaModal: React.FC<DespesaBaixaModalProps> = ({
  item,
  contas,
  poloId,
  onConfirm,
  onClose,
  isPending,
  tone = 'emerald',
}) => {
  const [contaBancariaId, setContaBancariaId] = useState('');
  const [dataPagamento, setDataPagamento] = useState(today());
  const [formaPagamento, setFormaPagamento] = useState('PIX');
  const [jurosValor, setJurosValor] = useState(formatCurrency(item.jurosValor));
  const [multaValor, setMultaValor] = useState(formatCurrency(item.multaValor));
  const [descontoValor, setDescontoValor] = useState(formatCurrency(item.descontoValor));
  const requestIdRef = useRef(createFinanceRequestId());
  const activeContas = useMemo(
    () => contas.filter(
      (conta) => conta.ativo !== false && isContaDisponivelNoPolo(conta, poloId),
    ),
    [contas, poloId],
  );

  useEffect(() => {
    if (
      contaBancariaId
      && !activeContas.some((conta) => conta.id === contaBancariaId)
    ) {
      setContaBancariaId('');
    }
  }, [activeContas, contaBancariaId]);

  const accent = tone === 'indigo'
    ? {
        text: 'text-indigo-700',
        lightText: 'text-indigo-600',
        border: 'border-indigo-200',
        ring: 'focus:ring-indigo-500',
        button: 'bg-indigo-600 hover:bg-indigo-700',
        soft: 'bg-indigo-50',
      }
    : {
        text: 'text-emerald-700',
        lightText: 'text-emerald-600',
        border: 'border-emerald-200',
        ring: 'focus:ring-emerald-500',
        button: 'bg-emerald-600 hover:bg-emerald-700',
        soft: 'bg-emerald-50',
      };

  const adjustmentFields = [
    { label: 'Juros', value: jurosValor, setter: setJurosValor },
    { label: 'Multa', value: multaValor, setter: setMultaValor },
    { label: 'Desconto', value: descontoValor, setter: setDescontoValor },
  ];

  return (
    <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="max-h-[calc(100dvh-2rem)] w-full max-w-xl overflow-y-auto rounded-3xl bg-white p-7 shadow-2xl animate-fadeIn">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-lg font-black uppercase tracking-tight text-[#001a33]">Dar Baixa</h3>
            <p className="mt-0.5 truncate text-xs font-medium text-slate-400">{item.descricao}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            title="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <div className={`rounded-2xl border ${accent.border} ${accent.soft} p-4`}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className={`text-[10px] font-black uppercase tracking-wider ${accent.lightText}`}>
                  Valor-base
                </p>
                <p className={`mt-0.5 text-xl font-black ${accent.text}`}>
                  R$ {formatCurrency(item.valorBase)}
                </p>
              </div>
              <span className={`rounded-lg border bg-white px-2 py-1 text-[9px] font-black uppercase tracking-wider ${accent.border} ${accent.lightText}`}>
                Total calculado no banco
              </span>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {adjustmentFields.map((field) => (
                <div key={field.label}>
                  <label className={`mb-1 block text-[10px] font-bold uppercase tracking-wider ${accent.lightText}`}>
                    {field.label}
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">R$</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={field.value}
                      placeholder="0,00"
                      onChange={(event) => field.setter(event.target.value)}
                      onBlur={(event) => field.setter(normalizeCurrency(event.target.value))}
                      className={`w-full rounded-xl border bg-white py-2.5 pl-9 pr-3 text-sm font-bold outline-none ${accent.border} ${accent.ring}`}
                    />
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[10px] font-semibold text-slate-500">
              Valor pago = valor-base + juros + multa − desconto.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-400">
              Conta bancária *
            </label>
            <BankAccountPicker
              accounts={activeContas}
              value={contaBancariaId}
              onChange={setContaBancariaId}
              placeholder="Selecionar conta..."
              tone={tone}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-400">
              Data do pagamento
            </label>
            <input
              type="date"
              value={dataPagamento}
              onChange={(event) => setDataPagamento(event.target.value)}
              className={`w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:ring-2 ${accent.ring}`}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-400">
              Forma de pagamento
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {['PIX', 'TED', 'BOLETO', 'DINHEIRO'].map((forma) => (
                <button
                  key={forma}
                  type="button"
                  onClick={() => setFormaPagamento(forma)}
                  className={`rounded-lg border py-2 text-[10px] font-bold uppercase transition-all ${
                    formaPagamento === forma
                      ? `${accent.button} border-transparent text-white`
                      : `border-slate-200 text-slate-500 ${accent.border}`
                  }`}
                >
                  {forma}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-bold uppercase text-slate-500 transition-colors hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onConfirm({
              requestId: requestIdRef.current,
              contaBancariaId,
              dataPagamento,
              formaPagamento,
              jurosValor: parseCurrency(jurosValor),
              multaValor: parseCurrency(multaValor),
              descontoValor: parseCurrency(descontoValor),
            })}
            disabled={!contaBancariaId || !dataPagamento || isPending}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-black uppercase tracking-wide text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${accent.button}`}
          >
            {isPending ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
};

export default DespesaBaixaModal;
