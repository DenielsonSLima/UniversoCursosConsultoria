import type { BaneseAttemptsContext } from './banese-attempt-feed';
import type { BanesePollingAttempt } from './consulta-api-banese.types';

interface BaneseAttemptsTableProps {
  attempts: BanesePollingAttempt[];
  context: BaneseAttemptsContext;
  canViewReceivableDetails: boolean;
}

const contextCopy: Record<BaneseAttemptsContext, string> = {
  queries: 'Consultas recentes, uma por boleto. O resultado da tentativa fica separado da situação atual do título.',
  settlements: 'Baixas confirmadas pela API, uma por título. Elas não somem quando novas consultas entram no histórico.',
  errors: 'Erros recentes em lista própria. Um erro continua visível mesmo quando o título aparece atualmente como pago.',
};

const dateTime = (value?: string | null) => value
  ? new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium',
    timeZone: 'America/Maceio',
  }).format(new Date(value))
  : 'Não registrado';

const civilDate = (value?: string | null) => {
  if (!value) return 'não informado';
  const [year, month, day] = value.slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
};

const money = (value?: number | null) => value === null || value === undefined
  ? 'não informado'
  : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const duration = (milliseconds?: number | null) => {
  if (milliseconds === null || milliseconds === undefined) return '—';
  if (milliseconds < 1000) return `${milliseconds} ms`;
  return `${(milliseconds / 1000).toFixed(1)} s`;
};

const statusLabel = (status?: string | null) => {
  const normalized = String(status || '').toUpperCase();
  return ({
    PAID: 'Pago',
    PAGO: 'Pago',
    PENDING: 'Pendente',
    PENDENTE: 'Pendente',
    ERROR: 'Erro',
    THROTTLED: 'Limite da API',
    VENCIDO: 'Vencido',
  } as Record<string, string>)[normalized] || normalized || 'Não informado';
};

const statusTone = (status?: string | null) => {
  const normalized = String(status || '').toUpperCase();
  if (['SUCCESS', 'PAID', 'PAGO', 'STABLE'].includes(normalized)) {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }
  if (['FAILED', 'ERROR', 'SUSPENDED', 'THROTTLED', 'VENCIDO'].includes(normalized)) {
    return 'border-red-200 bg-red-50 text-red-700';
  }
  return 'border-amber-200 bg-amber-50 text-amber-700';
};

const StatusPill = ({ value }: { value?: string | null }) => (
  <span className={`inline-flex rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-wider ${statusTone(value)}`}>
    {statusLabel(value)}
  </span>
);

const AttemptIdentity = ({ attempt }: { attempt: BanesePollingAttempt }) => (
  <div className="min-w-0">
    <p className="break-words font-black text-[#001a33]">
      {attempt.partner_name || 'Identidade não disponível'}
    </p>
    <p className="mt-1 break-all font-mono text-[10px] font-bold text-blue-700">
      Nosso Número {attempt.nosso_numero || 'não informado'}
    </p>
    <p className="mt-2 break-words text-[10px] font-semibold leading-relaxed text-slate-500">
      {attempt.description || 'Descrição não disponível'}
      {attempt.installment_number ? ` • Parcela ${attempt.installment_number}` : ''}
    </p>
  </div>
);

const AttemptResult = ({ attempt }: { attempt: BanesePollingAttempt }) => (
  <div>
    <StatusPill value={attempt.result} />
    <p className="mt-1.5 text-[10px] font-semibold leading-relaxed text-slate-500">
      Banco na tentativa: {statusLabel(attempt.remote_status)}
    </p>
    {attempt.error_class ? (
      <p className="mt-1 break-words text-[10px] font-bold text-red-700">
        {attempt.error_class}{attempt.http_status ? ` • HTTP ${attempt.http_status}` : ''}
      </p>
    ) : null}
  </div>
);

const CurrentTitle = ({ attempt }: { attempt: BanesePollingAttempt }) => {
  const failedButPaid = attempt.result === 'ERROR'
    && attempt.current_receivable_status === 'PAGO';
  return (
    <div>
      <StatusPill value={attempt.current_receivable_status} />
      <p className="mt-1.5 text-[10px] font-semibold leading-relaxed text-slate-500">
        Gateway atual: {statusLabel(attempt.current_gateway_status)}
      </p>
      <p className="mt-1 text-[10px] font-semibold text-slate-500">
        Vencimento {civilDate(attempt.due_date)} • {money(attempt.amount)}
      </p>
      {attempt.current_receivable_status === 'PAGO' ? (
        <p className="mt-1 text-[10px] font-bold text-emerald-700">
          Pago em {civilDate(attempt.paid_at)} • {money(attempt.amount_paid)}
        </p>
      ) : null}
      {failedButPaid ? (
        <p className="mt-1 text-[10px] font-bold text-amber-700">
          A tentativa falhou; o título está pago atualmente.
        </p>
      ) : null}
    </div>
  );
};

const EmptyState = () => (
  <p className="rounded-2xl border border-slate-200 bg-white px-4 py-10 text-center text-xs font-semibold text-slate-400">
    Nenhum título neste filtro.
  </p>
);

const BaneseAttemptsTable = ({
  attempts,
  context,
  canViewReceivableDetails,
}: BaneseAttemptsTableProps) => (
  <section className="space-y-3" aria-label="Histórico de consultas de boletos Banese">
    <p className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs font-semibold leading-relaxed text-blue-950">
      {contextCopy[context]}
    </p>
    {!canViewReceivableDetails ? (
      <p role="status" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-900">
        A identidade do aluno e os valores exigem a permissão Financeiro › Contas a receber.
      </p>
    ) : null}
    {!attempts.length ? <EmptyState /> : (
      <>
        <div className="space-y-3 xl:hidden">
          {attempts.map((attempt) => {
            const labelId = `banese-attempt-${String(attempt.id).replace(/[^a-zA-Z0-9_-]/g, '-')}`;
            return (
              <article key={attempt.id} aria-labelledby={labelId} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
                  <div>
                    <p id={labelId} className="font-bold text-slate-700">{dateTime(attempt.created_at)}</p>
                    <p className="mt-1 text-[9px] font-black uppercase tracking-wider text-slate-400">
                      {attempt.modality || 'Modalidade não registrada'}
                    </p>
                  </div>
                  <span className="shrink-0 text-[10px] font-bold text-slate-500">{duration(attempt.duration_ms)}</span>
                </div>
                <div className="py-3"><AttemptIdentity attempt={attempt} /></div>
                <div className="grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2">
                  <div>
                    <p className="mb-2 text-[9px] font-black uppercase tracking-wider text-slate-400">Tentativa</p>
                    <AttemptResult attempt={attempt} />
                  </div>
                  <div>
                    <p className="mb-2 text-[9px] font-black uppercase tracking-wider text-slate-400">Título agora</p>
                    <CurrentTitle attempt={attempt} />
                  </div>
                </div>
              </article>
            );
          })}
        </div>
        <div className="hidden overflow-hidden rounded-2xl border border-slate-200 xl:block">
          <table className="w-full table-fixed text-left text-xs">
            <caption className="sr-only">Eventos Banese com identidade do boleto, tentativa e situação atual</caption>
            <thead className="bg-slate-50 text-[9px] font-black uppercase tracking-widest text-slate-500">
              <tr>
                <th scope="col" className="w-[16%] px-4 py-3">Horário</th>
                <th scope="col" className="w-[28%] px-4 py-3">Aluno / boleto</th>
                <th scope="col" className="w-[19%] px-4 py-3">Tentativa</th>
                <th scope="col" className="w-[29%] px-4 py-3">Título agora</th>
                <th scope="col" className="w-[8%] px-4 py-3 text-right">Duração</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {attempts.map((attempt) => (
                <tr key={attempt.id} className="align-top text-slate-600">
                  <td className="px-4 py-4">
                    <p className="font-bold text-slate-700">{dateTime(attempt.created_at)}</p>
                    <p className="mt-1 text-[9px] font-black uppercase tracking-wider text-slate-400">
                      {attempt.modality || 'Não registrada'}
                    </p>
                  </td>
                  <td className="px-4 py-4"><AttemptIdentity attempt={attempt} /></td>
                  <td className="px-4 py-4"><AttemptResult attempt={attempt} /></td>
                  <td className="px-4 py-4"><CurrentTitle attempt={attempt} /></td>
                  <td className="px-4 py-4 text-right font-bold text-slate-500">{duration(attempt.duration_ms)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    )}
  </section>
);

export default BaneseAttemptsTable;
