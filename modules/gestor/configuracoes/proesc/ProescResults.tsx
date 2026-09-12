import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, ChevronDown, ChevronUp, GraduationCap, History, Loader2 } from 'lucide-react';
import { proescKeys, proescService } from './proesc.service';

const operationLabel: Record<string, string> = {
  IMPORTACAO_HISTORICO: 'Importação anterior', IMPORTACAO: 'Importação',
  CONSULTA: 'Consulta', SINCRONIZACAO: 'Atualização',
};
const statusLabel: Record<string, string> = {
  CONCLUIDO: 'Concluída', PARCIAL: 'Parcial', PENDENTE: 'Pendente',
  EM_ANDAMENTO: 'Em andamento', FALHOU: 'Não concluída', FALHA: 'Não concluída',
};
const sourceLabel: Record<string, string> = { LEGADO: 'Histórico anterior', PROESC_API: 'Proesc', PROESC: 'Proesc' };
const date = (value: string | null) => value ? new Date(value).toLocaleString('pt-BR') : 'Data não registrada';
const pageButton = 'min-h-10 rounded-xl border border-slate-200 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-wider text-slate-600 transition hover:border-blue-200 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40';
const statusTone = (status: string) => status === 'CONCLUIDO'
  ? 'bg-emerald-50 text-emerald-700'
  : ['FALHOU', 'FALHA'].includes(status) ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700';

const ClassEvents: React.FC<{ classId: string }> = ({ classId }) => {
  const [page, setPage] = useState(0);
  const events = useQuery({ queryKey: proescKeys.events(classId, page * 20),
    queryFn: () => proescService.events(classId, page * 20), retry: false, gcTime: 0 });
  return <div className="space-y-5 border-t border-slate-100 bg-slate-50/70 p-5 sm:p-6">
    {events.isLoading ? <p role="status" className="text-sm text-slate-500">Carregando registros…</p> : null}
    {events.isError ? <p role="alert" className="text-sm text-red-700">Não foi possível carregar o histórico. <button className="underline" onClick={() => void events.refetch()}>Tentar novamente</button></p> : null}
    {events.data?.events.map((event) => <article key={event.id} className="border-l-2 border-blue-200 pl-4">
      <div className="flex flex-wrap items-center gap-2 text-sm"><h4 className="font-bold text-[#001a33]">{operationLabel[event.operation] || 'Registro'}</h4>
        <span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-wider ${statusTone(event.status)}`}>{statusLabel[event.status] || 'Registrado'}</span></div>
      <p className="mt-2 break-words text-xs font-semibold leading-relaxed text-slate-600">{event.summary}</p>
      <p className="mt-2 text-[10px] font-semibold leading-relaxed text-slate-400">{sourceLabel[event.source] || 'Origem registrada'} · {event.records} registros · {date(event.occurredAt)}</p>
    </article>)}
    {!events.isLoading && !events.isError && !events.data?.events.length ? <p className="text-sm text-slate-500">Nenhum evento registrado para esta turma.</p> : null}
    {(page > 0 || (events.data?.totalEvents || 0) > 20) ? <div className="flex items-center gap-3"><button className={pageButton} disabled={!page || events.isFetching} onClick={() => setPage((value) => value - 1)}>Anterior</button><span className="text-sm">Página {page + 1}</span><button className={pageButton} disabled={events.isFetching || (page + 1) * 20 >= (events.data?.totalEvents || 0)} onClick={() => setPage((value) => value + 1)}>Próxima</button></div> : null}
  </div>;
};

export default function ProescClassHistory() {
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const classes = useQuery({ queryKey: proescKeys.classes(page * 20),
    queryFn: () => proescService.classes(page * 20), retry: false, gcTime: 0 });
  return <section className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-4 rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-start gap-3"><div className="rounded-xl bg-blue-50 p-3 text-blue-600"><History size={20} /></div>
        <div><h3 className="text-lg font-black uppercase tracking-tight text-[#001a33]">Histórico por turma</h3>
          <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">Acompanhe os registros de importação e atualização das turmas.</p></div></div>
      {classes.data && !classes.isError ? <span className="rounded-full bg-slate-50 px-3 py-2 text-[9px] font-black uppercase tracking-wider text-slate-500">{classes.data.totalClasses} {classes.data.totalClasses === 1 ? 'turma registrada' : 'turmas registradas'}</span> : null}
    </div>
    {classes.isLoading ? <p role="status" className="flex items-center gap-2 py-6 text-sm text-slate-500"><Loader2 size={18} className="animate-spin" />Carregando histórico…</p> : null}
    {classes.isError ? <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">Não foi possível carregar as turmas. <button className="underline" onClick={() => void classes.refetch()}>Tentar novamente</button></p> : null}
    {!classes.isLoading && !classes.isError && !classes.data?.classes.length ? <div className="rounded-[2rem] border border-dashed border-slate-200 bg-white p-10 text-center sm:p-14">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-50 text-slate-400"><History size={26} /></div><p className="font-black text-[#001a33]">Nenhum histórico registrado</p>
      <p className="mx-auto mt-2 max-w-md text-xs font-semibold leading-relaxed text-slate-500">As importações e atualizações registradas aparecerão aqui, agrupadas por turma.</p>
    </div> : null}
    {classes.data?.classes.map((turma) => <div key={turma.classId} className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition ${expanded === turma.classId ? 'border-blue-200' : 'border-slate-100'}`}>
      <button type="button" aria-expanded={expanded === turma.classId} aria-controls={`proesc-history-${turma.classId}`} onClick={() => setExpanded((value) => value === turma.classId ? null : turma.classId)} className="flex w-full items-start gap-3 p-5 text-left transition hover:bg-blue-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 sm:items-center sm:gap-4 sm:p-6">
        <div className="shrink-0 rounded-xl bg-blue-50 p-3 text-blue-600"><GraduationCap size={22} /></div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><span className="rounded-md bg-slate-100 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-slate-500">{turma.classCode}</span>
            <span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-wider ${statusTone(turma.status)}`}>{statusLabel[turma.status] || 'Registrado'}</span></div>
          <p className="mt-2 break-words text-sm font-black text-[#001a33]">{turma.className}</p>
          <p className="mt-1 text-xs font-semibold text-slate-500">{operationLabel[turma.operation] || 'Registro'} · {turma.eventsCount} {turma.eventsCount === 1 ? 'registro' : 'registros'} no histórico</p>
          <p className="mt-2 flex items-center gap-1.5 text-[10px] font-semibold leading-relaxed text-slate-400"><CalendarClock size={12} className="shrink-0" />{date(turma.lastEventAt)}</p>
        </div>
        {expanded === turma.classId ? <ChevronUp size={18} className="shrink-0 text-blue-600" /> : <ChevronDown size={18} className="shrink-0 text-slate-400" />}
      </button>
      {expanded === turma.classId ? <div id={`proesc-history-${turma.classId}`}><ClassEvents key={turma.classId} classId={turma.classId} /></div> : null}
    </div>)}
    {(page > 0 || (classes.data?.totalClasses || 0) > 20) ? <div className="flex items-center gap-3"><button className={pageButton} disabled={!page || classes.isFetching} onClick={() => { setExpanded(null); setPage((value) => value - 1); }}>Anterior</button><span className="text-sm">Página {page + 1}</span><button className={pageButton} disabled={classes.isFetching || (page + 1) * 20 >= (classes.data?.totalClasses || 0)} onClick={() => { setExpanded(null); setPage((value) => value + 1); }}>Próxima</button></div> : null}
  </section>;
}
