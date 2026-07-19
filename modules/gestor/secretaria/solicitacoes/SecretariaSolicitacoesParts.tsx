import React from 'react';
import {
  ArrowDown,
  ArrowUp,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Clock,
  MessageSquare,
  XCircle,
} from 'lucide-react';
import type { Solicitacao } from '../secretaria.service';

export const SOLICITACOES_PAGE_SIZE = 8;

export const SolicitacoesPagination: React.FC<{
  page: number;
  total: number;
  onPage: (page: number) => void;
}> = ({ page, total, onPage }) => {
  const pages = Math.ceil(total / SOLICITACOES_PAGE_SIZE);
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/30 px-6 py-3">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
        Página {page} de {pages} · {total} registros
      </span>
      <div className="flex items-center gap-1">
        <button onClick={() => onPage(1)} disabled={page === 1} className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-200 disabled:opacity-30"><ChevronsLeft size={13} /></button>
        <button onClick={() => onPage(page - 1)} disabled={page === 1} className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-200 disabled:opacity-30"><ChevronLeft size={13} /></button>
        {Array.from({ length: Math.min(5, pages) }, (_, index) => {
          const start = Math.max(1, Math.min(page - 2, pages - 4));
          const pageNumber = start + index;
          if (pageNumber > pages) return null;
          return (
            <button
              key={pageNumber}
              onClick={() => onPage(pageNumber)}
              className={`h-7 w-7 rounded-lg text-[10px] font-black transition-colors ${pageNumber === page ? 'bg-[#001a33] text-white' : 'text-slate-600 hover:bg-slate-200'}`}
            >
              {pageNumber}
            </button>
          );
        })}
        <button onClick={() => onPage(page + 1)} disabled={page === pages} className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-200 disabled:opacity-30"><ChevronRight size={13} /></button>
        <button onClick={() => onPage(pages)} disabled={page === pages} className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-200 disabled:opacity-30"><ChevronsRight size={13} /></button>
      </div>
    </div>
  );
};

export const SolicitacaoStatusBadge: React.FC<{ status: Solicitacao['status'] }> = ({ status }) => {
  const styles = {
    Pendente: { className: 'border-amber-100 bg-amber-50 text-amber-600', icon: <Clock size={11} /> },
    Deferido: { className: 'border-emerald-100 bg-emerald-50 text-emerald-600', icon: <CheckCircle size={11} /> },
    Indeferido: { className: 'border-rose-100 bg-rose-50 text-rose-600', icon: <XCircle size={11} /> },
  };
  const style = styles[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-wider ${style.className}`}>
      {style.icon} {status}
    </span>
  );
};

export const SolicitacoesTableHead: React.FC<{
  withAction?: boolean;
  sort: 'asc' | 'desc';
  onSort: () => void;
}> = ({ withAction = true, sort, onSort }) => (
  <thead>
    <tr className="border-b border-slate-100 bg-slate-50 text-[9px] font-black uppercase tracking-wider text-slate-400">
      <th className="px-5 py-3">Estudante / Curso</th>
      <th className="px-5 py-3">Matrícula</th>
      <th className="px-5 py-3">
        <button onClick={onSort} className="flex items-center gap-1 transition-colors hover:text-slate-700">
          Solicitação / Data
          {sort === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
        </button>
      </th>
      <th className="px-5 py-3">Prazo</th>
      <th className="px-5 py-3">Status</th>
      {withAction && <th className="px-5 py-3 text-right">Ação</th>}
    </tr>
  </thead>
);

export const SolicitacoesTableRow: React.FC<{
  item: Solicitacao;
  showAction?: boolean;
  onSelect: (item: Solicitacao) => void;
}> = ({ item, showAction = true, onSelect }) => (
  <tr className="group transition-colors hover:bg-slate-50/50">
    <td className="px-5 py-3.5">
      <span className="block text-xs font-bold leading-tight text-[#001a33]">{item.alunoNome}</span>
      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{item.curso}</span>
    </td>
    <td className="px-5 py-3.5 font-mono text-[11px] font-bold text-slate-500">{item.alunoMatricula}</td>
    <td className="px-5 py-3.5">
      <span className="block text-xs font-bold text-slate-800">{item.tipo}</span>
      <span className="text-[10px] font-bold text-slate-400">{item.dataSolicitacao.split('-').reverse().join('/')}</span>
    </td>
    <td className="px-5 py-3.5">
      <span className={`inline-block rounded px-2 py-0.5 text-[9px] font-black uppercase ${item.tipo === 'Transferência' ? 'border border-orange-100 bg-orange-50 text-orange-600' : 'border border-blue-100 bg-blue-50 text-blue-600'}`}>
        {item.prazo}
      </span>
    </td>
    <td className="px-5 py-3.5"><SolicitacaoStatusBadge status={item.status} /></td>
    {showAction && (
      <td className="px-5 py-3.5 text-right">
        {item.status === 'Pendente' ? (
          <button onClick={() => onSelect(item)} className="rounded-lg bg-[#001a33] px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white transition-colors hover:bg-blue-600">Analisar</button>
        ) : (
          <button onClick={() => onSelect(item)} className="rounded-lg bg-slate-100 p-2 text-slate-600 transition-colors hover:bg-slate-200" title="Ver Resposta"><MessageSquare size={14} /></button>
        )}
      </td>
    )}
  </tr>
);
