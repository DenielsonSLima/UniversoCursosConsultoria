import React from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { formatCaixaCanonicalCurrency, formatCaixaDate } from '../caixa.formatters';
import type { CaixaReviewPage } from './caixa-review-pending.contract';

interface Props {
  data?: CaixaReviewPage;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onPage: (page: number) => void;
}
const buttonClass = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:cursor-not-allowed disabled:opacity-40';
const Detail = ({ label, value }: { label: string; value: string | null }) => (
  <div className="min-w-0"><dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</dt>
    <dd className="mt-1 break-words text-sm font-semibold text-slate-800">{value ?? 'Não informado'}</dd></div>
);

export function CaixaReviewPendingPanel({ data, loading, error, onRetry, onPage }: Props) {
  if (error) return <div role="alert" className="m-4 rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-900 sm:m-6">
    <h3 className="font-extrabold">Não foi possível conferir este recorte</h3>
    <p className="mt-2 text-sm">{error}</p>
    <button type="button" className={`${buttonClass} mt-4 border-rose-300 bg-white`} onClick={onRetry}>Tentar novamente</button>
  </div>;
  if (loading || !data) return <div role="status" aria-live="polite" className="flex items-center gap-3 p-8 text-sm text-slate-600">
    <RefreshCw size={18} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />Carregando registros em conferência…
  </div>;
  return <div className="space-y-5 p-4 sm:p-6">
    <section aria-label="Resumo da conferência de dados" className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <div><p className="text-xs font-bold text-amber-900">Conferência de dados: {data.totalCount.toLocaleString('pt-BR')} registro(s) local(is)</p>
        <p className="mt-1 text-2xl font-black text-[#001a33]">{formatCaixaCanonicalCurrency(data.totalNominal)}</p>
        <p className="mt-1 text-xs text-amber-950">Valor nominal cadastrado, não incluído nos valores confirmados.</p></div>
    </section>
    <p className="flex items-start gap-2 text-xs leading-5 text-slate-600"><AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-600" aria-hidden="true" />
      Estes registros não comprovam cobrança em aberto nem inadimplência. Podem corresponder a divergências de importação, quitações ou cancelamentos ainda não conciliados.
      {' '}O recorte mensal pode estar contido na carteira geral; não some as duas listas.
      {' '}A lista é consultada ao abrir e acompanha automaticamente as atualizações financeiras recebidas pelo sistema, sem consulta direta ao Proesc.
    </p>
    {data.items.length === 0 ? <div role="status" className="rounded-2xl border border-dashed border-slate-300 p-8 text-center">
      <h3 className="font-bold text-slate-800">{data.totalCount === 0 ? 'Nenhum registro em conferência neste recorte' : 'Nenhum registro nesta página'}</h3>
      <p className="mt-2 text-sm text-slate-500">A posição pode ter sido atualizada desde a abertura do painel.</p>
    </div> : <ul className="space-y-3" aria-label="Registros locais em conferência">
      {data.items.map((item) => <li key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[1.4fr_1.5fr_1fr_1fr_1fr_1fr]">
          <Detail label="Aluno" value={item.alunoNome} />
          <Detail label="Turma" value={[item.turmaCodigo, item.turmaNome].filter(Boolean).join(' · ') || null} />
          <Detail label="Matrícula" value={item.matriculaCodigo} />
          <Detail label="Referência Proesc" value={item.proescRef} />
          <Detail label="Vencimento cadastrado" value={formatCaixaDate(item.vencimento)} />
          <Detail label="Valor nominal cadastrado" value={formatCaixaCanonicalCurrency(item.valorNominal)} />
        </dl>
        <div className="mt-4 border-t border-slate-100 pt-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-amber-800">Motivo da conferência</p>
          <ul className="mt-1 space-y-1 text-xs leading-5 text-slate-700">
            {item.motivos.map((reason, index) => <li key={`${reason.codigo}-${index}`}>{reason.descricao}</li>)}
          </ul>
          <p className="mt-2 text-[10px] text-slate-500">Fonte: {item.fonte ?? 'Não informada'}
            {item.observadoEm ? ` · Evidência em ${new Date(item.observadoEm).toLocaleString('pt-BR', { timeZone: 'America/Maceio' })}` : ''}</p>
        </div>
      </li>)}
    </ul>}
    <nav aria-label="Páginas de registros em conferência" className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
      <button type="button" aria-label="Página anterior de registros" disabled={data.page <= 1}
        onClick={() => onPage(data.page - 1)} className={`${buttonClass} border-slate-200 bg-white text-slate-700`}><ChevronLeft size={16} aria-hidden="true" />Anterior</button>
      <p role="status" className="text-xs text-slate-600">Página {data.page} de {data.totalPages} · {data.totalCount} registro(s) local(is)</p>
      <button type="button" aria-label="Próxima página de registros" disabled={data.page >= data.totalPages}
        onClick={() => onPage(data.page + 1)} className={`${buttonClass} border-slate-200 bg-white text-slate-700`}>Próxima<ChevronRight size={16} aria-hidden="true" /></button>
    </nav>
  </div>;
}
