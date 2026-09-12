import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, GraduationCap, History, Loader2 } from 'lucide-react';
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
const pageButton = 'rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:opacity-40';

const ClassEvents: React.FC<{ classId: string }> = ({ classId }) => {
  const [page, setPage] = useState(0);
  const events = useQuery({ queryKey: proescKeys.events(classId, page * 20),
    queryFn: () => proescService.events(classId, page * 20), retry: false, gcTime: 0 });
  return <div className="space-y-4 border-t border-slate-100 p-5">
    {events.isLoading ? <p role="status" className="text-sm text-slate-500">Carregando registros…</p> : null}
    {events.isError ? <p role="alert" className="text-sm text-red-700">Não foi possível carregar o histórico. <button className="underline" onClick={() => void events.refetch()}>Tentar novamente</button></p> : null}
    {events.data?.events.map((event) => <article key={event.id} className="border-l-2 border-cyan-200 pl-4">
      <div className="flex flex-wrap items-center gap-2 text-sm"><h4 className="font-bold text-[#001a33]">{operationLabel[event.operation] || 'Registro'}</h4>
        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">{statusLabel[event.status] || 'Registrado'}</span></div>
      <p className="mt-2 text-sm text-slate-600">{event.summary}</p>
      <p className="mt-2 text-xs text-slate-500">{sourceLabel[event.source] || 'Origem registrada'} · {event.records} registros · {date(event.occurredAt)}</p>
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
    <div><h3 className="text-lg font-bold text-[#001a33]">Histórico por turma</h3>
      <p className="mt-1 text-sm text-slate-500">Acompanhe os registros de importação e atualização das turmas.</p></div>
    {classes.isLoading ? <p role="status" className="flex items-center gap-2 py-6 text-sm text-slate-500"><Loader2 size={18} className="animate-spin" />Carregando histórico…</p> : null}
    {classes.isError ? <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">Não foi possível carregar as turmas. <button className="underline" onClick={() => void classes.refetch()}>Tentar novamente</button></p> : null}
    {!classes.isLoading && !classes.isError && !classes.data?.classes.length ? <div className="rounded-2xl border border-dashed border-slate-200 p-10 text-center">
      <History className="mx-auto mb-3 text-slate-400" size={28} /><p className="font-bold text-slate-600">Nenhum histórico registrado</p>
      <p className="mt-2 text-sm text-slate-500">As importações e atualizações registradas aparecerão aqui, agrupadas por turma.</p>
    </div> : null}
    {classes.data?.classes.map((turma) => <div key={turma.classId} className="overflow-hidden rounded-2xl border border-slate-200">
      <button type="button" aria-expanded={expanded === turma.classId} aria-controls={`proesc-history-${turma.classId}`} onClick={() => setExpanded((value) => value === turma.classId ? null : turma.classId)} className="flex w-full items-center gap-4 p-5 text-left hover:bg-slate-50">
        <div className="rounded-xl bg-cyan-50 p-3 text-cyan-700"><GraduationCap size={22} /></div>
        <div className="min-w-0 flex-1"><p className="break-words font-bold text-[#001a33]">{turma.className}</p>
          <p className="mt-1 text-xs text-slate-500">{turma.classCode} · {turma.eventsCount} {turma.eventsCount === 1 ? 'registro' : 'registros'} no histórico</p>
          <p className="mt-2 text-sm text-slate-600">{operationLabel[turma.operation] || 'Registro'} · {statusLabel[turma.status] || 'Registrado'}</p></div>
        {expanded === turma.classId ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>
      {expanded === turma.classId ? <div id={`proesc-history-${turma.classId}`}><ClassEvents key={turma.classId} classId={turma.classId} /></div> : null}
    </div>)}
    {(page > 0 || (classes.data?.totalClasses || 0) > 20) ? <div className="flex items-center gap-3"><button className={pageButton} disabled={!page || classes.isFetching} onClick={() => { setExpanded(null); setPage((value) => value - 1); }}>Anterior</button><span className="text-sm">Página {page + 1}</span><button className={pageButton} disabled={classes.isFetching || (page + 1) * 20 >= (classes.data?.totalClasses || 0)} onClick={() => { setExpanded(null); setPage((value) => value + 1); }}>Próxima</button></div> : null}
  </section>;
}
