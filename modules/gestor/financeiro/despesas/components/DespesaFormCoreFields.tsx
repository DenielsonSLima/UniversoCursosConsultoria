import React from 'react';
import { Calendar, CheckCircle2, Clock, DollarSign, FileText, Layers, Plus, Tag } from 'lucide-react';
import type { CategoriaFinanceira } from '../despesas.service';
import type { DespesaTipo } from '../despesas.queryKeys';
import CategoriaFinanceiraInlineModal from './CategoriaFinanceiraInlineModal';
import DespesaCredorPicker, { DespesaCredorTipo } from './DespesaCredorPicker';
import {
  formatCurrencyInput,
  formatCurrencyTyping,
  type LancamentoMode,
} from './despesa-form.utils';

interface Props {
  mode: LancamentoMode;
  setMode: (value: LancamentoMode) => void;
  dataLancamento: string;
  setDataLancamento: (value: string) => void;
  dataVencimento: string;
  setDataVencimento: (value: string) => void;
  categoriaId: string;
  setCategoriaId: (value: string) => void;
  categorias: CategoriaFinanceira[];
  tipo: DespesaTipo;
  showCategoriaModal: boolean;
  setShowCategoriaModal: React.Dispatch<React.SetStateAction<boolean>>;
  categoriaSelectRef: React.RefObject<HTMLDivElement | null>;
  descricao: string;
  setDescricao: (value: string) => void;
  valor: string;
  setValor: (value: string) => void;
  parceiros: any[];
  fornecedorTipo: DespesaCredorTipo | '';
  setFornecedorTipo: (value: DespesaCredorTipo | '') => void;
  fornecedorId: string;
  setFornecedorId: (value: string) => void;
  jurosValor: string;
  setJurosValor: (value: string) => void;
  multaValor: string;
  setMultaValor: (value: string) => void;
  descontoValor: string;
  setDescontoValor: (value: string) => void;
  convenioVinculado: boolean;
}

const DespesaFormCoreFields: React.FC<Props> = (props) => {
  const modes = props.convenioVinculado
    ? [
        { id: 'pendente' as const, label: 'Pendente', Icon: Clock },
        { id: 'baixa' as const, label: 'Dar Baixa', Icon: CheckCircle2 },
      ]
    : [
        { id: 'pendente' as const, label: 'Pendente', Icon: Clock },
        { id: 'parcelado' as const, label: 'Parcelado', Icon: Layers },
        { id: 'baixa' as const, label: 'Dar Baixa', Icon: CheckCircle2 },
      ];

  return <>
    <div className="md:col-span-2">
      <label className="mb-2 block text-[10px] font-black uppercase tracking-wider text-slate-400">
        Modo de Lançamento
      </label>
      <div className="flex gap-2">
        {modes.map(({ id, label, Icon }) => (
          <button key={id} type="button" onClick={() => props.setMode(id)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border py-2.5 text-xs font-bold uppercase tracking-wide transition-all ${props.mode === id ? 'border-rose-600 bg-rose-600 text-white shadow-md' : 'border-slate-200 text-slate-500 hover:border-rose-300 hover:text-rose-600'}`}>
            <Icon size={13} />{label}
          </button>
        ))}
      </div>
    </div>

    {[{ label: 'Data de Lançamento *', value: props.dataLancamento, setter: props.setDataLancamento },
      { label: 'Data de Vencimento *', value: props.dataVencimento, setter: props.setDataVencimento }].map((field) => (
      <div key={field.label}>
        <label className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-400">
          <Calendar size={11} className="mr-1 inline" />{field.label}
        </label>
        <input type="date" value={field.value} onChange={(event) => field.setter(event.target.value)} required
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none transition-all focus:ring-2 focus:ring-rose-500" />
      </div>
    ))}

    <div>
      <label className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-400">
        <Tag size={11} className="mr-1 inline" />Categoria
      </label>
      <div className="relative" ref={props.categoriaSelectRef}>
        <div className="flex gap-2">
          <select value={props.categoriaId} onChange={(event) => props.setCategoriaId(event.target.value)}
            className="flex-1 appearance-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-rose-500">
            <option value="">Selecionar categoria...</option>
            {props.categorias.map((categoria) => <option key={categoria.id} value={categoria.id}>{categoria.nome}</option>)}
          </select>
          <button type="button" onClick={() => props.setShowCategoriaModal((value) => !value)}
            className="flex items-center gap-1 whitespace-nowrap rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-100">
            <Plus size={14} />Nova
          </button>
        </div>
        {props.showCategoriaModal && <CategoriaFinanceiraInlineModal tipo={props.tipo}
          onCriada={(id) => { props.setCategoriaId(id); props.setShowCategoriaModal(false); }}
          onClose={() => props.setShowCategoriaModal(false)} />}
      </div>
    </div>

    <div>
      <label className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-400"><FileText size={11} className="mr-1 inline" />Descrição *</label>
      <input type="text" placeholder="Ex: Aluguel de outubro, energia elétrica..." value={props.descricao}
        onChange={(event) => props.setDescricao(event.target.value)} required
        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none placeholder:text-slate-300 focus:ring-2 focus:ring-rose-500" />
    </div>

    <div>
      <label className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-400"><DollarSign size={11} className="mr-1 inline" />Valor *</label>
      <div className="relative"><span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">R$</span>
        <input type="text" inputMode="decimal" placeholder="0,00" value={props.valor}
          onChange={(event) => props.setValor(formatCurrencyTyping(event.target.value, props.valor))}
          onBlur={(event) => props.setValor(formatCurrencyInput(event.target.value))} required
          className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm font-semibold outline-none placeholder:text-slate-300 focus:ring-2 focus:ring-rose-500" />
      </div>
    </div>

    <DespesaCredorPicker parceiros={props.parceiros} tipo={props.fornecedorTipo}
      value={props.fornecedorId} onTipoChange={props.setFornecedorTipo} onChange={props.setFornecedorId} />

    <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4 md:col-span-2">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div><p className="text-xs font-black uppercase tracking-wider text-amber-800">Ajustes do valor</p>
          <p className="mt-0.5 text-[10px] font-medium text-amber-700/70">Valores opcionais por lançamento ou por parcela.</p></div>
        <span className="rounded-lg border border-amber-200 bg-white px-2 py-1 text-[9px] font-black uppercase tracking-wider text-amber-700">Calculado no banco</span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[{ label: 'Juros', value: props.jurosValor, setter: props.setJurosValor },
          { label: 'Multa', value: props.multaValor, setter: props.setMultaValor },
          { label: 'Desconto', value: props.descontoValor, setter: props.setDescontoValor }].map((field) => (
          <div key={field.label}><label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">{field.label}</label>
            <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">R$</span>
              <input type="text" inputMode="decimal" placeholder="0,00" value={field.value}
                onChange={(event) => field.setter(formatCurrencyTyping(event.target.value, field.value))}
                onBlur={(event) => field.setter(formatCurrencyInput(event.target.value))}
                className="w-full rounded-xl border border-white bg-white py-2.5 pl-9 pr-3 text-sm font-bold outline-none focus:ring-2 focus:ring-amber-500" />
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[10px] font-semibold text-slate-500">Valor final = valor-base + juros + multa − desconto.</p>
    </div>
  </>;
};

export default DespesaFormCoreFields;
