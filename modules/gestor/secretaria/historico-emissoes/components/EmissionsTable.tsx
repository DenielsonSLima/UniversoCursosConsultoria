import React from 'react';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Loader2,
  Printer,
} from 'lucide-react';
import { DOCUMENT_TABS } from '../historico-emissoes.constants';
import type { EmissionLog } from '../historico-emissoes.types';

interface Props {
  emissions: EmissionLog[];
  loading: boolean;
  page: number;
  pagesCount: number;
  totalRecords: number;
  systemUsers: Record<string, string>;
  onPageChange: (page: number) => void;
  onOpenPreview: (emission: EmissionLog) => void;
}

const EmissionsTable: React.FC<Props> = ({
  emissions,
  loading,
  page,
  pagesCount,
  totalRecords,
  systemUsers,
  onPageChange,
  onOpenPreview,
}) => (
  <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1180px] table-fixed border-collapse text-left">
        <colgroup>
          <col className="w-[16%]" /><col className="w-[17%]" /><col className="w-[16%]" />
          <col className="w-[13%]" /><col className="w-[14%]" /><col className="w-[8%]" />
          <col className="w-[16%]" />
        </colgroup>
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50 text-[9px] font-black uppercase tracking-wider text-slate-400">
            <th className="px-5 py-3.5">Data / Tipo</th><th className="px-5 py-3.5">Estudante / CPF</th>
            <th className="px-5 py-3.5">Cód. Validador</th><th className="px-5 py-3.5">Validade</th>
            <th className="px-5 py-3.5">Emitido por</th><th className="px-5 py-3.5 text-center">Emissões</th>
            <th className="px-5 py-3.5 text-right">Ação</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50 font-medium text-slate-700">
          {loading ? (
            <tr><td colSpan={7} className="px-5 py-16 text-center">
              <Loader2 className="mx-auto animate-spin text-blue-600" size={32} />
              <span className="mt-2 block text-[10px] font-bold uppercase tracking-widest text-slate-400">Carregando logs do histórico...</span>
            </td></tr>
          ) : emissions.length === 0 ? (
            <tr><td colSpan={7} className="px-5 py-14 text-center text-[10px] font-bold uppercase text-slate-400">
              Nenhuma emissão registrada com os filtros selecionados.
            </td></tr>
          ) : emissions.map((item) => {
            const operatorName = item.emitido_por
              ? systemUsers[item.emitido_por] || 'Operador do Sistema'
              : 'Aluno (Auto-emissão)';
            const docLabel = DOCUMENT_TABS.find((tab) => tab.key === item.documento)?.label
              || item.documento.replace('_', ' ');
            const validityDate = item.validade_ate ? new Date(item.validade_ate) : null;
            const expired = validityDate ? validityDate.getTime() < Date.now() : false;
            return (
              <tr key={item.id} className="group transition-colors hover:bg-slate-50/50">
                <td className="px-5 py-4"><span className="block text-xs font-bold leading-none text-[#001a33]">{docLabel}</span>
                  <span className="mt-1 block text-[10px] font-bold leading-none text-slate-400">{new Date(item.emitido_em).toLocaleString('pt-BR')}</span></td>
                <td className="px-5 py-4"><span className="block text-xs font-bold leading-tight text-slate-800">{item.dados_emissao?.studentName || item.aluno?.nome || 'NÃO IDENTIFICADO'}</span>
                  <span className="mt-0.5 block text-[10px] font-bold leading-none text-slate-400">CPF: {item.dados_emissao?.studentCpf || item.aluno?.cpf_cnpj || '---'}</span></td>
                <td className="px-5 py-4"><span className="block truncate font-mono text-[11px] font-black text-blue-600" title={item.codigo}>{item.codigo}</span></td>
                <td className="px-5 py-4">{validityDate ? <div className="flex flex-col items-start gap-1">
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] font-black text-slate-700"><Calendar size={12} className={expired ? 'text-rose-500' : 'text-emerald-500'} />{validityDate.toLocaleDateString('pt-BR')}</span>
                  <span className={`rounded-md px-2 py-0.5 text-[8px] font-black uppercase tracking-wider ${expired ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>{expired ? 'Expirado' : 'Vigente'}</span>
                </div> : <span className="inline-flex whitespace-nowrap rounded-md bg-slate-100 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-slate-400">Sem validade</span>}</td>
                <td className="px-5 py-4"><span className="block truncate text-xs font-semibold text-slate-500" title={operatorName}>{operatorName}</span></td>
                <td className="px-5 py-4 text-center"><span className="inline-block rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-700">{item.quantidade_emissoes}x</span></td>
                <td className="whitespace-nowrap px-5 py-4 text-right"><button onClick={() => onOpenPreview(item)} className="inline-flex items-center gap-1.5 rounded-lg bg-[#001a33] px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white transition-colors hover:bg-blue-600"><Printer size={12} />Visualizar / 2ª Via</button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    {pagesCount > 1 && (
      <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/30 px-6 py-4">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Página {page} de {pagesCount} · {totalRecords} registros</span>
        <div className="flex items-center gap-1">
          <PageButton disabled={page === 1} onClick={() => onPageChange(1)}><ChevronsLeft size={13} /></PageButton>
          <PageButton disabled={page === 1} onClick={() => onPageChange(page - 1)}><ChevronLeft size={13} /></PageButton>
          {Array.from({ length: Math.min(5, pagesCount) }, (_, index) => {
            const start = Math.max(1, Math.min(page - 2, pagesCount - 4));
            const target = start + index;
            if (target > pagesCount) return null;
            return <button key={target} onClick={() => onPageChange(target)} className={`h-7 w-7 rounded-lg text-[10px] font-black transition-colors ${target === page ? 'bg-[#001a33] text-white' : 'text-slate-600 hover:bg-slate-200'}`}>{target}</button>;
          })}
          <PageButton disabled={page === pagesCount} onClick={() => onPageChange(page + 1)}><ChevronRight size={13} /></PageButton>
          <PageButton disabled={page === pagesCount} onClick={() => onPageChange(pagesCount)}><ChevronsRight size={13} /></PageButton>
        </div>
      </div>
    )}
  </div>
);

const PageButton: React.FC<React.PropsWithChildren<{ disabled: boolean; onClick: () => void }>> = ({ disabled, onClick, children }) => (
  <button onClick={onClick} disabled={disabled} className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-200 disabled:opacity-30">{children}</button>
);

export default EmissionsTable;
