import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { proescDateTime, proescNumber } from './ProescConsoleOverview';
import type {
  ProescConsoleError, ProescFeedContext, ProescFeedPage,
  ProescObservation, ProescRun, ProescSettlement,
} from './consulta-api-proesc.types';

const runLabels: Record<ProescRun['status'], string> = {
  RUNNING: 'Em execução', SUCCEEDED: 'Concluída', PARTIAL: 'Concluída com pendências',
  FAILED: 'Falhou', ABANDONED: 'Interrompida',
};
const sourceLabels: Record<string, string> = {
  PAID: 'Pagamento informado', OPEN: 'Em aberto na origem',
  UNKNOWN: 'Situação em conferência', CANCELED: 'Cancelamento informado',
};
const modeLabels: Record<ProescSettlement['mode'], string> = {
  AUTO: 'Automação', IMPORT: 'Importação', CORRECTION: 'Correção',
};
const headings: Record<ProescFeedContext, [string, string]> = {
  runs: ['Execuções', 'Lotes processados pela automação. Consultadas indica cobranças; HTTP indica requisições à API.'],
  observations: ['Consultas', 'Observações registradas por cobrança. Uma requisição à API pode consultar várias cobranças.'],
  settlements: ['Baixas', 'Pagamentos aplicados no sistema, com a origem da baixa identificada.'],
  errors: ['Erros', 'Falhas registradas nas execuções e requisições. Evidências em conferência aparecem na aba Consultas.'],
};
const money = (value?: number | null) => value == null
  ? 'Não informado'
  : value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const paymentDate = (value?: string | null) => value
  ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR')
  : 'Não informada';

function FinancialIdentity({ item }: {
  item: ProescObservation | ProescSettlement | ProescConsoleError;
}) {
  if (!item.studentName && !item.description && !item.externalKey) return null;
  return (
    <div className="mt-4 space-y-1 border-t border-slate-100 pt-4">
      {item.studentName && <p className="text-sm font-bold text-[#001a33]">{item.studentName}</p>}
      {item.description && <p className="break-words text-sm text-slate-600">{item.description}</p>}
      {item.externalKey && (
        <p className="break-all text-xs text-slate-500">Referência Proesc: {item.externalKey}</p>
      )}
    </div>
  );
}

function FinancialDetails({ item }: { item: ProescObservation | ProescSettlement }) {
  return (
    <dl className="mt-4 grid gap-3 border-t border-slate-100 pt-4 text-xs sm:grid-cols-3">
      <div>
        <dt className="text-slate-500">Valor principal</dt>
        <dd className="mt-1 font-bold text-slate-700">{money(item.principalAmount)}</dd>
      </div>
      <div>
        <dt className="text-slate-500">Valor recebido informado</dt>
        <dd className="mt-1 font-bold text-slate-700">{money(item.receivedAmount)}</dd>
      </div>
      <div>
        <dt className="text-slate-500">Data do pagamento</dt>
        <dd className="mt-1 font-bold text-slate-700">{paymentDate(item.paymentDate)}</dd>
      </div>
    </dl>
  );
}

const RunRow: React.FC<{ item: ProescRun }> = ({ item }) => {
  const nullLabel = item.metricsScope === 'POLO_ITEMS_SHARED_EXECUTION'
    ? 'Não disponível por polo'
    : 'Não registrado';
  const counters = [
    ['Consultadas', item.consulted], ['Baixas aplicadas', item.applied],
    ['Sem alteração', item.unchanged], ['Em conferência', item.review],
    ['Falhas', item.failed], ['Requisições HTTP', item.httpRequests],
    ['Falhas HTTP', item.httpFailed],
  ] as const;
  return (
    <article className="rounded-2xl border border-slate-200 p-5">
      <div className="flex flex-wrap justify-between gap-2">
        <strong className="text-sm text-[#001a33]">{proescDateTime(item.startedAt)}</strong>
        <span className="text-xs font-bold text-slate-600">{runLabels[item.status] || item.status}</span>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-4 text-xs sm:grid-cols-4">
        {counters.map(([label, value]) => (
          <div key={label}>
            <dt className="text-slate-500">{label}</dt>
            <dd className="mt-1 font-bold text-slate-800">{proescNumber(value, nullLabel)}</dd>
          </div>
        ))}
        <div>
          <dt className="text-slate-500">Duração</dt>
          <dd className="mt-1 font-bold text-slate-800">
            {item.durationMs == null ? 'Em andamento' : `${item.durationMs.toLocaleString('pt-BR')} ms`}
          </dd>
        </div>
      </dl>
      {!item.telemetryComplete && (
        <p className="mt-3 text-xs text-amber-800">Registro operacional incompleto para esta execução.</p>
      )}
      {item.errorMessage && (
        <p className="mt-3 break-words text-sm text-rose-700">{item.errorCode}: {item.errorMessage}</p>
      )}
    </article>
  );
};

const ErrorRow: React.FC<{
  item: ProescConsoleError;
  canViewReceivableDetails: boolean;
}> = ({ item, canViewReceivableDetails }) => (
  <article className="rounded-2xl border border-rose-100 bg-rose-50/40 p-5">
    <div className="flex flex-wrap justify-between gap-2 text-xs">
      <strong className="text-rose-800">{item.errorCode}</strong>
      <span className="text-slate-500">{proescDateTime(item.recordedAt)}</span>
    </div>
    <p className="mt-3 break-words text-sm text-slate-700">{item.errorMessage}</p>
    {canViewReceivableDetails && <FinancialIdentity item={item} />}
    <p className="mt-3 text-xs text-slate-500">
      Etapa: {item.stage}
      {item.httpStatus != null ? ` · HTTP ${item.httpStatus}` : ''}
      {item.classCode ? ` · ${item.classCode}` : ''}
      {item.poloName ? ` · ${item.poloName}` : ''}
    </p>
  </article>
);

const ObligationRow: React.FC<{
  item: ProescObservation | ProescSettlement;
  isObservation: boolean;
  canViewReceivableDetails: boolean;
}> = ({ item, isObservation, canViewReceivableDetails }) => {
  const observation = isObservation ? item as ProescObservation : null;
  return (
    <article className="rounded-2xl border border-slate-200 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="font-bold text-[#001a33]">{item.classCode || 'Turma vinculada'}</h4>
          <p className="mt-1 text-xs text-slate-500">{item.poloName}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${
          observation?.verification === 'REVIEW'
            ? 'bg-amber-50 text-amber-800'
            : 'bg-blue-50 text-blue-800'
        }`}>
          {observation
            ? observation.verification === 'REVIEW' ? 'Em conferência' : 'Evidência verificada'
            : `Baixa por ${modeLabels[(item as ProescSettlement).mode] || (item as ProescSettlement).mode}`}
        </span>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        {observation
          ? `Observação: ${proescDateTime(observation.observedAt)}`
          : `Registro: ${proescDateTime(item.recordedAt)}`}
      </p>
      {observation && (
        <p className="mt-2 text-sm text-slate-700">
          {sourceLabels[observation.sourceStatus] || observation.sourceStatus}
        </p>
      )}
      {observation?.reviewReasons.length ? (
        <p className="mt-2 break-words text-xs text-amber-800">
          Motivos: {observation.reviewReasons.join(' · ')}
        </p>
      ) : null}
      {canViewReceivableDetails && (
        <>
          <FinancialIdentity item={item} />
          <FinancialDetails item={item} />
        </>
      )}
    </article>
  );
};

interface Props {
  context: ProescFeedContext;
  data?: ProescFeedPage;
  loading: boolean;
  error?: string | null;
  canViewReceivableDetails: boolean;
  onPageChange: (page: number) => void;
  onRetry?: () => void;
}

export default function ProescOperationsFeed({
  context, data, loading, error, canViewReceivableDetails, onPageChange, onRetry,
}: Props) {
  return (
    <section className="space-y-4" aria-busy={loading}>
      <div>
        <h3 className="text-lg font-black text-[#001a33]">{headings[context][0]}</h3>
        <p className="mt-1 text-sm leading-relaxed text-slate-500">{headings[context][1]}</p>
      </div>
      {error ? (
        <div role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">
          <p>{error}</p>
          {onRetry && (
            <button
              type="button"
              disabled={loading}
              onClick={onRetry}
              className="mt-3 min-h-11 rounded-xl border border-rose-200 px-4 font-bold disabled:opacity-40"
            >
              Tentar carregar registros novamente
            </button>
          )}
        </div>
      ) : loading && !data ? (
        <p role="status" className="p-6 text-sm text-slate-500">Carregando registros…</p>
      ) : data?.items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
          Nenhum registro neste período e polo.
        </p>
      ) : data?.items.map((row) => {
        if (context === 'runs') return <RunRow key={row.id} item={row as ProescRun} />;
        if (context === 'errors') {
          return (
            <ErrorRow
              key={row.id}
              item={row as ProescConsoleError}
              canViewReceivableDetails={canViewReceivableDetails}
            />
          );
        }
        return (
          <ObligationRow
            key={row.id}
            item={row as ProescObservation | ProescSettlement}
            isObservation={context === 'observations'}
            canViewReceivableDetails={canViewReceivableDetails}
          />
        );
      })}
      {!canViewReceivableDetails && (context === 'observations' || context === 'settlements') && (
        <p className="text-xs text-slate-500">
          Valores e detalhes das cobranças dependem da permissão Financeiro / Receber.
        </p>
      )}
      {data && !error && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 text-xs text-slate-500">
          <p>{data.totalCount.toLocaleString('pt-BR')} registro(s) · Página {data.page} de {data.totalPages}</p>
          <div className="flex gap-2">
            <button
              type="button"
              aria-label="Página anterior"
              disabled={loading || data.page <= 1}
              onClick={() => onPageChange(data.page - 1)}
              className="min-h-11 rounded-xl border border-slate-200 px-4 disabled:opacity-40"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              aria-label="Próxima página"
              disabled={loading || data.page >= data.totalPages}
              onClick={() => onPageChange(data.page + 1)}
              className="min-h-11 rounded-xl border border-slate-200 px-4 disabled:opacity-40"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
