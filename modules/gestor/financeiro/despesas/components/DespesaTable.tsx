import React from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Paperclip,
  Pencil,
  Printer,
  RotateCcw,
  XCircle,
  Banknote,
} from 'lucide-react';
import { ContaBancaria } from '../../financeiro.service';
import { DespesaLancamento } from '../despesas.service';
import {
  formatDespesaCurrency,
  formatDespesaDate,
  getDespesaContaLabel,
} from './despesaPresentation';

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const configs: Record<string, { label: string; className: string; Icon: React.ElementType }> = {
    PAGO: { label: 'Pago', className: 'bg-emerald-50 text-emerald-700 border-emerald-200', Icon: CheckCircle2 },
    PENDENTE: { label: 'Pendente', className: 'bg-amber-50 text-amber-700 border-amber-200', Icon: Clock },
    VENCIDO: { label: 'Vencido', className: 'bg-rose-50 text-rose-700 border-rose-200', Icon: AlertCircle },
    CANCELADO: { label: 'Cancelado', className: 'bg-slate-100 text-slate-500 border-slate-200', Icon: XCircle },
  };
  const config = configs[status] || configs.PENDENTE;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border ${config.className}`}>
      <config.Icon size={10} />
      {config.label}
    </span>
  );
};

interface DespesaTableProps {
  items: DespesaLancamento[];
  contas: ContaBancaria[];
  onPagar?: (item: DespesaLancamento) => void;
  onEditar?: (item: DespesaLancamento) => void;
  onCancelar?: (item: DespesaLancamento) => void;
  onImprimir?: (item: DespesaLancamento) => void;
  onAnexo?: (item: DespesaLancamento) => void;
}

const actionClass = 'inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-black uppercase tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1';

const DespesaTable: React.FC<DespesaTableProps> = ({
  items,
  contas,
  onPagar,
  onEditar,
  onCancelar,
  onImprimir,
  onAnexo,
}) => {
  if (items.length === 0) {
    return (
      <div className="text-center py-16 text-slate-400">
        <Banknote size={48} className="mx-auto mb-4 opacity-30" />
        <p className="font-bold uppercase tracking-wider text-sm">Nenhum lançamento encontrado</p>
        <p className="text-xs mt-1">Ajuste os filtros ou crie um novo lançamento</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-100">
      <table className="min-w-[1480px] w-full text-left">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-100">
            <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400">Datas</th>
            <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400">Descrição</th>
            <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400">Categoria</th>
            <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400">Fornecedor</th>
            <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400 text-right">Valores</th>
            <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400">Pagamento</th>
            <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400">Parcela</th>
            <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400">Status</th>
            <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400 text-right">Ações</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((item) => {
            const isPago = item.status === 'PAGO';
            const isCancelado = item.status === 'CANCELADO';
            const isAberto = item.status === 'PENDENTE' || item.status === 'VENCIDO';
            const contaLabel = getDespesaContaLabel(item, contas);
            const hasBaixaEstornada = isCancelado && Boolean(item.estornadoEm);

            return (
              <tr key={item.id} className="align-top transition-colors hover:bg-slate-50/70">
                <td className="px-4 py-3 text-xs font-semibold text-slate-700 whitespace-nowrap leading-5">
                  <p><span className="font-black text-slate-400">Lançamento:</span> {formatDespesaDate(item.dataLancamento)}</p>
                  <p><span className="font-black text-slate-400">Vencimento:</span> {formatDespesaDate(item.dataVencimento)}</p>
                </td>
                <td className="px-4 py-3 text-sm text-slate-700 max-w-[230px]">
                  <div className="font-semibold truncate">{item.descricao}</div>
                  {item.isRateioDerived ? (
                    <div className="mt-0.5 text-[10px] font-bold text-indigo-600">
                      Rateio da Matriz{item.poloMatrizNome ? ` · ${item.poloMatrizNome}` : ''}
                    </div>
                  ) : item.rateioMode && item.rateioMode !== 'SEM_RATEIO' ? (
                    <div className="mt-0.5 text-[10px] font-bold text-indigo-600">
                      Custo rateado{item.rateioPolosQuantidade ? ` em ${item.rateioPolosQuantidade} polo${item.rateioPolosQuantidade === 1 ? '' : 's'}` : ''}
                    </div>
                  ) : null}
                  {item.turmaNome && (
                    <div className="text-[10px] text-indigo-600 font-bold mt-0.5">Turma: {item.turmaNome}</div>
                  )}
                  {item.observacao && (
                    <div className="text-[10px] text-slate-400 truncate mt-0.5">{item.observacao}</div>
                  )}
                </td>
                <td className="px-4 py-3 text-xs font-semibold text-slate-600">
                  {item.categoriaNome || 'Sem categoria'}
                </td>
                <td className="px-4 py-3 text-xs font-semibold text-slate-600">
                  {item.fornecedorNome || 'Fornecedor não informado'}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap text-xs">
                  <p className="font-black text-slate-800">Previsto: {formatDespesaCurrency(item.valor)}</p>
                  {isPago && (
                    <p className="mt-0.5 font-bold text-emerald-700">Valor pago: {formatDespesaCurrency(item.valorPago ?? item.valor)}</p>
                  )}
                  {hasBaixaEstornada && (
                    <p className="mt-0.5 font-bold text-slate-500">Baixa estornada: {formatDespesaCurrency(item.valorPago ?? item.valor)}</p>
                  )}
                  {(item.jurosValor > 0 || item.multaValor > 0 || item.descontoValor > 0) && (
                    <p className="mt-0.5 text-[9px] font-semibold text-slate-400">Base {formatDespesaCurrency(item.valorBase)}</p>
                  )}
                </td>
                <td className="px-4 py-3 text-[10px] font-semibold leading-5 text-slate-600 min-w-[205px]">
                  {isPago ? (
                    <>
                      <p><span className="font-black text-slate-400">Conta de saída:</span> {contaLabel || 'Conta não localizada'}</p>
                      <p className="text-emerald-700">Pago em {formatDespesaDate(item.dataPagamento)}{item.formaPagamento ? ` · ${item.formaPagamento}` : ''}</p>
                    </>
                  ) : hasBaixaEstornada ? (
                    <>
                      <p className="font-black text-slate-500">Baixa estornada</p>
                      <p>Histórico: {contaLabel || 'conta preservada no histórico'}</p>
                    </>
                  ) : (
                    <p className="text-slate-400">Ainda não baixada</p>
                  )}
                </td>
                <td className="px-4 py-3 text-center text-xs font-bold text-slate-600 whitespace-nowrap">
                  {item.totalParcelas > 1
                    ? `${item.parcelaNumero}/${item.totalParcelas}`
                    : 'Única (1/1)'}
                </td>
                <td className="px-4 py-3"><StatusBadge status={item.status} /></td>
                <td className="px-4 py-3">
                  {item.isRateioDerived ? (
                    <span className="text-[10px] font-bold text-slate-400">Somente informativa</span>
                  ) : (
                    <div className="flex flex-wrap items-center justify-end gap-1">
                      {isAberto && onEditar && (
                        <button
                          type="button"
                          onClick={() => onEditar(item)}
                          className={`${actionClass} text-blue-600 hover:bg-blue-50 focus-visible:ring-blue-500`}
                          title="Editar lançamento"
                          aria-label={`Editar lançamento ${item.descricao}`}
                        >
                          <Pencil size={14} /> <span className="hidden 2xl:inline">Editar</span>
                        </button>
                      )}
                      {isAberto && onPagar && (
                        <button
                          type="button"
                          onClick={() => onPagar(item)}
                          className={`${actionClass} text-emerald-700 hover:bg-emerald-50 focus-visible:ring-emerald-500`}
                          title="Dar baixa"
                          aria-label={`Dar baixa em ${item.descricao}`}
                        >
                          <CheckCircle2 size={14} /> <span className="hidden 2xl:inline">Dar baixa</span>
                        </button>
                      )}
                      {!isCancelado && onImprimir && (
                        <button
                          type="button"
                          onClick={() => onImprimir(item)}
                          className={`${actionClass} text-slate-600 hover:bg-slate-100 focus-visible:ring-slate-500`}
                          title={isPago ? 'Abrir prévia do recibo' : 'Abrir prévia do lançamento'}
                          aria-label={`${isPago ? 'Abrir prévia do recibo de' : 'Abrir prévia do lançamento'} ${item.descricao}`}
                        >
                          <Printer size={14} /> <span className="hidden 2xl:inline">Imprimir</span>
                        </button>
                      )}
                      {item.anexoPath && onAnexo && !isCancelado && (
                        <button
                          type="button"
                          onClick={() => onAnexo(item)}
                          className={`${actionClass} text-violet-600 hover:bg-violet-50 focus-visible:ring-violet-500`}
                          title={`Abrir anexo${item.anexoNome ? `: ${item.anexoNome}` : ''}`}
                          aria-label={`Abrir anexo de ${item.descricao}`}
                        >
                          <Paperclip size={14} /> <span className="hidden 2xl:inline">Anexo</span>
                        </button>
                      )}
                      {!isCancelado && onCancelar && (
                        <button
                          type="button"
                          onClick={() => onCancelar(item)}
                          className={`${actionClass} ${isPago ? 'text-rose-700 hover:bg-rose-50 focus-visible:ring-rose-500' : 'text-slate-600 hover:bg-slate-100 focus-visible:ring-slate-500'}`}
                          title={isPago ? 'Estornar e cancelar' : 'Cancelar lançamento'}
                          aria-label={`${isPago ? 'Estornar e cancelar' : 'Cancelar'} ${item.descricao}`}
                        >
                          {isPago ? <RotateCcw size={14} /> : <XCircle size={14} />}
                          <span className="hidden 2xl:inline">{isPago ? 'Estornar' : 'Cancelar'}</span>
                        </button>
                      )}
                    </div>
                  )}
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
