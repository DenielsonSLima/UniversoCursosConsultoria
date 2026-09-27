import React, { useRef, useState } from 'react';
import { CircleDollarSign, Loader2 } from 'lucide-react';
import type { ContaBancaria } from '../../financeiro.service';
import BankAccountPicker from '../../components/BankAccountPicker';
import { todayInMaceio } from '../../receber/components/manual-settlement/manual-settlement-date';
import type { ConvenioFinanceiroMes, LancarConvenioCreditoInput } from '../convenios.types';
import {
  createConvenioRequestId,
  formatConvenioCompetencia,
  formatConvenioCurrency,
  parseConvenioCurrencyInput,
} from '../convenios.presentation';
import ConvenioModalShell from './ConvenioModalShell';

interface ConvenioCreditModalProps {
  mes: ConvenioFinanceiroMes;
  contas: ContaBancaria[];
  isPending: boolean;
  error?: Error | null;
  onClose: () => void;
  onConfirm: (input: LancarConvenioCreditoInput) => void;
}

const competenciaDateBounds = (competencia: string) => {
  const [year, month] = competencia.slice(0, 7).split('-').map(Number);
  if (!year || !month) return { min: competencia.slice(0, 10), max: competencia.slice(0, 10) };
  const min = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { min, max: `${year}-${String(month).padStart(2, '0')}-${lastDay}` };
};

const ConvenioCreditModal: React.FC<ConvenioCreditModalProps> = ({
  mes,
  contas,
  isPending,
  error,
  onClose,
  onConfirm,
}) => {
  const dateBounds = competenciaDateBounds(mes.competencia);
  const today = todayInMaceio();
  const [valor, setValor] = useState('');
  const [dataCredito, setDataCredito] = useState(
    today >= dateBounds.min && today <= dateBounds.max ? today : dateBounds.min,
  );
  const [descricao, setDescricao] = useState('Crédito mensal do convênio');
  const [contaBancariaId, setContaBancariaId] = useState('');
  const [formaRecebimento, setFormaRecebimento] = useState<LancarConvenioCreditoInput['formaRecebimento']>('PIX');
  const [observacao, setObservacao] = useState('');
  const requestIdRef = useRef(createConvenioRequestId());
  const parsedValue = parseConvenioCurrencyInput(valor);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!contaBancariaId || parsedValue <= 0 || !descricao.trim()) return;
    onConfirm({
      requestId: requestIdRef.current,
      competenciaId: mes.id,
      contaBancariaId,
      dataCredito,
      valor: parsedValue,
      formaRecebimento,
      descricao: descricao.trim(),
      observacao: observacao.trim() || undefined,
    });
  };

  return (
    <ConvenioModalShell
      title="Lançar crédito"
      subtitle={`${mes.nome} · ${formatConvenioCompetencia(mes.competencia)}`}
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-5 p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Valor recebido *</span>
            <div className="relative mt-1">
              <CircleDollarSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-cyan-700" />
              <input
                inputMode="decimal"
                value={valor}
                onChange={(event) => setValor(event.target.value)}
                onBlur={() => {
                  if (parsedValue > 0) setValor(formatConvenioCurrency(parsedValue));
                }}
                placeholder="R$ 0,00"
                required
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm font-black text-[#001a33] outline-none focus:border-cyan-500"
              />
            </div>
          </label>
          <label className="block">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Data do crédito *</span>
            <input type="date" min={dateBounds.min} max={dateBounds.max} value={dataCredito} onChange={(event) => setDataCredito(event.target.value)} required className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:border-cyan-500" />
          </label>
        </div>

        <div>
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Conta de recebimento *</span>
          <div className="mt-1">
            <BankAccountPicker accounts={contas} value={contaBancariaId} onChange={setContaBancariaId} tone="blue" />
          </div>
        </div>

        <label className="block">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Descrição *</span>
          <input value={descricao} onChange={(event) => setDescricao(event.target.value)} maxLength={160} required className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:border-cyan-500" />
        </label>

        <div>
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Forma de recebimento</span>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(['PIX', 'TED', 'DINHEIRO', 'BOLETO'] as const).map((forma) => (
              <button key={forma} type="button" onClick={() => setFormaRecebimento(forma)} className={`rounded-xl border px-3 py-2.5 text-[10px] font-black uppercase tracking-wide ${formaRecebimento === forma ? 'border-cyan-600 bg-cyan-50 text-cyan-800' : 'border-slate-200 text-slate-500'}`}>
                {forma}
              </button>
            ))}
          </div>
        </div>

        <label className="block">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Observação</span>
          <textarea value={observacao} onChange={(event) => setObservacao(event.target.value)} rows={2} maxLength={500} className="mt-1 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none focus:border-cyan-500" />
        </label>

        <p className="rounded-xl border border-cyan-100 bg-cyan-50/70 px-4 py-3 text-xs font-medium leading-relaxed text-cyan-900">
          O backend registra o crédito real na conta escolhida e atualiza o saldo sem duplicar a entrada no Caixa. Confira os dados: o crédito fica imutável após a confirmação.
        </p>
        {error ? <p role="alert" className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">{error.message}</p> : null}

        <div className="flex justify-end gap-3 border-t border-slate-100 pt-5">
          <button type="button" onClick={onClose} disabled={isPending} className="rounded-xl border border-slate-200 px-5 py-3 text-xs font-black uppercase tracking-wide text-slate-600 disabled:opacity-50">Cancelar</button>
          <button type="submit" disabled={isPending || parsedValue <= 0 || !contaBancariaId} className="inline-flex items-center gap-2 rounded-xl bg-cyan-700 px-5 py-3 text-xs font-black uppercase tracking-wide text-white hover:bg-cyan-800 disabled:opacity-50">
            {isPending ? <Loader2 size={15} className="animate-spin" /> : <CircleDollarSign size={15} />}
            Confirmar crédito
          </button>
        </div>
      </form>
    </ConvenioModalShell>
  );
};

export default ConvenioCreditModal;
