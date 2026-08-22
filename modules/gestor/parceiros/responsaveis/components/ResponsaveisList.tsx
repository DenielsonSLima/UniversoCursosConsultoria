import React from 'react';
import {
  CheckCircle2,
  ChevronDown,
  Loader2,
  RefreshCw,
  ShieldAlert,
  UserRound,
} from 'lucide-react';
import type { ResponsavelLegal } from '../responsaveis.contract';

interface ResponsaveisListProps {
  items: readonly ResponsavelLegal[];
  selectedId: string | null;
  isPending: boolean;
  isError: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onSelect: (responsavelId: string) => void;
  onRetry: () => void;
  onLoadMore: () => void;
}

const ResponsaveisList: React.FC<ResponsaveisListProps> = ({
  items,
  selectedId,
  isPending,
  isError,
  hasNextPage,
  isFetchingNextPage,
  onSelect,
  onRetry,
  onLoadMore,
}) => (
  <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
    <div className="border-b border-slate-100 px-5 py-4">
      <p className="text-sm font-black text-[#001a33]">Cadastros encontrados</p>
    </div>
    {isPending ? (
      <div className="flex min-h-52 items-center justify-center gap-3 text-sm font-bold text-slate-500">
        <Loader2 size={20} className="animate-spin text-blue-600" /> Carregando responsáveis…
      </div>
    ) : isError ? (
      <div className="p-5">
        <p className="text-sm font-black text-rose-700">Não foi possível carregar responsáveis.</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 inline-flex items-center gap-2 rounded-xl bg-rose-50 px-3 py-2 text-xs font-black text-rose-700"
        >
          <RefreshCw size={14} /> Tentar novamente
        </button>
      </div>
    ) : items.length === 0 ? (
      <div className="p-8 text-center">
        <UserRound className="mx-auto text-slate-400" size={25} />
        <p className="mt-3 text-sm font-black text-[#001a33]">Nenhum responsável encontrado</p>
        <p className="mt-1 text-xs font-medium text-slate-500">
          Cadastre um responsável para iniciar o vínculo com o aluno.
        </p>
      </div>
    ) : (
      <>
        <ul className="divide-y divide-slate-100">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onSelect(item.id)}
                className={`flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-slate-50 ${selectedId === item.id ? 'bg-blue-50/60' : ''}`}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-sm font-black text-slate-600">
                  {item.nome.slice(0, 2).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-black text-[#001a33]">{item.nome}</span>
                  <span className="mt-0.5 block truncate text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    {item.status} · {item.dependentesAtivos} dependente{item.dependentesAtivos === 1 ? '' : 's'} ativo{item.dependentesAtivos === 1 ? '' : 's'}
                  </span>
                </span>
                {item.eligible ? (
                  <CheckCircle2 size={18} className="shrink-0 text-emerald-600" aria-label="Acesso elegível" />
                ) : (
                  <ShieldAlert size={18} className="shrink-0 text-amber-500" aria-label="Acesso ainda não elegível" />
                )}
              </button>
            </li>
          ))}
        </ul>
        <div className="border-t border-slate-100 px-5 py-4">
          {hasNextPage ? (
            <button
              type="button"
              disabled={isFetchingNextPage}
              onClick={onLoadMore}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 text-[10px] font-black uppercase tracking-wide text-slate-600 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
            >
              {isFetchingNextPage
                ? <Loader2 className="animate-spin" size={15} />
                : <ChevronDown size={15} />}
              {isFetchingNextPage ? 'Carregando mais…' : 'Carregar mais'}
            </button>
          ) : (
            <p className="text-center text-[10px] font-bold uppercase tracking-wide text-slate-400">
              Fim da lista devolvida pelo serviço
            </p>
          )}
        </div>
      </>
    )}
  </div>
);

export default ResponsaveisList;
