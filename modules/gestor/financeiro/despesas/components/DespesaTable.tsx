import React from 'react';
import {
  AlertCircle, Banknote, CheckCircle2, Clock, Paperclip, Pencil,
  Printer, RotateCcw, Trash2, XCircle,
} from 'lucide-react';
import type { ContaBancaria } from '../../financeiro.service';
import type { DespesaLancamento } from '../despesas.service';
import { formatDespesaCurrency, formatDespesaDate, getDespesaContaLabel } from './despesaPresentation';
import DespesaConvenioBadge from './DespesaConvenioBadge';

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const configs: Record<string, { label: string; className: string; Icon: React.ElementType }> = {
    PAGO: { label: 'Pago', className: 'border-emerald-200 bg-emerald-50 text-emerald-700', Icon: CheckCircle2 },
    PENDENTE: { label: 'Pendente', className: 'border-amber-200 bg-amber-50 text-amber-700', Icon: Clock },
    VENCIDO: { label: 'Vencido', className: 'border-rose-200 bg-rose-50 text-rose-700', Icon: AlertCircle },
    CANCELADO: { label: 'Cancelado', className: 'border-slate-200 bg-slate-100 text-slate-500', Icon: XCircle },
  };
  const config = configs[status] || configs.PENDENTE;
  return <span className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${config.className}`}><config.Icon size={10} /> {config.label}</span>;
};

interface DespesaTableProps {
  items: DespesaLancamento[];
  contas: ContaBancaria[];
  onPagar?: (item: DespesaLancamento) => void;
  onEditar?: (item: DespesaLancamento) => void;
  onCancelar?: (item: DespesaLancamento) => void;
  onExcluir?: (items: DespesaLancamento[]) => void;
  onImprimir?: (item: DespesaLancamento) => void;
  onAnexo?: (item: DespesaLancamento) => void;
  selectedIds?: ReadonlySet<string>;
  onSelectionChange?: (ids: Set<string>) => void;
}

const actionClass = 'inline-flex items-center justify-center gap-1.5 rounded-lg border bg-white px-2.5 py-2 text-[9px] font-black uppercase tracking-wide shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1';

const DespesaTable: React.FC<DespesaTableProps> = ({
  items, contas, onPagar, onEditar, onCancelar, onExcluir, onImprimir, onAnexo,
  selectedIds, onSelectionChange,
}) => {
  if (items.length === 0) {
    return <div className="py-16 text-center text-slate-400"><Banknote size={48} className="mx-auto mb-4 opacity-30" /><p className="text-sm font-bold uppercase tracking-wider">Nenhum lançamento encontrado</p><p className="mt-1 text-xs">Ajuste os filtros ou crie um novo lançamento</p></div>;
  }

  const toggleSelection = (item: DespesaLancamento) => {
    if (!onSelectionChange || !selectedIds) return;
    const next = new Set(selectedIds);
    if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
    onSelectionChange(next);
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full table-fixed text-left" aria-label="Lançamentos de despesas">
        <colgroup><col className="w-[27%]" /><col className="w-[14%]" /><col className="w-[16%]" /><col className="w-[21%]" /><col className="w-[22%]" /></colgroup>
        <thead><tr className="border-b border-slate-200 bg-slate-100/80">
          {['Lançamento', 'Datas', 'Valores', 'Pagamento', 'Situação e ações'].map((label) => <th key={label} className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</th>)}
        </tr></thead>
        <tbody>
          {items.map((item, index) => {
            const isPago = item.status === 'PAGO';
            const isCancelado = item.status === 'CANCELADO';
            const isAberto = item.status === 'PENDENTE' || item.status === 'VENCIDO';
            const selectable = isAberto && !item.isRateioDerived && Boolean(onSelectionChange);
            const selected = selectedIds?.has(item.id) || false;
            const contaLabel = getDespesaContaLabel(item, contas);
            const hasBaixaEstornada = isCancelado && Boolean(item.estornadoEm);
            const rowTone = selected ? 'bg-rose-50/70 ring-1 ring-inset ring-rose-200' : index % 2 === 0 ? 'bg-white' : 'bg-slate-50/80';

            return (
              <tr key={item.id} className={`border-b border-slate-200 align-top transition-colors last:border-b-0 hover:bg-blue-50/40 ${rowTone}`}>
                <td className="px-4 py-4"><div className="flex items-start gap-3">
                  {selectable && <input type="checkbox" checked={selected} onChange={() => toggleSelection(item)} className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-rose-600" aria-label={`Selecionar ${item.descricao}`} />}
                  <div className="min-w-0">
                    <p className="break-words text-sm font-black leading-5 text-[#001a33]">{item.descricao}</p>
                    <p className="mt-1 text-[10px] font-semibold leading-4 text-slate-500"><span className="font-black text-rose-600">{item.categoriaNome || 'Sem categoria'}</span>{' · '}{item.fornecedorNome || 'Fornecedor não informado'}</p>
                    <DespesaConvenioBadge item={item} />
                    {item.isRateioDerived && <p className="mt-1 text-[10px] font-bold text-indigo-600">Rateio da Matriz{item.poloMatrizNome ? ` · ${item.poloMatrizNome}` : ''}</p>}
                    {!item.isRateioDerived && item.rateioMode && item.rateioMode !== 'SEM_RATEIO' && <p className="mt-1 text-[10px] font-bold text-indigo-600">Custo rateado{item.rateioPolosQuantidade ? ` em ${item.rateioPolosQuantidade} polos` : ''}</p>}
                  </div>
                </div></td>
                <td className="px-4 py-4 text-xs font-semibold leading-5 text-slate-700">
                  <p><span className="block text-[9px] font-black uppercase tracking-wide text-slate-400">Lançamento</span>{formatDespesaDate(item.dataLancamento)}</p>
                  <p className="mt-1"><span className="block text-[9px] font-black uppercase tracking-wide text-slate-400">Vencimento</span>{formatDespesaDate(item.dataVencimento)}</p>
                  <p className="mt-1 text-[10px] font-bold text-slate-500">{item.totalParcelas > 1 ? `Parcela ${item.parcelaNumero}/${item.totalParcelas}` : 'Parcela única'}</p>
                </td>
                <td className="px-4 py-4 text-xs">
                  <p className="text-[9px] font-black uppercase tracking-wide text-slate-400">Previsto</p><p className="mt-0.5 text-sm font-black text-slate-900">{formatDespesaCurrency(item.valor)}</p>
                  {isPago && <p className="mt-1 font-bold text-emerald-700">Pago: {formatDespesaCurrency(item.valorPago ?? item.valor)}</p>}
                  {hasBaixaEstornada && <p className="mt-1 font-bold text-slate-500">Estornado: {formatDespesaCurrency(item.valorPago ?? item.valor)}</p>}
                  {(item.jurosValor > 0 || item.multaValor > 0 || item.descontoValor > 0) && <p className="mt-1 text-[9px] font-semibold text-slate-400">Base {formatDespesaCurrency(item.valorBase)}</p>}
                </td>
                <td className="px-4 py-4 text-[10px] font-semibold leading-5 text-slate-600">
                  {isPago ? <><p className="font-black text-slate-700">{contaLabel || 'Conta não localizada'}</p><p className="text-emerald-700">Pago em {formatDespesaDate(item.dataPagamento)}{item.formaPagamento ? ` · ${item.formaPagamento}` : ''}</p></>
                    : hasBaixaEstornada ? <><p className="font-black text-slate-600">Baixa estornada</p><p>{contaLabel || 'Conta preservada no histórico'}</p></>
                    : <><p className="font-black text-slate-600">Ainda não baixada</p><p>{item.turmaNome ? `Turma: ${item.turmaNome}` : item.observacao || 'Sem observação adicional'}</p></>}
                </td>
                <td className="px-4 py-4"><StatusBadge status={item.status} />
                  {item.isRateioDerived ? <p className="mt-2 text-[10px] font-bold text-slate-400">Somente informativa</p> : <div className="mt-2 grid grid-cols-2 gap-1.5">
                    {isAberto && onEditar && <button type="button" onClick={() => onEditar(item)} className={`${actionClass} border-blue-200 text-blue-700 hover:bg-blue-50 focus-visible:ring-blue-500`} aria-label={`Editar lançamento ${item.descricao}`}><Pencil size={13} /> Editar</button>}
                    {isAberto && onPagar && <button type="button" onClick={() => onPagar(item)} className={`${actionClass} border-emerald-200 text-emerald-700 hover:bg-emerald-50 focus-visible:ring-emerald-500`} aria-label={`Dar baixa em ${item.descricao}`}><CheckCircle2 size={13} /> Dar baixa</button>}
                    {!isCancelado && onImprimir && <button type="button" onClick={() => onImprimir(item)} className={`${actionClass} border-slate-200 text-slate-600 hover:bg-slate-100 focus-visible:ring-slate-500`} aria-label={`Abrir prévia de ${item.descricao}`}><Printer size={13} /> Prévia</button>}
                    {item.anexoPath && onAnexo && !isCancelado && <button type="button" onClick={() => onAnexo(item)} className={`${actionClass} border-violet-200 text-violet-700 hover:bg-violet-50 focus-visible:ring-violet-500`} aria-label={`Abrir anexo de ${item.descricao}`}><Paperclip size={13} /> Anexo</button>}
                    {isAberto && onExcluir ? <button type="button" onClick={() => onExcluir([item])} className={`${actionClass} border-rose-200 text-rose-700 hover:bg-rose-50 focus-visible:ring-rose-500`} aria-label={`Excluir ${item.descricao}`}><Trash2 size={13} /> Excluir</button>
                      : !isCancelado && onCancelar ? <button type="button" onClick={() => onCancelar(item)} className={`${actionClass} ${isPago ? 'border-rose-200 text-rose-700 hover:bg-rose-50 focus-visible:ring-rose-500' : 'border-slate-200 text-slate-600 hover:bg-slate-100 focus-visible:ring-slate-500'}`} aria-label={`${isPago ? 'Estornar e cancelar' : 'Cancelar'} ${item.descricao}`}>{isPago ? <RotateCcw size={13} /> : <XCircle size={13} />}{isPago ? 'Estornar' : 'Cancelar'}</button> : null}
                  </div>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default DespesaTable;
