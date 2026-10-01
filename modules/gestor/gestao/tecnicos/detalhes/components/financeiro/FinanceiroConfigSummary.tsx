import React from 'react';
import { AlertCircle, Calendar, DollarSign, Edit2, FileText, Percent, RefreshCw } from 'lucide-react';
import { CronogramaItem, FinanceiroConfigData } from './financeiro-config.service';
import {
  FINANCEIRO_POLICIES,
  FinanceiroRulesCalculation,
  formatCurrencyBRL,
  formatPercentageBR,
} from './financeiro-config.utils';

interface FinanceiroConfigSummaryProps {
  calculo?: FinanceiroRulesCalculation;
  config: FinanceiroConfigData;
  cronograma: CronogramaItem[];
  onEdit?: () => void;
  turmaLabel: string;
  somenteSegundoCiclo?: boolean;
  somenteConsulta?: boolean;
  valuesVisible?: boolean;
}

const HIDDEN_CURRENCY = 'R$ •••••';

const PrivateCurrency: React.FC<{ value: number; visible: boolean }> = ({ value, visible }) => {
  if (visible) return <>{formatCurrencyBRL(value)}</>;

  return (
    <>
      <span aria-hidden="true">{HIDDEN_CURRENCY}</span>
      <span className="sr-only">Valor oculto</span>
    </>
  );
};

const FinanceiroConfigSummary: React.FC<FinanceiroConfigSummaryProps> = ({
  calculo,
  config,
  cronograma,
  onEdit,
  turmaLabel,
  somenteSegundoCiclo = false,
  somenteConsulta = false,
  valuesVisible = false,
}) => {
  return (
    <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,0.9fr)]">
      <section
        aria-labelledby="financial-rules-title"
        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
      >
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h3 id="financial-rules-title" className="text-base font-black tracking-tight text-[#001a33]">Regras financeiras</h3>
            <p className="mt-0.5 max-w-3xl text-xs leading-relaxed text-slate-500">
              {somenteConsulta
                ? 'Condições cadastradas para consulta. Os títulos já emitidos seguem os valores do sistema de origem.'
                : somenteSegundoCiclo
                  ? 'Valores e encargos somente para o 2º ciclo. O 1º ciclo permanece no sistema anterior.'
                  : 'Parâmetros aplicados a todos os alunos desta turma.'}
            </p>
          </div>
          {!somenteConsulta && onEdit ? (
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex min-h-9 shrink-0 items-center justify-center gap-2 self-start rounded-xl border border-blue-100 bg-blue-50 px-3 text-[11px] font-black text-blue-700 transition-colors hover:border-blue-200 hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <Edit2 size={14} aria-hidden="true" />
              Editar regras
            </button>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 sm:grid-cols-4">
          <div className="min-w-0 bg-white p-3">
            <p className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-slate-500">
              <DollarSign size={11} aria-hidden="true" /> Matrícula
            </p>
            <p className="mt-1 truncate text-sm font-black tabular-nums text-[#001a33]" title={config.cobrarMatricula && valuesVisible ? formatCurrencyBRL(config.valorMatricula) : undefined}>
              {config.cobrarMatricula ? <PrivateCurrency value={config.valorMatricula} visible={valuesVisible} /> : 'Não cobrada'}
            </p>
          </div>
          <div className="min-w-0 bg-white p-3">
            <p className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-slate-500">
              <Calendar size={11} aria-hidden="true" /> Plano
            </p>
            <p className="mt-1 truncate text-sm font-black text-[#001a33]">{config.qtdParcelas}x por ciclo</p>
          </div>
          <div className="min-w-0 bg-white p-3">
            <p className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-slate-500">
              <Calendar size={11} aria-hidden="true" /> Vencimento padrão
            </p>
            <p className="mt-1 truncate text-sm font-black text-[#001a33]">Dia {String(config.diaVencimentoPadrao).padStart(2, '0')}</p>
          </div>
          <div className="min-w-0 bg-white p-3">
            <p className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-slate-500">
              <DollarSign size={11} aria-hidden="true" /> Mensalidade
            </p>
            <p className="mt-1 truncate text-sm font-black tabular-nums text-[#001a33]" title={valuesVisible ? formatCurrencyBRL(config.valorParcela) : undefined}>
              <PrivateCurrency value={config.valorParcela} visible={valuesVisible} />
            </p>
          </div>
          <div className="min-w-0 bg-white p-3">
            <p className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-amber-700">
              <RefreshCw size={11} aria-hidden="true" /> Rematrícula
            </p>
            <p className="mt-1 truncate text-sm font-black tabular-nums text-amber-700" title={config.cobrarRematricula && valuesVisible ? formatCurrencyBRL(config.valorRematricula) : undefined}>
              {config.cobrarRematricula ? <PrivateCurrency value={config.valorRematricula} visible={valuesVisible} /> : 'Sem renovação'}
            </p>
          </div>
          <div className="min-w-0 bg-white p-3">
            <p className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-emerald-700">
              <Percent size={11} aria-hidden="true" /> Desconto
            </p>
            <p className="mt-1 truncate text-sm font-black tabular-nums text-emerald-700">- <PrivateCurrency value={config.descontoPontualidade} visible={valuesVisible} /></p>
          </div>
          <div className="min-w-0 bg-white p-3">
            <p className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-rose-600">
              <AlertCircle size={11} aria-hidden="true" /> Juros proporcional
            </p>
            <p className="mt-1 text-sm font-black text-rose-600">{config.jurosAtraso}% ao mês</p>
            <p className="mt-0.5 text-[9px] font-semibold leading-snug text-slate-500">
              {calculo ? (
                <>{formatPercentageBR(calculo.juros_percentual_dia)}% ao dia ≈ <PrivateCurrency value={calculo.juros_valor_dia} visible={valuesVisible} />/dia no boleto/carnê</>
              ) : 'Calculando equivalente diário...'}
            </p>
          </div>
          <div className="min-w-0 bg-white p-3">
            <p className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-rose-600">
              <AlertCircle size={11} aria-hidden="true" /> Multa única
            </p>
            <p className="mt-1 text-sm font-black text-rose-600">{config.multaAtrasoPercentual}%</p>
            <p className="mt-0.5 text-[9px] font-semibold leading-snug text-slate-500">
              {calculo ? <><PrivateCurrency value={calculo.multa_aplicada} visible={valuesVisible} /> uma única vez</> : 'Calculando multa em reais...'}
            </p>
          </div>
        </div>

        <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
          <div className="border-b border-slate-200 px-3 py-2">
            <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">Aplicação por cobrança</p>
          </div>
          <div className="grid gap-px bg-slate-200 sm:grid-cols-3">
            {FINANCEIRO_POLICIES.map((policy) => (
              <div key={policy.label} className="bg-white px-3 py-2.5">
                <p className="text-[10px] font-black text-[#001a33]">{policy.label}</p>
                <p className="mt-0.5 text-[9px] font-bold uppercase leading-relaxed text-slate-500">
                  Desc: {config[policy.descontoKey] ? 'sim' : 'não'} · Multa/Juros: {config[policy.multaKey] ? 'sim' : 'não'}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2.5">
          <div className="flex items-start gap-2.5">
            <FileText size={16} className="mt-0.5 shrink-0 text-amber-700" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-[9px] font-black uppercase tracking-wider text-amber-800">Impresso no boleto e no carnê</p>
              <p className="mt-1 truncate text-[11px] font-bold text-[#001a33]" title={turmaLabel}>Turma: {turmaLabel}</p>
              <p className="mt-0.5 text-[11px] font-extrabold leading-relaxed text-amber-900">{config.instrucaoBoletoCarne}</p>
            </div>
          </div>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
            <p className="text-[9px] font-black uppercase tracking-wider text-emerald-700">Pago até o vencimento · com desconto · RPC</p>
            <p className="mt-1 text-[10px] font-medium leading-relaxed text-slate-500">Parcela com o desconto de pontualidade aplicado.</p>
            <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-emerald-100 pt-2">
              <span className="text-[9px] font-black uppercase text-slate-500">Valor final</span>
              <span className="text-base font-black tabular-nums text-emerald-700">
                {calculo ? <PrivateCurrency value={calculo.valor_com_desconto} visible={valuesVisible} /> : 'Calculando no servidor...'}
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-rose-100 bg-rose-50/60 p-3">
            <p className="text-[9px] font-black uppercase tracking-wider text-rose-700">Pago após o vencimento · exemplo com 30 dias · RPC</p>
            <p className="mt-1 text-[10px] font-medium leading-relaxed text-slate-500">
              Parcela + juros diário de {calculo ? <PrivateCurrency value={calculo.juros_valor_dia} visible={valuesVisible} /> : 'calculando...'} ({config.jurosAtraso}% ao mês proporcional aos dias) + multa única de {config.multaAtrasoPercentual}% ({calculo ? <PrivateCurrency value={calculo.multa_aplicada} visible={valuesVisible} /> : 'calculando...'}).
            </p>
            <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-rose-100 pt-2">
              <span className="text-[9px] font-black uppercase text-slate-500">Valor final</span>
              <span className="text-base font-black tabular-nums text-rose-700">
                {calculo ? <PrivateCurrency value={calculo.valor_com_atraso} visible={valuesVisible} /> : 'Calculando no servidor...'}
              </span>
            </div>
          </div>
        </div>
      </section>

      {somenteConsulta ? (
        <aside className="self-start rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
          <h3 className="text-sm font-black text-[#001a33]">Sem novas cobranças neste sistema</h3>
          <p className="mt-2 text-xs leading-relaxed text-amber-900">Esta turma veio em andamento com as cobranças administradas no sistema anterior. A geração e a edição de valores, desconto, juros e multa ficam bloqueadas.</p>
          <p className="mt-2 border-t border-amber-200 pt-2 text-[11px] leading-relaxed text-slate-600">O histórico já registrado continua disponível. Esta configuração não informa quitação.</p>
        </aside>
      ) : somenteSegundoCiclo ? (
        <aside className="self-start rounded-2xl border border-blue-100 bg-blue-50 p-4 shadow-sm">
          <h4 className="text-sm font-black text-[#001a33]">Somente o 2º ciclo</h4>
          <p className="mt-2 text-xs leading-relaxed text-slate-600">O 1º ciclo permanece no sistema anterior. Confira as datas e o total na prévia individual ao gerar o 2º ciclo.</p>
        </aside>
      ) : (
        <aside
          aria-labelledby="billing-schedule-title"
          className="flex max-h-[30rem] min-h-0 flex-col self-start rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:sticky lg:top-4"
        >
          <div className="mb-3 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <span className="grid size-7 place-items-center rounded-lg bg-blue-50 text-blue-600">
                <Calendar size={15} aria-hidden="true" />
              </span>
              <h3 id="billing-schedule-title" className="text-sm font-black tracking-tight text-[#001a33]">Cronograma de cobrança</h3>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
              {config.cobrarRematricula
                ? 'Matrícula, mensalidades e ciclos projetados do curso.'
                : 'O plano encerra após as mensalidades deste ciclo.'}
            </p>
          </div>
          <div className="custom-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {cronograma.length === 0 ? (
              <div className="flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-slate-500">
                <Calendar size={26} className="mb-2 opacity-50" aria-hidden="true" />
                <p className="text-center text-[11px] font-semibold">Nenhum cronograma gerado. Clique em Editar regras para criar.</p>
              </div>
            ) : cronograma.map((item) => {
              let badgeColor = 'bg-slate-100 text-slate-600';
              if (item.tipo === 'MATRICULA') badgeColor = 'bg-emerald-100 text-emerald-800';
              if (item.tipo === 'REMATRICULA') badgeColor = 'bg-amber-100 text-amber-800';

              const formattedDate = item.dataVencimento
                ? new Date(`${item.dataVencimento}T00:00:00`).toLocaleDateString('pt-BR', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                })
                : 'Sem data';

              return (
                <div key={item.id} className="rounded-xl border border-slate-200 px-3 py-2.5 transition-colors hover:border-blue-200 hover:bg-blue-50/30">
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 truncate text-[11px] font-black text-[#001a33]">{item.label}</p>
                    <span className="shrink-0 text-[11px] font-black tabular-nums text-slate-700"><PrivateCurrency value={item.valor} visible={valuesVisible} /></span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[9px] font-semibold text-slate-500">
                    <span className={`rounded px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider ${badgeColor}`}>
                      {item.numero ? `Mensalidade ${item.numero}` : item.tipo}
                    </span>
                    <span>Vencimento: {formattedDate}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>
      )}
    </div>
  );
};

export default FinanceiroConfigSummary;
