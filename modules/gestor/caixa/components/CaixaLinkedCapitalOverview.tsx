import React from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowDownRight,
  ArrowRight,
  Building2,
  CircleDollarSign,
  Landmark,
  ReceiptText,
  ShieldCheck,
  WalletCards,
} from 'lucide-react';
import type { CaixaConveniosResumo } from '../caixa-convenios.service';
import type { CaixaFinanciamentoResumo } from '../caixa.types';
import { formatCaixaCurrency } from '../caixa.formatters';

interface CaixaLinkedCapitalOverviewProps {
  convenios?: CaixaConveniosResumo;
  financiamento?: CaixaFinanciamentoResumo;
  isConveniosLoading: boolean;
  hasConveniosError: boolean;
  isFinanciamentoLoading: boolean;
  hasFinanciamentoError: boolean;
}

/**
 * Apresenta os dois fluxos de capital lado a lado. As setas comunicam a ordem
 * de leitura; saldos e componentes são exibidos exatamente como vieram das
 * RPCs e não são recompostos neste componente.
 */
export const CaixaLinkedCapitalOverview: React.FC<CaixaLinkedCapitalOverviewProps> = ({
  convenios,
  financiamento,
  isConveniosLoading,
  hasConveniosError,
  isFinanciamentoLoading,
  hasFinanciamentoError,
}) => (
  <section aria-labelledby="caixa-linked-capital-title" className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
    <header className="border-b border-slate-200 bg-gradient-to-r from-violet-50 via-white to-blue-50 px-5 py-5 sm:px-7">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-700">Capital vinculado</p>
          <h3 id="caixa-linked-capital-title" className="mt-1 text-xl font-extrabold tracking-tight text-[#061a2f]">
            Origem, compromisso e destino dos recursos
          </h3>
        </div>
        <p className="max-w-xl text-xs leading-5 text-slate-500 lg:text-right">
          Convênios e financiamento seguem trilhas independentes e não duplicam o resultado operacional.
        </p>
      </div>
    </header>

    <div className="grid xl:grid-cols-2">
      <article className="border-b border-slate-200 p-5 sm:p-7 xl:border-b-0 xl:border-r">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="rounded-xl bg-violet-100 p-2.5 text-violet-700"><Building2 size={18} aria-hidden="true" /></span>
            <div>
              <h4 className="text-base font-extrabold text-slate-900">Trilha dos convênios</h4>
              <p className="mt-0.5 text-xs text-slate-500">
                {convenios ? `${convenios.quantidadeConvenios} convênio(s) na competência` : 'Recursos vinculados por competência'}
              </p>
            </div>
          </div>
          {convenios ? (
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-violet-50 px-3 py-1.5 text-[10px] font-bold text-violet-700">
              <ShieldCheck size={12} aria-hidden="true" /> Sem duplicar o Caixa
            </span>
          ) : null}
        </div>

        {isConveniosLoading ? (
          <FlowLoading label="Carregando recursos vinculados" />
        ) : hasConveniosError || !convenios ? (
          <FlowUnavailable title="Convênios indisponíveis" copy="Não foi possível carregar a posição analítica dos convênios agora." />
        ) : (
          <>
            <div className="mt-5 grid gap-2 sm:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr]">
              <FlowNode label="Saldo inicial" value={formatCaixaCurrency(convenios.saldoInicial)} icon={<WalletCards size={14} />} tone="slate" />
              <FlowArrow />
              <FlowNode label="Créditos recebidos" value={formatCaixaCurrency(convenios.creditosRecebidos)} icon={<CircleDollarSign size={14} />} tone="green" />
              <FlowArrow />
              <FlowNode label="Despesas pagas" value={formatCaixaCurrency(convenios.despesasPagas)} icon={<ArrowDownRight size={14} />} tone="rose" />
              <FlowArrow />
              <FlowNode label="Comprometido" value={formatCaixaCurrency(convenios.comprometidoAberto)} icon={<ReceiptText size={14} />} tone="amber" />
            </div>

            <div className="mt-4 overflow-hidden rounded-2xl bg-violet-950 text-white">
              <div className="grid grid-cols-2 divide-x divide-white/10">
                <CapitalResult label="Disponível" value={formatCaixaCurrency(convenios.saldoDisponivel)} helper="Posição canônica atual" />
                <CapitalResult label="Projetado" value={formatCaixaCurrency(convenios.saldoProjetado)} helper="Após compromissos abertos" />
              </div>
            </div>

            {convenios.itens.length > 0 ? (
              <details className="group mt-4 rounded-xl border border-violet-100 bg-violet-50/50">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-xs font-bold text-violet-900 outline-none focus-visible:ring-2 focus-visible:ring-violet-500 [&::-webkit-details-marker]:hidden">
                  Ver detalhamento por convênio
                  <span className="rounded-full bg-white px-2 py-0.5 text-[10px] text-violet-700">{convenios.itens.length}</span>
                </summary>
                <ul className="divide-y divide-violet-100 border-t border-violet-100 px-3">
                  {convenios.itens.map((item) => (
                    <li key={item.convenioId} className="py-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-xs font-bold text-slate-800">{item.nome}</p>
                          <p className="mt-0.5 text-[10px] text-slate-500">{item.competencia} · {item.status === 'ABERTO' ? 'Aberto' : 'Finalizado'}</p>
                        </div>
                        <div className="flex gap-4 text-[10px]">
                          <span className="text-slate-500">Disponível <strong className="block text-xs text-violet-900">{formatCaixaCurrency(item.saldoDisponivel)}</strong></span>
                          <span className="text-slate-500">Projetado <strong className="block text-xs text-violet-900">{formatCaixaCurrency(item.saldoProjetado)}</strong></span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </details>
            ) : (
              <p className="mt-4 rounded-xl bg-slate-50 px-3 py-2.5 text-[10px] leading-4 text-slate-500">
                Nenhum convênio individual registrado nesta competência.
              </p>
            )}

            <p className="mt-3 text-[10px] leading-4 text-slate-400">
              A competência do convênio fecha manualmente; uma baixa posterior aparece no Caixa do mês em que foi paga.
            </p>
          </>
        )}
      </article>

      <article className="relative overflow-hidden bg-[#f8fbff] p-5 sm:p-7">
        <div className="pointer-events-none absolute -bottom-20 -right-20 h-56 w-56 rounded-full border-[34px] border-blue-100/60" />
        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="rounded-xl bg-blue-100 p-2.5 text-blue-700"><Landmark size={18} aria-hidden="true" /></span>
            <div>
              <h4 className="text-base font-extrabold text-slate-900">Trilha de financiamento</h4>
              <p className="mt-0.5 text-xs text-slate-500">Crédito, obrigação, principal, encargos e baixa.</p>
            </div>
          </div>
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-blue-100 bg-white px-3 py-1.5 text-[10px] font-bold text-blue-700">
            <Landmark size={12} aria-hidden="true" /> Fora da receita operacional
          </span>
        </div>

        {isFinanciamentoLoading ? (
          <FlowLoading label="Carregando financiamento e rateios" />
        ) : hasFinanciamentoError || !financiamento ? (
          <FlowUnavailable title="Financiamento indisponível" copy="Não foi possível carregar o resumo canônico de crédito e obrigações agora." />
        ) : (
          <div className="relative mt-5">
            <div className="rounded-2xl bg-[#071f3c] p-4 text-white shadow-lg shadow-blue-950/10">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-blue-300">Crédito liberado neste escopo</p>
              <p className="mt-2 text-2xl font-black tracking-tight">{formatCaixaCurrency(financiamento.creditoLiberadoMatriz)}</p>
              <p className="mt-1 text-[10px] leading-4 text-slate-400">Liberação financeira registrada pelo servidor</p>
            </div>

            <div className="flex justify-center py-2 text-blue-300"><ArrowDown size={17} aria-hidden="true" /></div>

            <div className="rounded-2xl border border-blue-100 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-2 border-b border-slate-100 pb-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Obrigação rateada</p>
                  <p className="mt-1 text-xl font-extrabold text-rose-700">{formatCaixaCurrency(financiamento.obrigacaoRateada)}</p>
                </div>
                <p className="max-w-[230px] text-[10px] leading-4 text-slate-400 sm:text-right">Compromissos previstos neste escopo</p>
              </div>
              <div className="mt-3 grid grid-cols-3 divide-x divide-slate-100">
                <FinancingMetric label="Principal" value={formatCaixaCurrency(financiamento.principalRateado)} tone="slate" />
                <FinancingMetric label="Encargos" value={formatCaixaCurrency(financiamento.encargosRateados)} tone="amber" />
                <FinancingMetric label="Pago no polo" value={formatCaixaCurrency(financiamento.pagoRateado)} tone="green" />
              </div>
            </div>

            {financiamento.observacao ? (
              <div className="mt-3 flex items-start gap-2 rounded-xl bg-blue-50 px-3 py-2.5 text-[10px] leading-4 text-blue-900">
                <ReceiptText size={12} className="mt-0.5 shrink-0 text-blue-600" aria-hidden="true" />
                <span>{financiamento.observacao}</span>
              </div>
            ) : null}
          </div>
        )}
      </article>
    </div>
  </section>
);

const FlowNode: React.FC<{ label: string; value: string; icon: React.ReactNode; tone: 'slate' | 'green' | 'rose' | 'amber' }> = ({ label, value, icon, tone }) => {
  const toneClass = tone === 'green' ? 'text-emerald-700' : tone === 'rose' ? 'text-rose-700' : tone === 'amber' ? 'text-amber-700' : 'text-slate-700';
  return (
    <div className="min-w-0 rounded-xl border border-slate-100 bg-slate-50/80 p-3">
      <p className={`flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wide ${toneClass}`}>{icon}{label}</p>
      <p className={`mt-2 truncate text-sm font-extrabold ${toneClass}`} title={value}>{value}</p>
    </div>
  );
};

const FlowArrow = () => <div className="flex items-center justify-center text-slate-300"><ArrowRight size={15} className="hidden sm:block" /><ArrowDown size={15} className="sm:hidden" /></div>;

const CapitalResult: React.FC<{ label: string; value: string; helper: string }> = ({ label, value, helper }) => (
  <div className="min-w-0 p-4">
    <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-violet-300">{label}</p>
    <p className="mt-1 truncate text-xl font-black" title={value}>{value}</p>
    <p className="mt-1 text-[9px] text-violet-200/70">{helper}</p>
  </div>
);

const FinancingMetric: React.FC<{ label: string; value: string; tone: 'slate' | 'amber' | 'green' }> = ({ label, value, tone }) => {
  const toneClass = tone === 'amber' ? 'text-amber-700' : tone === 'green' ? 'text-emerald-700' : 'text-slate-800';
  return (
    <div className="min-w-0 px-3 first:pl-0 last:pr-0">
      <p className="text-[9px] font-semibold text-slate-500">{label}</p>
      <p className={`mt-1 truncate text-sm font-extrabold ${toneClass}`} title={value}>{value}</p>
    </div>
  );
};

const FlowLoading: React.FC<{ label: string }> = ({ label }) => (
  <div role="status" aria-busy="true" className="mt-5 rounded-2xl border border-slate-100 bg-slate-50 p-5">
    <div className="h-3 w-2/3 animate-pulse rounded bg-slate-200 motion-reduce:animate-none" />
    <p className="mt-3 text-xs text-slate-500">{label}</p>
  </div>
);

const FlowUnavailable: React.FC<{ title: string; copy: string }> = ({ title, copy }) => (
  <div role="status" className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
    <AlertTriangle size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
    <div><p className="text-xs font-bold">{title}</p><p className="mt-1 text-[10px] leading-4">{copy}</p></div>
  </div>
);
