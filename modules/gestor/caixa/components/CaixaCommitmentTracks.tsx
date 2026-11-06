import React from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CalendarCheck2,
  CalendarClock,
  CheckCircle2,
  CircleDot,
  Clock3,
  ReceiptText,
} from 'lucide-react';
import type { CaixaContasPagarResumo, CaixaMonthlyStatement } from '../caixa.types';
import type { CaixaReceivablesPosition } from '../review-pending/caixa-receivables-position.service';
import {
  formatCaixaCanonicalCurrency,
  formatCaixaCurrency,
  formatCaixaDate,
  formatCaixaPercent,
} from '../caixa.formatters';

interface CaixaCommitmentTracksProps {
  statement: CaixaMonthlyStatement;
  contasPagar?: CaixaContasPagarResumo;
  isPayablesLoading: boolean;
  hasPayablesError: boolean;
  onReviewPending?: (context: 'MONTHLY' | 'FUTURE') => void;
  receivablesPosition?: CaixaReceivablesPosition;
  isReceivablesLoading?: boolean;
  hasReceivablesError?: boolean;
}

const QUANTITY_FORMATTER = new Intl.NumberFormat('pt-BR');
const formatQuantity = (value: number) => QUANTITY_FORMATTER.format(value);

/**
 * Organiza realizado, aberto e vencido em trilhas paralelas. Cada número é
 * exibido diretamente de um campo canônico; nenhuma pendência é inferida pela
 * diferença entre totais no cliente.
 */
export const CaixaCommitmentTracks: React.FC<CaixaCommitmentTracksProps> = ({
  statement,
  contasPagar,
  isPayablesLoading,
  hasPayablesError,
  onReviewPending,
  receivablesPosition,
  isReceivablesLoading = false,
  hasReceivablesError = false,
}) => {
  const commitments = statement.compromissos;
  const monthlyDelinquency = commitments.inadimplenciaMensal;
  const monthlyReview = !hasReceivablesError ? receivablesPosition?.monthly : undefined;

  return (
    <section aria-labelledby="caixa-commitment-tracks-title" className="space-y-4">
      <div className="flex flex-col gap-2 px-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-medium tracking-[0.08em] text-blue-600">
            Compromissos e pendências
          </p>
          <h2 id="caixa-commitment-tracks-title" className="mt-1 text-[15px] font-medium text-[#001a33]">
            O que já aconteceu e o que ainda exige atenção
          </h2>
        </div>
        <p className="max-w-lg text-xs leading-5 text-slate-500 sm:text-right">
          Valores em aberto ficam separados do fluxo realizado e não alteram o resultado do mês antes da baixa.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <article className="overflow-hidden rounded-xl border border-emerald-100 bg-white">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-100 bg-emerald-50/70 p-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-emerald-700">
                <ArrowUpRight size={17} aria-hidden="true" />
              </span>
              <div>
                <h3 className="text-sm font-medium text-emerald-950">Trilha a receber</h3>
                <p className="mt-0.5 text-[11px] text-emerald-800/70">
                  Visão mensal: recebido, em aberto e atraso da competência
                </p>
              </div>
            </div>
            <span className={`rounded-md border px-2 py-0.5 text-[11px] font-medium tracking-normal ${
              monthlyDelinquency.completo
                ? 'border-emerald-200 bg-white text-emerald-700'
                : 'border-amber-200 bg-amber-50 text-amber-700'
            }`}>
              {monthlyDelinquency.completo ? 'Base conferida' : 'Base parcial'}
            </span>
          </header>

          <div className="grid divide-y divide-slate-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <TrackMetric
              icon={<CheckCircle2 size={14} className="text-emerald-600" aria-hidden="true" />}
              label="Recebido no mês"
              value={formatCaixaCurrency(statement.resumoCompetencia.entradasRecebidasBrutas)}
              helper={`${formatQuantity(statement.resumoCompetencia.quantidadeRecebimentos)} recebimento(s) confirmado(s)`}
              tone="emerald"
            />
            <TrackMetric
              icon={<CalendarClock size={14} className="text-blue-600" aria-hidden="true" />}
              label="Em aberto no mês"
              value={!hasReceivablesError && receivablesPosition
                ? formatCaixaCanonicalCurrency(receivablesPosition.monthly.openConfirmed) : '—'}
              helper={hasReceivablesError ? 'Posição mensal indisponível'
                : isReceivablesLoading || !receivablesPosition ? 'Carregando posição mensal…'
                  : `${formatQuantity(receivablesPosition.monthly.count)} cobrança(s) da competência · corte ${formatCaixaDate(receivablesPosition.dataCorte)}`}
              tone="blue"
            />
            <TrackMetric
              icon={<AlertTriangle size={14} className="text-amber-600" aria-hidden="true" />}
              label={`Vencido no mês${monthlyReview && monthlyReview.reviewCount > 0 ? ' (parcial)' : ''}`}
              value={!hasReceivablesError && receivablesPosition
                ? formatCaixaCanonicalCurrency(receivablesPosition.monthly.overdue) : '—'}
              helper={hasReceivablesError ? 'Posição mensal indisponível'
                : !receivablesPosition ? 'Carregando posição mensal…'
                  : `${formatCaixaPercent(commitments.margemInadimplencia)} da base · corte ${formatCaixaDate(receivablesPosition.dataCorte)}`}
              tone="amber"
            />
          </div>

          <TrackFooter>
            Base mensal elegível: {formatCaixaCurrency(monthlyDelinquency.baseElegivel)} em{' '}
            {formatQuantity(monthlyDelinquency.quantidadeElegiveis)} cobrança(s).
          </TrackFooter>

          {monthlyReview && monthlyReview.reviewCount > 0 ? (
            <div className="border-t border-amber-100 bg-amber-50/70 px-4 py-3 text-[11px] leading-4 text-amber-900">
              <div className="flex items-start gap-2">
                <CircleDot size={12} className="mt-0.5 shrink-0 text-amber-600" aria-hidden="true" />
                <div>
                  {monthlyReview.reviewCount > 0 ? (
                    <button type="button" onClick={() => onReviewPending?.('MONTHLY')}
                      disabled={!onReviewPending} aria-haspopup="dialog"
                      className="block min-h-11 w-full rounded-lg px-2 py-2 text-left transition hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700 disabled:cursor-default motion-reduce:transition-none">
                      <strong className="block">Registros em conferência — mês</strong>
                      Conferência de dados: {formatQuantity(monthlyReview.reviewCount)} registro(s) local(is) (valor nominal cadastrado{' '}
                      {formatCaixaCanonicalCurrency(monthlyReview.reviewNominal)}), não incluídos nos valores confirmados.
                      <span className="ml-1 font-medium underline underline-offset-2">Ver registros</span>
                      <span className="mt-1 block">Estes registros não comprovam cobrança em aberto nem inadimplência. Podem corresponder a divergências de importação, quitações ou cancelamentos ainda não conciliados.</span>
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
        </article>

        <article className="overflow-hidden rounded-xl border border-rose-100 bg-white">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-rose-100 bg-rose-50/70 p-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-rose-700">
                <ArrowDownRight size={17} aria-hidden="true" />
              </span>
              <div>
                <h3 className="text-sm font-medium text-rose-950">Trilha a pagar</h3>
                <p className="mt-0.5 text-[11px] text-rose-800/70">
                  Pago, a vencer e atrasado na competência
                </p>
              </div>
            </div>
            {contasPagar ? (
              <span className="rounded-md border border-rose-200 bg-white px-2 py-0.5 text-[11px] font-medium tracking-normal text-rose-700">
                Corte {formatCaixaDate(contasPagar.dataCorte)}
              </span>
            ) : null}
          </header>

          <div className="grid divide-y divide-rose-100 border-b border-rose-100 bg-rose-50/30 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
            <TrackMetric
              icon={<CalendarClock size={14} className="text-rose-600" aria-hidden="true" />}
              label="Obrigações futuras (posição atual)"
              value={formatCaixaCurrency(commitments.aPagar)}
              helper="Compromissos abertos; não integram o realizado antes da baixa"
              tone="rose"
            />
            <TrackMetric
              icon={<AlertTriangle size={14} className="text-rose-600" aria-hidden="true" />}
              label="Obrigações vencidas (posição atual)"
              value={formatCaixaCurrency(commitments.pagarVencido)}
              helper="Compromissos abertos; não integram o realizado antes da baixa"
              tone="rose"
            />
          </div>

          <PayablesTrack
            resumo={contasPagar}
            isLoading={isPayablesLoading}
            hasError={hasPayablesError}
          />
        </article>
      </div>
    </section>
  );
};

const PayablesTrack: React.FC<{
  resumo?: CaixaContasPagarResumo;
  isLoading: boolean;
  hasError: boolean;
}> = ({ resumo, isLoading, hasError }) => {
  if (isLoading) {
    return (
      <div role="status" aria-label="Carregando trilha a pagar" className="grid gap-px bg-slate-100 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="h-24 animate-pulse bg-white p-4">
            <div className="h-3 w-24 rounded bg-slate-100" />
            <div className="mt-4 h-5 w-28 rounded bg-slate-100" />
          </div>
        ))}
      </div>
    );
  }

  if (hasError || !resumo) {
    return (
      <div role="alert" className="flex min-h-24 items-center gap-3 p-4 text-amber-900">
        <AlertTriangle size={18} className="shrink-0 text-amber-600" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium">Compromissos a pagar indisponíveis</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Nenhum valor foi estimado. O fluxo realizado continua válido separadamente.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-1 border-b border-rose-100 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div>
          <p className="text-[11px] font-medium tracking-normal text-slate-500">
            Total das contas da competência
          </p>
          <p className="mt-1 break-words text-[22px] font-medium leading-tight tracking-tight tabular-nums text-slate-900">
            {formatCaixaCanonicalCurrency(resumo.contasCompetencia.valor)}
          </p>
        </div>
        <p className="text-[11px] leading-4 text-slate-500 sm:max-w-52 sm:text-right">
          {formatQuantity(resumo.contasCompetencia.quantidade)} conta(s) com vencimento na competência selecionada
        </p>
      </div>
      <div className="grid divide-y divide-slate-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <TrackMetric
          icon={<CheckCircle2 size={14} className="text-emerald-600" aria-hidden="true" />}
          label="Pago na competência"
          value={formatCaixaCanonicalCurrency(resumo.pagasCompetencia.valor)}
          helper={`${formatQuantity(resumo.pagasCompetencia.quantidade)} título(s) quitado(s)`}
          tone="emerald"
        />
        <TrackMetric
          icon={<CalendarCheck2 size={14} className="text-blue-600" aria-hidden="true" />}
          label="A vencer"
          value={formatCaixaCanonicalCurrency(resumo.aVencerCompetencia.valor)}
          helper={`${formatQuantity(resumo.aVencerCompetencia.quantidade)} conta(s) da competência`}
          tone="blue"
        />
        <TrackMetric
          icon={<AlertTriangle size={14} className="text-rose-600" aria-hidden="true" />}
          label="Em atraso no corte"
          value={formatCaixaCanonicalCurrency(resumo.emAtraso.valor)}
          helper={resumo.emAtraso.dataMaisAntiga
            ? `${formatQuantity(resumo.emAtraso.quantidade)} conta(s) · mais antiga ${formatCaixaDate(resumo.emAtraso.dataMaisAntiga)}`
            : `${formatQuantity(resumo.emAtraso.quantidade)} conta(s) vencida(s)`}
          tone={resumo.emAtraso.quantidade > 0 ? 'rose' : 'neutral'}
        />
      </div>
      <TrackFooter>
        <span className="inline-flex items-center gap-1.5">
          <Clock3 size={12} aria-hidden="true" />
          Hoje: {formatCaixaCanonicalCurrency(resumo.agendaFinanceira.hoje.valor)} ·{' '}
          {formatQuantity(resumo.agendaFinanceira.hoje.quantidade)} conta(s)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <ReceiptText size={12} aria-hidden="true" />
          Próximos 7 dias: {formatCaixaCanonicalCurrency(resumo.agendaFinanceira.proximosSeteDias.valor)} ·{' '}
          {formatQuantity(resumo.agendaFinanceira.proximosSeteDias.quantidade)} conta(s)
        </span>
      </TrackFooter>
    </>
  );
};

const TrackMetric: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  helper: string;
  tone: 'emerald' | 'blue' | 'amber' | 'rose' | 'neutral';
}> = ({ icon, label, value, helper, tone }) => {
  const toneClass = {
    emerald: 'text-emerald-700',
    blue: 'text-blue-800',
    amber: 'text-amber-700',
    rose: 'text-rose-700',
    neutral: 'text-slate-900',
  }[tone];

  return (
    <div className="min-w-0 px-4 py-3">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
        {icon}
        <span>{label}</span>
      </div>
      <p className={`mt-2 break-words text-[21px] font-medium leading-tight tracking-tight tabular-nums ${toneClass}`} title={value}>
        {value}
      </p>
      <p className="mt-1 text-[11px] leading-4 text-[#607286]">{helper}</p>
    </div>
  );
};

const TrackFooter: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex flex-col gap-1 border-t border-slate-100 bg-slate-50/70 px-4 py-2.5 text-[11px] leading-4 text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
    {children}
  </div>
);
