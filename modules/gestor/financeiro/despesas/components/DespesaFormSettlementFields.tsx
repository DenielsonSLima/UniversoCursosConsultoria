import React from 'react';
import { CheckCircle2, Layers } from 'lucide-react';
import type { ContaBancaria } from '../../financeiro.service';
import BankAccountPicker from '../../components/BankAccountPicker';
import type { IntervaloUnit, LancamentoMode } from './despesa-form.utils';

interface Props {
  mode: LancamentoMode;
  totalParcelas: number;
  setTotalParcelas: (value: number) => void;
  intervaloDias: number;
  setIntervaloDias: (value: number) => void;
  intervaloUnit: IntervaloUnit;
  setIntervaloUnit: (value: IntervaloUnit) => void;
  splitTotal: boolean;
  setSplitTotal: (value: boolean) => void;
  activeContas: ContaBancaria[];
  contaBancariaId: string;
  setContaBancariaId: (value: string) => void;
  formaPagamento: string;
  setFormaPagamento: (value: string) => void;
}

const DespesaFormSettlementFields: React.FC<Props> = (props) => <>
  {props.mode === 'parcelado' && (
    <div className="space-y-3 rounded-2xl border border-indigo-100 bg-indigo-50 p-4 md:col-span-2">
      <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-indigo-700"><Layers size={13} /> Configuração de Parcelas</p>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-indigo-500">Nº de Parcelas</label>
          <input type="number" min={2} max={60} value={props.totalParcelas} onChange={(event) => props.setTotalParcelas(Number(event.target.value))}
            className="w-full rounded-xl border border-indigo-200 bg-white px-3 py-2.5 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div><label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-indigo-500">Intervalo</label>
          <div className="flex gap-1.5"><input type="number" min={1} value={props.intervaloDias} onChange={(event) => props.setIntervaloDias(Number(event.target.value))}
            className="w-16 rounded-xl border border-indigo-200 bg-white px-2 py-2.5 text-center text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500" />
            <select value={props.intervaloUnit} onChange={(event) => props.setIntervaloUnit(event.target.value as IntervaloUnit)}
              className="flex-1 appearance-none rounded-xl border border-indigo-200 bg-white px-2 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="dias">Dias</option><option value="semanas">Semanas</option><option value="meses">Meses</option>
            </select></div>
        </div>
      </div>
      <p className="text-[10px] font-medium text-indigo-500">
        {props.splitTotal ? 'O valor total e os ajustes serão divididos de forma canônica no banco.' : 'Cada parcela manterá o valor informado.'}
        {' '}O intervalo será de <strong>{props.intervaloDias} {props.intervaloUnit}</strong>.
      </p>
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-indigo-200 bg-white/80 p-3 text-left">
        <input type="checkbox" checked={props.splitTotal} onChange={(event) => props.setSplitTotal(event.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500" />
        <span><span className="block text-[11px] font-black uppercase tracking-wider text-indigo-800">Desdobrar valor total</span>
          <span className="mt-0.5 block text-[10px] font-medium text-indigo-600">O backend divide o total preservando todos os centavos.</span></span>
      </label>
    </div>
  )}

  {props.mode === 'baixa' && (
    <div className="space-y-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 md:col-span-2">
      <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-emerald-700"><CheckCircle2 size={13} /> Dar Baixa Imediata</p>
      <div><label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-emerald-600">Conta Bancária *</label>
        <BankAccountPicker accounts={props.activeContas} value={props.contaBancariaId} onChange={props.setContaBancariaId} placeholder="Selecionar conta..." tone="emerald" />
      </div>
      <div><label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-emerald-600">Forma de Pagamento</label>
        <div className="flex gap-2">{(['PIX', 'TED', 'BOLETO', 'DINHEIRO'] as const).map((forma) => (
          <button key={forma} type="button" onClick={() => props.setFormaPagamento(forma)}
            className={`flex-1 rounded-lg border py-2 text-[10px] font-bold uppercase transition-all ${props.formaPagamento === forma ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-200 text-slate-500 hover:border-emerald-400'}`}>
            {forma}
          </button>
        ))}</div>
      </div>
    </div>
  )}
</>;

export default DespesaFormSettlementFields;
