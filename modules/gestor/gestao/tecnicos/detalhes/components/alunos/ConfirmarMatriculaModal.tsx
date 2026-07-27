import React from 'react';
import { Calendar, CircleDollarSign, DollarSign, Percent, ReceiptText, X } from 'lucide-react';
import { Turma } from '../../../../gestao.types';
import { TurmaFinanceiroMatriculaConfig, PrevisaoFinanceiraTurma } from '../../turma-alunos.service';
import type { GatewayPaymentMethod } from '../../../../../../asaas/asaas.service';
import type { FinanceiroRulesCalculation } from '../financeiro/financeiro-config.utils';

export type EnrollmentStep = 'MATRICULA' | 'PARCELAS';

export interface EnrollmentFinance {
  valorMatricula: number;
  valorParcela: number;
  valorRematricula: number;
  descontoPontualidade: number;
  jurosAtraso: number;
  multaAtraso: number;
  dataVencimentoMatricula: string;
  diaVencimento: number;
}

interface ConfirmarMatriculaModalProps {
  turma: Turma;
  student: any;
  step: EnrollmentStep;
  finance: EnrollmentFinance;
  turmaFinanceiroConfig?: TurmaFinanceiroMatriculaConfig;
  previsao?: PrevisaoFinanceiraTurma;
  financialPreview?: FinanceiroRulesCalculation;
  financialPreviewLoading: boolean;
  financialPreviewError: boolean;
  enrollmentFlags: {
    financeiro_herdado: boolean;
    gerar_cobranca_inicial: boolean;
    gerar_cobranca_futura: boolean | null;
    sincronizar_asaas: boolean | null;
  };
  paymentMethod: GatewayPaymentMethod | null;
  availablePaymentMethods: GatewayPaymentMethod[];
  paymentOptionsLoading: boolean;
  paymentOptionsError: boolean;
  paymentOptionsEnvironment?: 'sandbox' | 'production';
  onFlagsChange: (next: {
    financeiro_herdado: boolean;
    gerar_cobranca_inicial: boolean;
    gerar_cobranca_futura: boolean | null;
    sincronizar_asaas: boolean | null;
  }) => void;
  onPaymentMethodChange: (method: GatewayPaymentMethod) => void;
  isPending: boolean;
  onStepChange: (step: EnrollmentStep) => void;
  onFinanceChange: (field: keyof EnrollmentFinance, value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);

const formatPercent = (value: number) => `${new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(Number(value) || 0)}%`;

const parseDecimalMask = (value: string) => {
  const digits = value.replace(/\D/g, '');
  return digits ? Number(digits) / 100 : 0;
};

const formatDate = (value: string) => value
  ? new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR')
  : 'sem data definida';

const getResumoPrevisao = (previsao?: PrevisaoFinanceiraTurma) => {
  if (!previsao) return 'A geração das parcelas seguirá a configuração da turma.';
  const quantidade = Number(previsao.quantidade_prevista || 0);
  return `${quantidade} parcelas previstas; geração ${previsao.gerar_cobrancas_futuras ? 'ativa' : 'inativa'}.`;
};

const PAYMENT_METHOD_OPTIONS: ReadonlyArray<{
  value: GatewayPaymentMethod;
  label: string;
}> = [
  { value: 'PIX', label: 'Pix' },
  { value: 'BOLETO', label: 'Boleto' },
  { value: 'CREDIT_CARD', label: 'Cartão de crédito' },
];

interface MoneyFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  helper?: string;
  className?: string;
}

const MoneyField: React.FC<MoneyFieldProps> = ({ label, value, onChange, helper, className = '' }) => (
  <label className={`space-y-2 ${className}`}>
    <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</span>
    <div className="relative">
      <CircleDollarSign size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-emerald-600" />
      <input
        type="text"
        inputMode="decimal"
        value={formatCurrency(value)}
        onChange={(event) => onChange(parseDecimalMask(event.target.value))}
        className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-3 text-sm font-black text-slate-700 outline-none transition-colors focus:border-emerald-500"
      />
    </div>
    {helper && <span className="block text-[10px] font-semibold text-slate-400">{helper}</span>}
  </label>
);

const PolicyBadge: React.FC<{ label: string; enabled: boolean }> = ({ label, enabled }) => (
  <span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-wide ${
    enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'
  }`}>
    {label}: {enabled ? 'sim' : 'não'}
  </span>
);

const ConfirmarMatriculaModal: React.FC<ConfirmarMatriculaModalProps> = ({
  turma,
  student,
  step,
  finance,
  turmaFinanceiroConfig,
  previsao,
  financialPreview,
  financialPreviewLoading,
  financialPreviewError,
  enrollmentFlags,
  paymentMethod,
  availablePaymentMethods,
  paymentOptionsLoading,
  paymentOptionsError,
  paymentOptionsEnvironment,
  onFlagsChange,
  onPaymentMethodChange,
  isPending,
  onStepChange,
  onFinanceChange,
  onClose,
  onConfirm,
}) => {
  const environmentLabel = (paymentOptionsEnvironment || 'sandbox').toUpperCase();
  const descontoMensalidade = Number(financialPreview?.desconto_aplicado || 0);
  const jurosMensais = Number(financialPreview?.juros_calculados || 0);
  const multaMensalidade = Number(financialPreview?.multa_aplicada || 0);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-[2rem] bg-white shadow-2xl">
        <div className="flex shrink-0 items-start justify-between bg-[#001a33] p-6 text-white">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-blue-300">Confirmação de matrícula</p>
            <h3 className="mt-1 text-xl font-black">{student.nome}</h3>
            <p className="mt-1 text-xs font-semibold text-blue-200">{turma.codigo || turma.nome}</p>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-blue-200 hover:bg-white/10" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="shrink-0 border-b border-slate-100 bg-slate-50 px-6 py-3">
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-200/70 p-1">
            <button
              onClick={() => onStepChange('MATRICULA')}
              className={`rounded-lg py-2 text-[10px] font-black uppercase ${step === 'MATRICULA' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500'}`}
            >
              1. Matrícula
            </button>
            <button
              onClick={() => onStepChange('PARCELAS')}
              className={`rounded-lg py-2 text-[10px] font-black uppercase ${step === 'PARCELAS' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500'}`}
            >
              2. Parcelas e regras
            </button>
          </div>
        </div>

        <div className="overflow-y-auto p-6">
          {step === 'MATRICULA' ? (
            <div className="space-y-5">
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
                <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-emerald-700">
                  <ReceiptText size={14} /> Cobrança de matrícula
                </p>
                <p className="mt-1 text-xs font-semibold leading-relaxed text-emerald-800">
                  Os dados abaixo vieram da turma. Qualquer alteração valerá somente para {student.nome}.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <MoneyField
                  label="Valor da matrícula"
                  value={finance.valorMatricula}
                  onChange={(value) => onFinanceChange('valorMatricula', String(value))}
                  helper="Valor individual da cobrança inicial"
                />
                <label className="space-y-2">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Vencimento da matrícula</span>
                  <div className="relative">
                    <Calendar size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-emerald-600" />
                    <input
                      type="date"
                      value={finance.dataVencimentoMatricula}
                      onChange={(event) => onFinanceChange('dataVencimentoMatricula', event.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-3 text-sm font-bold text-slate-700 outline-none focus:border-emerald-500"
                    />
                  </div>
                </label>
              </div>

              <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <label className="flex items-start gap-3 text-xs font-black uppercase tracking-wider text-slate-600">
                  <input
                    type="checkbox"
                    checked={enrollmentFlags.gerar_cobranca_inicial}
                    disabled={enrollmentFlags.financeiro_herdado}
                    onChange={(event) => onFlagsChange({
                      ...enrollmentFlags,
                      gerar_cobranca_inicial: event.target.checked,
                    })}
                    className="mt-0.5 h-4 w-4"
                  />
                  <span>Gerar cobrança da matrícula <small className="mt-1 block text-[10px] font-semibold normal-case tracking-normal text-slate-400">{formatCurrency(finance.valorMatricula)} em {formatDate(finance.dataVencimentoMatricula)}</small></span>
                </label>
                <label className="flex items-start gap-3 text-xs font-black uppercase tracking-wider text-slate-600">
                  <input
                    type="checkbox"
                    checked={enrollmentFlags.financeiro_herdado}
                    onChange={(event) => onFlagsChange({
                      ...enrollmentFlags,
                      financeiro_herdado: event.target.checked,
                      gerar_cobranca_inicial: !event.target.checked,
                    })}
                    className="mt-0.5 h-4 w-4"
                  />
                  <span>Financeiro herdado <small className="mt-1 block text-[10px] font-semibold normal-case tracking-normal text-slate-400">Não cria uma nova cobrança inicial.</small></span>
                </label>
              </div>

              {enrollmentFlags.gerar_cobranca_inicial && !enrollmentFlags.financeiro_herdado && (
                <fieldset className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
                  <legend className="px-1 text-[10px] font-black uppercase tracking-wider text-blue-700">
                    Método da cobrança inicial
                  </legend>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    {PAYMENT_METHOD_OPTIONS.filter((option) =>
                      enrollmentFlags.sincronizar_asaas === false
                      || availablePaymentMethods.includes(option.value)
                    ).map((option) => (
                      <label
                        key={option.value}
                        className={`cursor-pointer rounded-xl border px-3 py-3 text-center text-[10px] font-black uppercase tracking-wide transition-colors ${
                          paymentMethod === option.value
                            ? 'border-blue-500 bg-blue-600 text-white'
                            : 'border-blue-100 bg-white text-slate-600 hover:border-blue-300'
                        }`}
                      >
                        <input
                          type="radio"
                          name="enrollment-payment-method"
                          value={option.value}
                          checked={paymentMethod === option.value}
                          onChange={() => onPaymentMethodChange(option.value)}
                          className="sr-only"
                        />
                        {option.label}
                      </label>
                    ))}
                  </div>
                  <p className={`mt-2 text-[10px] font-semibold ${paymentMethod ? 'text-blue-600' : 'text-amber-700'}`}>
                    {paymentOptionsLoading
                      ? 'Validando rotas e credenciais deste ambiente...'
                      : paymentOptionsError
                        ? 'Não foi possível validar as rotas bancárias.'
                          : enrollmentFlags.sincronizar_asaas !== false && availablePaymentMethods.length === 0
                          ? `Ambiente atual: ${environmentLabel}. Nenhum método possui rota ativa e credencial pronta aqui.`
                          : paymentMethod
                      ? 'A rota bancária será resolvida pelo método escolhido.'
                      : 'Escolha um método para criar a cobrança inicial.'}
                  </p>
                </fieldset>
              )}

              <div className="flex gap-3 pt-2">
                <button onClick={onClose} className="flex-1 rounded-xl border border-slate-200 py-3 text-xs font-black uppercase text-slate-500">
                  Cancelar
                </button>
                <button
                  onClick={() => onStepChange('PARCELAS')}
                  className="flex-[1.4] rounded-xl bg-emerald-600 py-3 text-xs font-black uppercase text-white hover:bg-emerald-700"
                >
                  Continuar para parcelas
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
                <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-blue-700">
                  <DollarSign size={14} /> Parcelas do aluno
                </p>
                <p className="mt-1 text-xs font-semibold leading-relaxed text-blue-800">
                  Valores herdados da turma. Ajuste aqui somente quando este aluno tiver uma condição diferente.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <MoneyField
                  label="Valor da mensalidade"
                  value={finance.valorParcela}
                  onChange={(value) => onFinanceChange('valorParcela', String(value))}
                  helper={turmaFinanceiroConfig
                    ? `${turmaFinanceiroConfig.qtdParcelas} parcelas por ciclo`
                    : 'Quantidade definida na configuração da turma'}
                />
                <label className="space-y-2">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Dia das mensalidades</span>
                  <select
                    value={finance.diaVencimento}
                    onChange={(event) => onFinanceChange('diaVencimento', event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm font-bold text-slate-700 outline-none focus:border-emerald-500"
                  >
                    {[5, 10, 15, 20, 25, 28].map((day) => (
                      <option key={day} value={day}>Todo dia {String(day).padStart(2, '0')}</option>
                    ))}
                  </select>
                </label>
                <MoneyField
                  label="Valor da rematrícula"
                  value={finance.valorRematricula}
                  onChange={(value) => onFinanceChange('valorRematricula', String(value))}
                  className="md:col-span-2"
                />
              </div>

              <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4">
                <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-amber-700">
                  <Percent size={14} /> Desconto, juros e multa
                </p>
                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <MoneyField
                    label="Desconto pontualidade"
                    value={finance.descontoPontualidade}
                    onChange={(value) => onFinanceChange('descontoPontualidade', String(value))}
                  />
                  <label className="space-y-2">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Juros ao mês</span>
                    <div className="relative">
                      <Percent size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-amber-600" />
                      <input
                        type="text"
                        inputMode="decimal"
                        value={formatPercent(finance.jurosAtraso)}
                        onChange={(event) => onFinanceChange('jurosAtraso', String(parseDecimalMask(event.target.value)))}
                        className="w-full rounded-xl border border-amber-200 bg-white py-3 pl-10 pr-3 text-sm font-black text-slate-700 outline-none focus:border-amber-500"
                      />
                    </div>
                  </label>
                  <MoneyField
                    label="Multa por atraso"
                    value={finance.multaAtraso}
                    onChange={(value) => onFinanceChange('multaAtraso', String(value))}
                  />
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <PolicyBadge label="Desc. matrícula" enabled={turmaFinanceiroConfig?.aplicarDescontoMatricula === true} />
                  <PolicyBadge label="Desc. mensalidades" enabled={turmaFinanceiroConfig?.aplicarDescontoMensalidade !== false} />
                  <PolicyBadge label="Desc. rematrícula" enabled={turmaFinanceiroConfig?.aplicarDescontoRematricula !== false} />
                  <PolicyBadge label="Encargos matrícula" enabled={turmaFinanceiroConfig?.aplicarMultaJurosMatricula !== false} />
                  <PolicyBadge label="Encargos mensalidades" enabled={turmaFinanceiroConfig?.aplicarMultaJurosMensalidade !== false} />
                  <PolicyBadge label="Encargos rematrícula" enabled={turmaFinanceiroConfig?.aplicarMultaJurosRematricula !== false} />
                </div>
              </div>

              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                <p className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Resumo financeiro individual</p>
                <div className="mt-3 grid gap-2 text-xs font-bold text-emerald-900 md:grid-cols-3">
                  <div className="rounded-xl bg-white/70 p-3"><span className="block text-[9px] uppercase text-emerald-600">Matrícula</span>{formatCurrency(finance.valorMatricula)}</div>
                  <div className="rounded-xl bg-white/70 p-3">
                    <span className="block text-[9px] uppercase text-emerald-600">Mensalidade em dia</span>
                    {financialPreview ? formatCurrency(financialPreview.valor_com_desconto) : 'Calculando no servidor...'}
                  </div>
                  <div className="rounded-xl bg-white/70 p-3">
                    <span className="block text-[9px] uppercase text-rose-500">Após 1 mês</span>
                    {financialPreview ? formatCurrency(financialPreview.valor_com_atraso) : 'Calculando no servidor...'}
                  </div>
                </div>
                <p className="mt-3 text-[10px] font-semibold leading-relaxed text-emerald-700">
                  Mensalidade de {formatCurrency(finance.valorParcela)}; desconto aplicado de {formatCurrency(descontoMensalidade)}; juros configurados de {formatPercent(finance.jurosAtraso)} ({formatCurrency(jurosMensais)}) e multa aplicada de {formatCurrency(multaMensalidade)}. {getResumoPrevisao(previsao)}
                </p>
                {financialPreviewLoading && (
                  <p className="mt-2 text-[10px] font-bold text-blue-700">Atualizando a prévia oficial no servidor...</p>
                )}
                {financialPreviewError && (
                  <p className="mt-2 text-[10px] font-bold text-rose-700">A prévia oficial está indisponível; a confirmação foi bloqueada.</p>
                )}
                <div className="mt-3 grid gap-2 md:grid-cols-3">
                  <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-emerald-700">
                    <input
                      type="checkbox"
                      checked={enrollmentFlags.gerar_cobranca_futura ?? false}
                      onChange={(event) => onFlagsChange({ ...enrollmentFlags, gerar_cobranca_futura: event.target.checked })}
                    />
                    Gerar parcelas
                  </label>
                  <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-emerald-700">
                    <input
                      type="checkbox"
                      checked={enrollmentFlags.sincronizar_asaas ?? true}
                      onChange={(event) => onFlagsChange({ ...enrollmentFlags, sincronizar_asaas: event.target.checked })}
                    />
                    Sincronizar no gateway
                  </label>
                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700">
                    Rematrícula {formatCurrency(finance.valorRematricula)}
                  </span>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={() => onStepChange('MATRICULA')} className="flex-1 rounded-xl border border-slate-200 py-3 text-xs font-black uppercase text-slate-500">
                  Voltar
                </button>
                <button
                  onClick={onConfirm}
                  disabled={isPending}
                  className="flex-[1.4] rounded-xl bg-emerald-600 py-3 text-xs font-black uppercase text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {isPending ? 'Gerando...' : 'Confirmar e gerar'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ConfirmarMatriculaModal;
