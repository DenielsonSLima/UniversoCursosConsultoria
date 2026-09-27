import React from 'react';
import { CheckSquare, Handshake, Paperclip, Trash2, UploadCloud, UsersRound } from 'lucide-react';
import type { ConvenioFinanceiroMes } from '../../convenios/convenios.types';
import {
  formatCompetencia,
  turmaModalidadeOptions,
  type LancamentoMode,
  type RateioPolo,
  type RateioSelection,
  type TurmaModalidade,
} from './despesa-form.utils';

interface Props {
  mode: LancamentoMode;
  convenioMesId: string;
  setConvenioMesId: (value: string) => void;
  convenios: ConvenioFinanceiroMes[];
  conveniosLoading: boolean;
  conveniosError: boolean;
  isPoloMatriz: boolean;
  rateioSelection: RateioSelection;
  setRateioSelection: (value: RateioSelection) => void;
  polosRateio: RateioPolo[];
  polosSelecionados: Set<string>;
  togglePoloRateio: (id: string) => void;
  rateioSelecionadosInvalido: boolean;
  turmaModalidade: TurmaModalidade | '';
  setTurmaModalidade: (value: TurmaModalidade | '') => void;
  turmaId: string;
  setTurmaId: (value: string) => void;
  filteredTurmas: any[];
  anexo: File | null;
  anexoErro: string;
  anexoInputRef: React.RefObject<HTMLInputElement | null>;
  handleAnexo: (file?: File) => void;
  clearAnexo: () => void;
  observacao: string;
  setObservacao: (value: string) => void;
}

const formatMoney = (value: number) => value.toLocaleString('pt-BR', {
  style: 'currency', currency: 'BRL',
});

const DespesaFormAssociations: React.FC<Props> = (props) => {
  const convenioBlockedByMode = props.mode === 'parcelado';
  const convenioBlockedByRateio = props.rateioSelection !== 'DESLIGADO';

  return <>
    <div className="rounded-2xl border border-cyan-100 bg-cyan-50/60 p-4 md:col-span-2">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-cyan-700 shadow-sm"><Handshake size={16} /></div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-black uppercase tracking-wide text-[#001a33]">Vincular a um convênio</p>
          <p className="mt-0.5 text-xs font-medium leading-relaxed text-slate-500">
            Opcional. O valor integral será reservado na competência aberta, sem criar uma segunda saída no Caixa.
          </p>
          <select value={props.convenioMesId} onChange={(event) => props.setConvenioMesId(event.target.value)}
            disabled={convenioBlockedByMode || convenioBlockedByRateio || props.conveniosLoading || props.conveniosError}
            className="mt-3 w-full appearance-none rounded-xl border border-cyan-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-cyan-600 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400">
            <option value="">
              {props.conveniosLoading ? 'Carregando competências abertas...'
                : props.conveniosError ? 'Não foi possível carregar os convênios'
                : 'Sem vínculo com convênio'}
            </option>
            {props.convenios.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nome} · {formatCompetencia(item.competencia)} · reservável {formatMoney(item.saldoProjetado)}
              </option>
            ))}
          </select>
          {!props.conveniosLoading && !props.conveniosError && props.convenios.length === 0 && (
            <p className="mt-2 text-[10px] font-bold text-slate-500">Este polo não possui competência de convênio aberta.</p>
          )}
          {convenioBlockedByMode && <p className="mt-2 text-[10px] font-bold text-amber-700">Convênio aceita somente lançamento pendente ou baixa imediata no MVP.</p>}
          {convenioBlockedByRateio && <p className="mt-2 text-[10px] font-bold text-amber-700">Desative o rateio por polo para vincular um convênio.</p>}
        </div>
      </div>
    </div>

    {props.isPoloMatriz && (
      <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4 md:col-span-2">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-indigo-600 shadow-sm"><UsersRound size={15} /></div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black uppercase tracking-wide text-[#001a33]">Rateio do custo por polo</p>
            <p className="mt-0.5 text-xs font-medium leading-relaxed text-slate-500">O pagamento e a baixa ficam somente na Matriz. Convênio e rateio são mutuamente exclusivos no MVP.</p>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {([
                { id: 'DESLIGADO' as const, label: 'Sem rateio', detail: 'A conta permanece somente na Matriz.' },
                { id: 'TODOS' as const, label: 'Todos os polos', detail: 'Distribui entre os polos ativos.' },
                { id: 'SELECIONADOS' as const, label: 'Selecionar polos', detail: 'Define as unidades do custo.' },
              ]).map((option) => (
                <button key={option.id} type="button" disabled={Boolean(props.convenioMesId) && option.id !== 'DESLIGADO'}
                  onClick={() => props.setRateioSelection(option.id)}
                  className={`rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${props.rateioSelection === option.id ? 'border-indigo-500 bg-white shadow-sm' : 'border-transparent bg-white/60 hover:border-indigo-100'}`}>
                  <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wide text-[#001a33]">
                    <span className={`flex h-4 w-4 items-center justify-center rounded border ${props.rateioSelection === option.id ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white text-transparent'}`}><CheckSquare size={11} /></span>
                    {option.label}
                  </span>
                  <span className="mt-1 block text-[10px] font-medium leading-relaxed text-slate-500">{option.detail}</span>
                </button>
              ))}
            </div>
            {props.rateioSelection === 'SELECIONADOS' && (
              <div className="mt-3 grid max-h-48 grid-cols-1 gap-2 overflow-y-auto rounded-xl border border-indigo-100 bg-white p-3 sm:grid-cols-2">
                {props.polosRateio.map((polo) => <label key={polo.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">
                  <input type="checkbox" checked={props.polosSelecionados.has(polo.id)} onChange={() => props.togglePoloRateio(polo.id)}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                  <span className="min-w-0 truncate">{polo.is_matriz ? 'Matriz — ' : 'Polo — '}{polo.nome}</span>
                </label>)}
              </div>
            )}
            {props.rateioSelecionadosInvalido && <p className="mt-2 text-[10px] font-bold text-rose-600">Selecione ao menos um polo para o rateio.</p>}
          </div>
        </div>
      </div>
    )}

    <div className="grid grid-cols-1 gap-3 md:col-span-2 md:grid-cols-2">
      <div><label className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-400">Tipo da Turma</label>
        <select value={props.turmaModalidade} onChange={(event) => { props.setTurmaModalidade(event.target.value as TurmaModalidade | ''); props.setTurmaId(''); }}
          className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-rose-500">
          <option value="">Selecionar tipo (opcional)...</option>
          {turmaModalidadeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </div>
      <div><label className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-400">Vincular a uma Turma</label>
        <select value={props.turmaId} onChange={(event) => props.setTurmaId(event.target.value)} disabled={!props.turmaModalidade}
          className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-rose-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-300">
          <option value="">{props.turmaModalidade ? 'Nenhuma turma (opcional)...' : 'Selecione o tipo primeiro...'}</option>
          {props.filteredTurmas.map((turma) => <option key={turma.id} value={turma.id}>{turma.nome} ({turma.codigo})</option>)}
        </select>
      </div>
    </div>

    <div className="md:col-span-2">
      <label className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-400"><Paperclip size={11} className="mr-1 inline" />Foto ou PDF</label>
      <input ref={props.anexoInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
        onChange={(event) => props.handleAnexo(event.target.files?.[0])} className="hidden" />
      {props.anexo ? <div className="flex items-center gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-3">
        <Paperclip size={17} className="text-blue-600" /><div className="min-w-0 flex-1"><p className="truncate text-xs font-black text-slate-700">{props.anexo.name}</p>
          <p className="mt-0.5 text-[10px] font-semibold text-slate-400">{(props.anexo.size / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} MB · Armazenamento privado</p></div>
        <button type="button" onClick={props.clearAnexo} className="rounded-xl p-2 text-slate-400 hover:bg-white hover:text-rose-600" title="Remover anexo"><Trash2 size={16} /></button>
      </div> : <button type="button" onClick={() => props.anexoInputRef.current?.click()}
        className="group flex w-full items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-left hover:border-blue-300 hover:bg-blue-50">
        <UploadCloud size={17} className="text-slate-400 group-hover:text-blue-600" /><div><p className="text-xs font-black text-slate-600">Anexar comprovante ou documento</p><p className="mt-0.5 text-[10px] font-medium text-slate-400">PDF, JPG, PNG ou WEBP · até 10 MB</p></div>
      </button>}
      {props.anexoErro && <p className="mt-1.5 text-[10px] font-bold text-rose-600">{props.anexoErro}</p>}
    </div>

    <div className="md:col-span-2"><label className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-400">Observação</label>
      <textarea placeholder="Detalhes adicionais (opcional)..." value={props.observacao} onChange={(event) => props.setObservacao(event.target.value)} rows={2}
        className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none placeholder:text-slate-300 focus:ring-2 focus:ring-rose-500" />
    </div>
  </>;
};

export default DespesaFormAssociations;
