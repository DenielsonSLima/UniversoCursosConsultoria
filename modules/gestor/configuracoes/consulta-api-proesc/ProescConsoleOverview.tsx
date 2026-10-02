import React from 'react';
import { Activity, Clock3, ShieldCheck } from 'lucide-react';
import type { ProescDashboard } from './consulta-api-proesc.types';

export const proescDateTime = (value?: string | null) => value
  ? new Date(value).toLocaleString('pt-BR', {
    timeZone: 'America/Maceio', dateStyle: 'short', timeStyle: 'short',
  })
  : 'Não registrado';

export const proescNumber = (
  value?: number | null,
  nullLabel = 'Não disponível por polo',
) => value == null
  ? nullLabel
  : value.toLocaleString('pt-BR');

export const ProescConsoleHeader = () => (
  <header className="rounded-[2rem] bg-[#001a33] p-6 text-white sm:p-8">
    <div className="flex items-center gap-3">
      <Activity size={26} className="shrink-0 text-cyan-300" />
      <h2 className="text-xl font-black uppercase tracking-tight sm:text-2xl">
        Consulta API Proesc
      </h2>
    </div>
    <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-300">
      Acompanhe a consulta automática, as observações das cobranças e as baixas registradas no sistema.
    </p>
    <span className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-2 text-xs font-bold">
      <ShieldCheck size={15} />
      Acompanhamento automático
    </span>
  </header>
);

export default function ProescConsoleOverview({ data }: { data: ProescDashboard }) {
  const v2Monitor = data.monitor.version === 'v2' ? data.monitor : null;
  const executionVersion = data.capabilities?.executionHistoryVersion?.toUpperCase() ?? 'V1';
  const cards = [
    ['Cobranças acompanhadas', data.totals.monitored, 'Vínculos do polo selecionado'],
    ['Cobranças habilitadas', data.totals.autoEnabled, 'Vínculos autorizados para acompanhamento automático'],
    ['Observações no período', data.totals.observations, 'Evidências financeiras registradas, incluindo o histórico anterior'],
    ['Baixas automáticas', data.totals.appliedAuto, 'Aplicadas pela automação no período'],
    ['Importações e correções', data.totals.appliedImport, 'Baixas com outras origens no período'],
    ['Observações em conferência', data.totals.review, 'Registros do período que precisam de conferência'],
    [`Execuções com falha — ${executionVersion}`, data.totals.failedRuns, `Histórico da ${executionVersion} no período; não mede falhas da V2`],
    [`Requisições HTTP — ${executionVersion}`, data.totals.httpRequests, `Histórico da ${executionVersion}; contagem HTTP da V2 ainda não disponível neste painel`],
  ] as const;

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 font-black text-[#001a33]">
            <Clock3 size={18} />
            Monitor atual da automação V2
          </h3>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${
            v2Monitor?.running
              ? 'bg-blue-100 text-blue-800'
              : v2Monitor?.enabled
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-slate-200 text-slate-600'
          }`}>
            {!v2Monitor ? 'Status V2 não informado' : v2Monitor.running
              ? 'V2 em execução'
              : v2Monitor.enabled ? 'Automação V2 ativa' : 'Automação V2 inativa'}
          </span>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          O monitor mostra a V2 e é compartilhado entre os polos. Os indicadores seguem o filtro selecionado.
          Execuções e requisições HTTP detalhadas permanecem como histórico da V1.
        </p>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-slate-500">Último início</dt>
            <dd className="mt-1 font-bold text-slate-700">{proescDateTime(v2Monitor?.lastStartedAt)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Última conclusão</dt>
            <dd className="mt-1 font-bold text-slate-700">{proescDateTime(v2Monitor?.lastFinishedAt)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Duração da última execução</dt>
            <dd className="mt-1 font-bold text-slate-700">
              {v2Monitor?.lastDurationMs == null
                ? 'Não registrada'
                : `${v2Monitor.lastDurationMs.toLocaleString('pt-BR')} ms`}
            </dd>
          </div>
        </dl>
        {v2Monitor && !data.configured && (
          <p className="mt-4 text-sm text-amber-800">
            A conexão Proesc V2 ainda não está configurada.
            O token é gerenciado no cartão Proesc das Configurações.
          </p>
        )}
      </section>
      <section aria-label="Indicadores Proesc" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value, description]) => (
          <article key={label} className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</h3>
            <p className={`mt-3 font-black text-[#001a33] ${value == null ? 'text-sm' : 'text-3xl'}`}>
              {proescNumber(value)}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">{description}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
