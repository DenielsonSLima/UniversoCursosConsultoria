import React from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Layers,
  Paperclip,
  Pencil,
  Printer,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import { ContaBancaria } from '../../financeiro.service';
import { DespesaLancamento } from '../despesas.service';
import {
  formatDespesaCurrency,
  formatDespesaDate,
  getDespesaContaLabel,
} from './despesaPresentation';

const statusConfig: Record<string, { label: string; bg: string; text: string; border: string; Icon: React.ElementType }> = {
  PAGO: { label: 'Pago', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', Icon: CheckCircle2 },
  PENDENTE: { label: 'Pendente', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', Icon: Clock },
  VENCIDO: { label: 'Vencido', bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', Icon: AlertCircle },
  CANCELADO: { label: 'Cancelado', bg: 'bg-slate-50', text: 'text-slate-500', border: 'border-slate-200', Icon: XCircle },
};

interface DespesaCardProps {
  item: DespesaLancamento;
  contas: ContaBancaria[];
  onPagar?: (item: DespesaLancamento) => void;
  onEditar?: (item: DespesaLancamento) => void;
  onCancelar?: (item: DespesaLancamento) => void;
  onImprimir?: (item: DespesaLancamento) => void;
  onAnexo?: (item: DespesaLancamento) => void;
}

const actionClass = 'inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1';

const DespesaCard: React.FC<DespesaCardProps> = ({
  item,
  contas,
  onPagar,
  onEditar,
  onCancelar,
  onImprimir,
  onAnexo,
}) => {
  const cfg = statusConfig[item.status] || statusConfig.PENDENTE;
  const isPago = item.status === 'PAGO';
  const isCancelado = item.status === 'CANCELADO';
  const isAberto = item.status === 'PENDENTE' || item.status === 'VENCIDO';
  const hasBaixaEstornada = isCancelado && Boolean(item.estornadoEm);
  const contaLabel = getDespesaContaLabel(item, contas);

  return (
    <article className={`relative overflow-hidden rounded-3xl border bg-white shadow-sm transition-shadow duration-300 hover:shadow-lg ${cfg.border}`}>
      <div className={`h-1 w-full ${isPago ? 'bg-emerald-500' : item.status === 'VENCIDO' ? 'bg-rose-500' : isCancelado ? 'bg-slate-300' : 'bg-amber-400'}`} />

      <div className="p-5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-black text-[#001a33]">{item.descricao}</p>
            {item.categoriaNome ? (
              <span className="mt-1 inline-block rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-600">
                {item.categoriaNome}
              </span>
            ) : (
              <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Sem categoria</p>
            )}
            {item.isRateioDerived ? (
              <p className="mt-1 text-[10px] font-bold text-indigo-600">
                Rateio da Matriz{item.poloMatrizNome ? ` · ${item.poloMatrizNome}` : ''}
              </p>
            ) : item.rateioMode && item.rateioMode !== 'SEM_RATEIO' ? (
              <p className="mt-1 text-[10px] font-bold text-indigo-600">
                Custo rateado{item.rateioPolosQuantidade ? ` em ${item.rateioPolosQuantidade} polo${item.rateioPolosQuantidade === 1 ? '' : 's'}` : ''}
              </p>
            ) : null}
          </div>
          <span className={`inline-flex flex-shrink-0 items-center gap-1 rounded-xl border px-2.5 py-1 text-[10px] font-bold uppercase ${cfg.bg} ${cfg.text} ${cfg.border}`}>
            <cfg.Icon size={10} />
            {cfg.label}
          </span>
        </div>

        <div className="mb-4 rounded-2xl bg-slate-50 px-4 py-3">
          <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Valor previsto</p>
          <p className={`mt-0.5 text-2xl font-black ${isPago ? 'text-emerald-600' : item.status === 'VENCIDO' ? 'text-rose-600' : 'text-[#001a33]'}`}>
            {formatDespesaCurrency(item.valor)}
          </p>
          {isPago && (
            <p className="mt-0.5 text-xs font-bold text-emerald-700">Valor pago: {formatDespesaCurrency(item.valorPago ?? item.valor)}</p>
          )}
          {hasBaixaEstornada && (
            <p className="mt-0.5 text-xs font-bold text-slate-500">Baixa estornada: {formatDespesaCurrency(item.valorPago ?? item.valor)}</p>
          )}
          {(item.jurosValor > 0 || item.multaValor > 0 || item.descontoValor > 0) && (
            <p className="mt-1 text-[10px] font-semibold text-slate-400">
              Base {formatDespesaCurrency(item.valorBase)}
              {item.jurosValor > 0 ? ` · Juros +${formatDespesaCurrency(item.jurosValor)}` : ''}
              {item.multaValor > 0 ? ` · Multa +${formatDespesaCurrency(item.multaValor)}` : ''}
              {item.descontoValor > 0 ? ` · Desconto −${formatDespesaCurrency(item.descontoValor)}` : ''}
            </p>
          )}
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
          <div>
            <dt className="text-[9px] font-black uppercase tracking-wider text-slate-400">Data de lançamento</dt>
            <dd className="mt-0.5 font-bold text-slate-700">{formatDespesaDate(item.dataLancamento)}</dd>
          </div>
          <div>
            <dt className="text-[9px] font-black uppercase tracking-wider text-slate-400">Vencimento</dt>
            <dd className="mt-0.5 font-bold text-slate-700">{formatDespesaDate(item.dataVencimento)}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-[9px] font-black uppercase tracking-wider text-slate-400">Fornecedor</dt>
            <dd className="mt-0.5 truncate font-semibold text-slate-700">{item.fornecedorNome || 'Fornecedor não informado'}</dd>
          </div>
          <div>
            <dt className="text-[9px] font-black uppercase tracking-wider text-slate-400">Parcela</dt>
            <dd className="mt-0.5 flex items-center gap-1 font-bold text-slate-700">
              <Layers size={11} className="text-slate-400" />
              {item.totalParcelas > 1 ? `${item.parcelaNumero}/${item.totalParcelas}` : 'Única (1/1)'}
            </dd>
          </div>
          {item.turmaNome && (
            <div>
              <dt className="text-[9px] font-black uppercase tracking-wider text-slate-400">Turma vinculada</dt>
              <dd className="mt-0.5 truncate font-bold text-indigo-600">{item.turmaNome}</dd>
            </div>
          )}
          {isPago && (
            <>
              <div>
                <dt className="text-[9px] font-black uppercase tracking-wider text-slate-400">Pagamento</dt>
                <dd className="mt-0.5 font-bold text-emerald-700">{formatDespesaDate(item.dataPagamento)}</dd>
              </div>
              <div>
                <dt className="text-[9px] font-black uppercase tracking-wider text-slate-400">Forma de pagamento</dt>
                <dd className="mt-0.5 font-bold text-emerald-700">{item.formaPagamento || 'Não informada'}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-[9px] font-black uppercase tracking-wider text-slate-400">Conta de saída</dt>
                <dd className="mt-0.5 font-semibold text-slate-700">{contaLabel || 'Conta não localizada'}</dd>
              </div>
            </>
          )}
          {hasBaixaEstornada && (
            <div className="col-span-2 rounded-xl bg-slate-50 px-3 py-2">
              <dt className="text-[9px] font-black uppercase tracking-wider text-slate-500">Baixa estornada</dt>
              <dd className="mt-0.5 font-semibold text-slate-600">
                {contaLabel ? `Conta original: ${contaLabel}` : 'Os dados da baixa foram preservados no histórico.'}
              </dd>
            </div>
          )}
        </dl>

        {item.observacao && (
          <p className="mt-3 border-t border-slate-100 pt-3 text-[10px] font-medium text-slate-400">{item.observacao}</p>
        )}

        {!item.isRateioDerived && !isCancelado && (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
            {isAberto && onEditar && (
              <button
                type="button"
                onClick={() => onEditar(item)}
                className={`${actionClass} border border-blue-200 text-blue-700 hover:bg-blue-50 focus-visible:ring-blue-500`}
                aria-label={`Editar lançamento ${item.descricao}`}
              >
                <Pencil size={13} /> Editar
              </button>
            )}
            {isAberto && onPagar && (
              <button
                type="button"
                onClick={() => onPagar(item)}
                className={`${actionClass} bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-500`}
                aria-label={`Dar baixa em ${item.descricao}`}
              >
                <CheckCircle2 size={13} /> Dar baixa
              </button>
            )}
            {onImprimir && (
              <button
                type="button"
                onClick={() => onImprimir(item)}
                className={`${actionClass} border border-slate-200 text-slate-600 hover:bg-slate-50 focus-visible:ring-slate-500`}
                aria-label={`${isPago ? 'Abrir prévia do recibo de' : 'Abrir prévia do lançamento'} ${item.descricao}`}
              >
                <Printer size={13} /> {isPago ? 'Prévia do recibo' : 'Prévia'}
              </button>
            )}
            {item.anexoPath && onAnexo && (
              <button
                type="button"
                onClick={() => onAnexo(item)}
                className={`${actionClass} border border-violet-200 text-violet-700 hover:bg-violet-50 focus-visible:ring-violet-500`}
                aria-label={`Abrir anexo de ${item.descricao}`}
              >
                <Paperclip size={13} /> Anexo
              </button>
            )}
            {onCancelar && (
              <button
                type="button"
                onClick={() => onCancelar(item)}
                className={`${actionClass} ${isPago ? 'border border-rose-200 text-rose-700 hover:bg-rose-50 focus-visible:ring-rose-500' : 'border border-slate-200 text-slate-600 hover:bg-slate-50 focus-visible:ring-slate-500'}`}
                aria-label={`${isPago ? 'Estornar e cancelar' : 'Cancelar'} ${item.descricao}`}
              >
                {isPago ? <RotateCcw size={13} /> : <XCircle size={13} />}
                {isPago ? 'Estornar e cancelar' : 'Cancelar'}
              </button>
            )}
          </div>
        )}
        {item.isRateioDerived && (
          <p className="mt-4 border-t border-slate-100 pt-3 text-[10px] font-bold text-slate-400">
            Linha econômica de rateio: a correção é feita no lançamento físico da Matriz.
          </p>
        )}
      </div>
    </article>
  );
};

export default DespesaCard;
