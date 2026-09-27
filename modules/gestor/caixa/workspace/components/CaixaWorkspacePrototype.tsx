import React from 'react';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Landmark,
  ReceiptText,
  ShieldCheck,
  WalletCards,
} from 'lucide-react';
import {
  formatCaixaCanonicalCurrency,
  formatCaixaCompetencia,
  formatCaixaDate,
  formatCaixaDateTime,
} from '../../caixa.formatters.ts';
import type {
  CaixaWorkspaceIncompleteCode,
  CaixaWorkspacePayload,
} from '../caixa-workspace.types.ts';
import type { CaixaWorkspacePayablesFilter } from '../caixa-workspace-payables.types.ts';
import { CaixaWorkspaceAgenda } from './CaixaWorkspaceAgenda.tsx';
import {
  CaixaWorkspaceSectionState,
  formatCaixaWorkspaceIncompleteReason,
} from './CaixaWorkspaceSectionState.tsx';

interface CaixaWorkspacePrototypeProps {
  payload: CaixaWorkspacePayload;
  scopeLabel: string;
  onOpenPayables?: (filter: CaixaWorkspacePayablesFilter) => void;
}

const formatQuantity = (value: number) => new Intl.NumberFormat('pt-BR').format(value);

const metricIconClass = 'text-blue-200';

export const CaixaWorkspacePrototype = ({
  payload,
  scopeLabel,
  onOpenPayables,
}: CaixaWorkspacePrototypeProps) => {
  const { meta, secoes } = payload;
  const commitments = secoes.compromissos.dados;
  const payablesSection = commitments.contas_a_pagar;
  const payables = payablesSection.dados;
  const agendaSection = commitments.agenda_financeira;
  const incompleteReasons = payables
    .motivos_incompletude as CaixaWorkspaceIncompleteCode[];

  const competenceMetrics = [
    {
      label: 'Contas da competência',
      value: payables.contas_competencia.valor,
      quantity: payables.contas_competencia.quantidade,
      detail: 'Vencimento dentro da competência selecionada',
      filter: 'COMPETENCIA' as const,
      icon: <ReceiptText aria-hidden="true" size={15} className={metricIconClass} />,
    },
    {
      label: 'Pagamentos realizados',
      value: payables.pagas_competencia.valor,
      quantity: payables.pagas_competencia.quantidade,
      detail: 'Valor inclui pagamentos parciais; quantidade exige quitação integral',
      filter: 'PAGAS_COMPETENCIA' as const,
      icon: <CheckCircle2 aria-hidden="true" size={15} className="text-emerald-300" />,
    },
    {
      label: 'A vencer na competência',
      value: payables.a_vencer_competencia.valor,
      quantity: payables.a_vencer_competencia.quantidade,
      detail: 'Posição aberta no corte informado',
      filter: 'A_VENCER_COMPETENCIA' as const,
      icon: <CalendarDays aria-hidden="true" size={15} className="text-amber-300" />,
    },
  ];

  const unavailableLayers = [
    {
      label: 'Contas a receber',
      section: commitments.contas_a_receber,
      description: 'Recebíveis canônicos entram em uma etapa posterior.',
    },
    {
      label: 'Inadimplência',
      section: commitments.inadimplencia,
      description: 'A coorte mensal ainda não faz parte deste snapshot.',
    },
    {
      label: 'Fluxo de caixa',
      section: secoes.fluxo,
      description: 'Série temporal não fornecida; nenhum gráfico foi fabricado no navegador.',
    },
  ];

  return (
    <section
      aria-labelledby="caixa-workspace-title"
      className="overflow-hidden rounded-[28px] border border-slate-200 bg-[#f7f9fc] shadow-[0_24px_70px_-38px_rgba(0,26,51,0.55)]"
    >
      <div className="flex flex-col gap-4 border-b border-slate-200 bg-white px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <span className="rounded-2xl bg-[#001a33] p-2.5 text-blue-200 shadow-sm">
            <Landmark aria-hidden="true" size={19} />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-blue-700">
              Mesa de tesouraria
            </p>
            <p className="truncate text-sm font-bold text-slate-900">{scopeLabel}</p>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-5 gap-y-2 text-xs sm:flex sm:flex-wrap sm:items-center sm:gap-5">
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Competência</dt>
            <dd className="mt-0.5 font-semibold text-slate-800">{formatCaixaCompetencia(meta.competencia)}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Corte</dt>
            <dd className="mt-0.5 font-semibold text-slate-800">{formatCaixaDate(meta.data_corte)}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Snapshot</dt>
            <dd className="mt-0.5 font-semibold text-slate-800">{formatCaixaDateTime(meta.gerado_em)}</dd>
          </div>
        </dl>
      </div>

      <div className="relative overflow-hidden bg-[#001a33] text-white">
        <div aria-hidden="true" className="absolute -right-24 -top-32 h-72 w-72 rounded-full border-[44px] border-blue-400/10" />
        <div aria-hidden="true" className="absolute -bottom-28 left-1/3 h-56 w-56 rounded-full border-[36px] border-rose-400/[0.06]" />

        <div className="relative grid lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.75fr)]">
          <div className="order-2 px-4 py-6 sm:px-6 lg:order-1 lg:px-8 lg:py-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-blue-300">
                  Competência
                </p>
                <h2 id="caixa-workspace-title" className="mt-2 max-w-2xl text-2xl font-black tracking-[-0.035em] text-white sm:text-3xl">
                  Compromissos e vencimentos, com o corte à vista.
                </h2>
                <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">
                  Valores realizados e posições abertas permanecem visualmente separados.
                </p>
              </div>
              <CaixaWorkspaceSectionState
                label="Contas a pagar"
                section={payablesSection}
                compact
              />
            </div>

            <div className="mt-7 grid gap-2 sm:grid-cols-3">
              {competenceMetrics.map((metric) => (
                <button
                  key={metric.label}
                  type="button"
                  onClick={() => onOpenPayables?.(metric.filter)}
                  disabled={!onOpenPayables}
                  aria-haspopup="dialog"
                  aria-controls="caixa-workspace-payables-dialog"
                  className="rounded-2xl border border-white/10 bg-white/[0.055] p-4 text-left backdrop-blur-sm transition enabled:hover:-translate-y-0.5 enabled:hover:border-blue-300/40 enabled:hover:bg-white/[0.09] enabled:focus-visible:outline-none enabled:focus-visible:ring-2 enabled:focus-visible:ring-blue-300 disabled:cursor-default"
                >
                  <div className="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-300">
                    {metric.icon}
                    <span>{metric.label}</span>
                  </div>
                  <p className="mt-3 break-words text-xl font-black leading-tight tracking-[-0.025em] text-white">
                    {formatCaixaCanonicalCurrency(metric.value)}
                  </p>
                  <p className="mt-2 text-[10px] leading-4 text-slate-400">
                    <strong className="text-slate-200">{formatQuantity(metric.quantity)} títulos físicos</strong>
                    {' · '}{metric.detail}
                  </p>
                  {onOpenPayables && (
                    <span className="mt-3 inline-flex text-[10px] font-extrabold uppercase tracking-[0.12em] text-blue-200">
                      Abrir detalhes
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <aside className="relative order-1 border-b border-white/10 bg-[#071f36]/90 px-4 py-6 sm:px-6 lg:order-2 lg:border-b-0 lg:border-l lg:px-7 lg:py-8" aria-labelledby="caixa-workspace-overdue-title">
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-rose-300/20 bg-rose-400/10 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.14em] text-rose-200">
                <CalendarDays aria-hidden="true" size={12} /> Obrigações imediatas
              </span>
              <time dateTime={meta.data_corte} className="text-[10px] font-semibold text-slate-400">
                Corte {formatCaixaDate(meta.data_corte)}
              </time>
            </div>
            <h3 id="caixa-workspace-overdue-title" className="mt-6 text-sm font-bold text-slate-300">
              Em atraso no corte
            </h3>
            <p className="mt-2 break-words text-3xl font-black tracking-[-0.04em] text-rose-300">
              {formatCaixaCanonicalCurrency(payables.em_atraso.valor)}
            </p>
            <p className="mt-2 text-xs leading-5 text-slate-300">
              {payables.em_atraso.quantidade === 0 && !payables.em_atraso.data_mais_antiga
                ? 'Nenhum título vencido no corte'
                : `${formatQuantity(payables.em_atraso.quantidade)} títulos vencidos · mais antigo em ${
                  payables.em_atraso.data_mais_antiga
                    ? formatCaixaDate(payables.em_atraso.data_mais_antiga)
                    : 'data não informada'
                }`}
            </p>
            <div className="mt-6 flex items-start gap-2 rounded-2xl border border-white/10 bg-black/10 p-3 text-xs leading-5 text-slate-300">
              <ShieldCheck aria-hidden="true" size={15} className="mt-0.5 shrink-0 text-blue-300" />
              <span>Somente pagamentos efetivos integram o realizado; compromissos abertos permanecem posição.</span>
            </div>
            {onOpenPayables && (
              <button
                type="button"
                onClick={() => onOpenPayables('ATRASADAS')}
                aria-haspopup="dialog"
                aria-controls="caixa-workspace-payables-dialog"
                className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-rose-300/25 bg-rose-400/10 px-4 py-2 text-xs font-extrabold uppercase tracking-[0.12em] text-rose-100 transition hover:bg-rose-400/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200"
              >
                Ver contas em atraso
              </button>
            )}
          </aside>
        </div>

        <CaixaWorkspaceAgenda agenda={agendaSection.dados} />
      </div>

      {!payablesSection.completo && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-start gap-3" role="status">
            <AlertTriangle aria-hidden="true" size={18} className="mt-0.5 shrink-0 text-amber-600" />
            <div>
              <h3 className="text-sm font-bold text-amber-950">Leitura parcial — dados em conferência</h3>
              <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-amber-800">
                {incompleteReasons.map((reason) => (
                  <li key={reason}>• {formatCaixaWorkspaceIncompleteReason(reason)}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      <div className="px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2 text-slate-800">
          <WalletCards aria-hidden="true" size={16} className="text-blue-700" />
          <h2 className="text-sm font-extrabold uppercase tracking-[0.14em]">Camadas em preparação</h2>
        </div>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          Ausência de contrato canônico é mostrada como indisponibilidade, não como resultado financeiro zero.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {unavailableLayers.map((layer) => (
            <div key={layer.label}>
              <CaixaWorkspaceSectionState
                label={layer.label}
                section={layer.section}
                description={layer.description}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
