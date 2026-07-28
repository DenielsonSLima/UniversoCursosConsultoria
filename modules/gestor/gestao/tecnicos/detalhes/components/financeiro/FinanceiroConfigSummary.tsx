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
  onEdit: () => void;
  turmaLabel: string;
}

const FinanceiroConfigSummary: React.FC<FinanceiroConfigSummaryProps> = ({
  calculo,
  config,
  cronograma,
  onEdit,
  turmaLabel,
}) => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
    <div className="lg:col-span-2 bg-white border border-slate-100 rounded-[2rem] p-8 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between">
      <div>
        <div className="flex justify-between items-start mb-8">
          <div>
            <h3 className="text-lg font-black text-[#001a33] uppercase tracking-tight">Regras Financeiras</h3>
            <p className="text-slate-500 text-sm">Parâmetros aplicados a todos os alunos desta turma.</p>
          </div>
          <button
            onClick={onEdit}
            className="flex items-center gap-2 px-4 py-2 bg-slate-50 text-blue-600 rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-blue-50 transition-colors border border-slate-100"
          >
            <Edit2 size={14} /> Editar
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
          <div className="space-y-1">
            <p className="text-[10px] text-slate-400 font-bold uppercase flex items-center gap-1">
              <DollarSign size={10} /> Matrícula
            </p>
            <p className="text-lg font-black text-[#001a33]">{formatCurrencyBRL(config.valorMatricula)}</p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] text-slate-400 font-bold uppercase flex items-center gap-1">
              <Calendar size={10} /> Plano
            </p>
            <p className="text-lg font-black text-[#001a33]">{config.qtdParcelas}x por ciclo</p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] text-slate-400 font-bold uppercase flex items-center gap-1">
              <Calendar size={10} /> Vencimento Padrão
            </p>
            <p className="text-lg font-black text-[#001a33]">Dia {String(config.diaVencimentoPadrao).padStart(2, '0')}</p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] text-slate-400 font-bold uppercase flex items-center gap-1">
              <DollarSign size={10} /> Mensalidade
            </p>
            <p className="text-lg font-black text-[#001a33]">{formatCurrencyBRL(config.valorParcela)}</p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] text-amber-600 font-bold uppercase flex items-center gap-1">
              <RefreshCw size={10} /> Rematrícula
            </p>
            <p className="text-lg font-black text-amber-600">{formatCurrencyBRL(config.valorRematricula)}</p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] text-emerald-600 font-bold uppercase flex items-center gap-1">
              <Percent size={10} /> Desconto
            </p>
            <p className="text-lg font-black text-emerald-600">- {formatCurrencyBRL(config.descontoPontualidade)}</p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] text-red-500 font-bold uppercase flex items-center gap-1">
              <AlertCircle size={10} /> Juros proporcional
            </p>
            <p className="text-lg font-black text-red-500">{config.jurosAtraso}% ao mês</p>
            <p className="text-[10px] font-semibold leading-relaxed text-slate-500">
              {calculo
                ? `${formatPercentageBR(calculo.juros_percentual_dia)}% ao dia ≈ ${formatCurrencyBRL(calculo.juros_valor_dia)}/dia no boleto/carnê`
                : 'Calculando equivalente diário...'}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] text-red-500 font-bold uppercase flex items-center gap-1">
              <AlertCircle size={10} /> Multa única
            </p>
            <p className="text-lg font-black text-red-500">{config.multaAtrasoPercentual}%</p>
            <p className="text-[10px] font-semibold leading-relaxed text-slate-500">
              {calculo
                ? `${formatCurrencyBRL(calculo.multa_aplicada)} uma única vez`
                : 'Calculando multa em reais...'}
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-2 rounded-2xl border border-slate-100 bg-slate-50 p-4 md:grid-cols-3">
          {FINANCEIRO_POLICIES.map((policy) => (
            <div key={policy.label} className="rounded-xl bg-white p-3">
              <p className="text-[10px] font-black uppercase text-[#001a33]">{policy.label}</p>
              <p className="mt-1 text-[10px] font-bold uppercase text-slate-500">
                Desc: {config[policy.descontoKey] ? 'sim' : 'não'} · Multa/Juros: {config[policy.multaKey] ? 'sim' : 'não'}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
          <div className="flex items-start gap-3">
            <FileText size={18} className="mt-0.5 shrink-0 text-amber-700" />
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-wider text-amber-800">
                Impresso no boleto e no carnê
              </p>
              <p className="mt-1 text-xs font-bold text-[#001a33]">Turma: {turmaLabel}</p>
              <p className="mt-1 text-xs font-extrabold leading-relaxed text-amber-900">
                {config.instrucaoBoletoCarne}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 pt-6 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-5 flex flex-col justify-between">
          <div>
            <span className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider block mb-1">Se pago até o vencimento (Com Desconto - RPC)</span>
            <p className="text-slate-500 text-xs font-medium">Valor da parcela com desconto de pontualidade aplicado</p>
          </div>
          <div className="mt-4 flex justify-between items-baseline">
            <span className="text-xs text-slate-400 font-bold">VALOR FINAL</span>
            <span className="text-xl font-black text-emerald-700">
              {calculo
                ? formatCurrencyBRL(calculo.valor_com_desconto)
                : 'Calculando no servidor...'}
            </span>
          </div>
        </div>

        <div className="bg-rose-50/50 border border-rose-100 rounded-2xl p-5 flex flex-col justify-between">
          <div>
            <span className="text-[10px] text-rose-600 font-bold uppercase tracking-wider block mb-1">Se pago após o vencimento (Exemplo com 30 dias de atraso - RPC)</span>
            <p className="text-slate-500 text-xs font-medium">
              Parcela + juros diário de {calculo
                ? formatCurrencyBRL(calculo.juros_valor_dia)
                : 'calculando...'} ({config.jurosAtraso}% ao mês proporcional aos dias) + multa única de {config.multaAtrasoPercentual}% ({calculo
                  ? formatCurrencyBRL(calculo.multa_aplicada)
                  : 'calculando...'})
            </p>
          </div>
          <div className="mt-4 flex justify-between items-baseline">
            <span className="text-xs text-slate-400 font-bold">VALOR FINAL</span>
            <span className="text-xl font-black text-rose-700">
              {calculo
                ? formatCurrencyBRL(calculo.valor_com_atraso)
                : 'Calculando no servidor...'}
            </span>
          </div>
        </div>
      </div>
    </div>

    <div className="bg-white border border-slate-100 rounded-[2rem] p-8 shadow-sm hover:shadow-md transition-shadow flex flex-col max-h-[500px]">
      <div className="mb-4">
        <h3 className="text-lg font-black text-[#001a33] uppercase tracking-tight">Cronograma de Cobrança</h3>
        <p className="text-slate-500 text-xs mt-0.5">Matrícula, mensalidades e rematrícula estimadas.</p>
      </div>
      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-2.5">
        {cronograma.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 py-12">
            <Calendar size={32} className="mb-2 opacity-50" />
            <p className="text-xs font-semibold text-center">Nenhum cronograma gerado. Clique em Editar para criar.</p>
          </div>
        ) : cronograma.map((item, index) => {
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
            <div key={item.id} className="flex justify-between items-center p-3 rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors shadow-sm">
              <div className="min-w-0 flex-1 pr-2">
                <p className="text-xs font-bold text-[#001a33] truncate">{item.label}</p>
                <p className="text-[10px] text-slate-500 font-semibold mt-0.5 flex items-center gap-1.5">
                  <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${badgeColor}`}>Mês {index + 1}</span>
                  <span>Vencimento: {formattedDate}</span>
                </p>
              </div>
              <span className="font-mono font-bold text-xs text-slate-700 shrink-0">
                {formatCurrencyBRL(item.valor)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
    </div>
  );
};

export default FinanceiroConfigSummary;
