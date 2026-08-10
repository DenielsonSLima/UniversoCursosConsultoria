import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Check,
  CheckCircle2,
  Clock3,
  KeyRound,
  Loader2,
  LockKeyhole,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { Turma } from '../../../../gestao.types';
import { mapConfigToRegraTecnicaInput } from '../financeiro/financeiro-config.service';
import { useAccessibleDialog } from '../financeiro/hooks/useAccessibleDialog';
import { usePreverRegraFinanceiraTecnica } from '../financeiro/hooks/useMatriculaTecnicaFinanceiro';
import {
  useTechnicalConditionCodeStatus,
  useValidateTechnicalConditionCode,
} from '../financeiro/hooks/useTechnicalConditionAuthorization';
import type {
  CondicaoIndividualMotivo,
  MatriculaTecnicaOverrideInput,
  MatriculaTecnicaRegra,
  MatriculaTecnicaRegraIdentidade,
} from '../financeiro/matricula-tecnica-financeiro.types';
import {
  applyTechnicalEnrollmentCondition,
  buildTechnicalEnrollmentOverride,
  createTechnicalEnrollmentConditionDraft,
  hasTechnicalEnrollmentOverride,
  validateTechnicalEnrollmentCondition,
  type TechnicalEnrollmentConditionDraft,
} from './technical-enrollment-condition';

export type EnrollmentFinanceIntent = 'PENDENTE' | 'AGORA' | 'AGENDADA';

export interface EnrollmentFinanceSubmission {
  intent: EnrollmentFinanceIntent;
  primeiroVencimento: string;
  ativarEm: string;
  override: MatriculaTecnicaOverrideInput | null;
  codigoAutorizacao: string | null;
  motivo: CondicaoIndividualMotivo | null;
  justificativa: string | null;
}

interface ConfirmarMatriculaModalProps {
  turma: Turma;
  student: { id: string; nome: string };
  regra?: MatriculaTecnicaRegraIdentidade;
  canManageFinanceiro: boolean;
  loading: boolean;
  error: boolean;
  retrying: boolean;
  isPending: boolean;
  onRetry: () => void;
  onClose: () => void;
  onConfirm: (submission: EnrollmentFinanceSubmission) => void;
}

const STEPS = ['Plano da turma', 'Condição individual', 'Simulação e vencimento', 'Confirmação'];

const formatMoney = (value: string | number) => new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
}).format(Number(value) || 0);

const formatPercent = (value: string | number, maximumFractionDigits = 4) => (
  new Intl.NumberFormat('pt-BR', { maximumFractionDigits }).format(Number(value) || 0)
);

const parseCurrencyInput = (value: string) => {
  const digits = value.replace(/\D/g, '');
  return digits ? Number(digits) / 100 : 0;
};

const CurrencyInput: React.FC<{
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}> = ({ value, onChange, disabled = false }) => (
  <input
    type="text"
    inputMode="numeric"
    disabled={disabled}
    value={formatMoney(value)}
    onFocus={(event) => event.currentTarget.select()}
    onChange={(event) => onChange(parseCurrencyInput(event.target.value))}
    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold text-slate-700 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 disabled:bg-slate-100"
  />
);

const intentOptions: Array<{
  value: EnrollmentFinanceIntent;
  title: string;
  description: string;
  icon: React.ReactNode;
}> = [
  {
    value: 'PENDENTE',
    title: 'Somente vincular',
    description: 'Registra o aluno na turma e não cria cobrança.',
    icon: <Clock3 size={18} />,
  },
  {
    value: 'AGORA',
    title: 'Gerar matrícula agora',
    description: 'Cria somente a cobrança inicial da matrícula. As mensalidades vêm após a baixa.',
    icon: <ReceiptText size={18} />,
  },
  {
    value: 'AGENDADA',
    title: 'Agendar geração',
    description: 'Registra o vínculo e agenda a criação da cobrança inicial.',
    icon: <CalendarClock size={18} />,
  },
];

const motivoLabels: Record<CondicaoIndividualMotivo, string> = {
  BOLSA: 'Bolsa parcial',
  CONVENIO: 'Convênio',
  INCENTIVO: 'Incentivo',
  NEGOCIACAO: 'Negociação autorizada',
  OUTRO: 'Outro',
};

const ConfirmarMatriculaModal: React.FC<ConfirmarMatriculaModalProps> = ({
  turma,
  student,
  regra,
  canManageFinanceiro,
  loading,
  error,
  retrying,
  isPending,
  onRetry,
  onClose,
  onConfirm,
}) => {
  const { dialogRef, initialFocusRef } = useAccessibleDialog(true, onClose, isPending);
  const regraCompleta = regra && 'valorMatricula' in regra ? regra as MatriculaTecnicaRegra : null;
  const [step, setStep] = useState(0);
  const [intent, setIntent] = useState<EnrollmentFinanceIntent>('PENDENTE');
  const [primeiroVencimento, setPrimeiroVencimento] = useState('');
  const [ativarEm, setAtivarEm] = useState('');
  const [individual, setIndividual] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [codigoAutorizado, setCodigoAutorizado] = useState(false);
  const [motivo, setMotivo] = useState<CondicaoIndividualMotivo>('BOLSA');
  const [justificativa, setJustificativa] = useState('');
  const [draft, setDraft] = useState<TechnicalEnrollmentConditionDraft | null>(null);
  const [stepError, setStepError] = useState('');
  const codeStatusQuery = useTechnicalConditionCodeStatus(
    turma.id,
    canManageFinanceiro && Boolean(regraCompleta),
  );
  const validateCodeMutation = useValidateTechnicalConditionCode();

  useEffect(() => {
    if (!regraCompleta) return;
    setPrimeiroVencimento((current) => current || regraCompleta.primeiroVencimentoSugerido);
    setDraft((current) => current || createTechnicalEnrollmentConditionDraft(regraCompleta));
  }, [regraCompleta]);

  const previewInput = useMemo(() => {
    if (!regraCompleta || !draft) return null;
    return mapConfigToRegraTecnicaInput(applyTechnicalEnrollmentCondition(regraCompleta, draft));
  }, [draft, regraCompleta]);
  const previewQuery = usePreverRegraFinanceiraTecnica(
    {
      turmaId: turma.id,
      regra: previewInput || {
        cobrarMatricula: true,
        valorMatricula: '1',
        qtdMensalidades: 1,
        valorMensalidade: '1',
        cobrarRematricula: false,
        valorRematricula: '0',
        diaVencimento: 10,
        descontoPontualidade: '0',
        jurosAtrasoPercentual: '0',
        multaAtrasoPercentual: '0',
        aplicarDescontoMatricula: false,
        aplicarMultaJurosMatricula: false,
        aplicarDescontoMensalidade: false,
        aplicarMultaJurosMensalidade: false,
        aplicarDescontoRematricula: false,
        aplicarMultaJurosRematricula: false,
        instrucaoBoleto: 'Sem instrução individual.',
      },
    },
    Boolean(individual && codigoAutorizado && previewInput),
  );
  const effectiveRule = individual ? previewQuery.data || null : regraCompleta;
  const override = regraCompleta && draft
    ? buildTechnicalEnrollmentOverride(regraCompleta, draft)
    : null;
  const monthlySimulation = effectiveRule?.cronogramaCiclo.find((item) => item.tipo === 'MENSALIDADE');
  const nominalCourseTotal = regraCompleta
    ? Number(regraCompleta.curso?.totalNominal ?? (
      (regraCompleta.cobranca.matricula.habilitada ? Number(regraCompleta.valorMatricula) : 0)
      + (regraCompleta.mensalidadesPorCiclo * Number(regraCompleta.valorMensalidade))
      + (regraCompleta.cobranca.rematricula.habilitada
        ? Number(regraCompleta.valorRematricula)
          + (regraCompleta.mensalidadesPorCiclo * Number(regraCompleta.valorMensalidade))
        : 0)
    ))
    : 0;

  const validateCurrentStep = () => {
    if (step === 1 && individual) {
      if (codeStatusQuery.isError) return 'Não foi possível consultar a proteção da turma. Tente novamente.';
      if (!codeStatusQuery.data?.configurado) return 'Configure o código de autorização na turma antes de aplicar uma condição individual.';
      if (!codigoAutorizado) return 'Valide o código para liberar os campos da condição individual.';
      if (!draft) return 'A regra individual ainda não foi carregada.';
      const draftError = validateTechnicalEnrollmentCondition(draft, regraCompleta);
      if (draftError) return draftError;
      if (!override || !hasTechnicalEnrollmentOverride(override)) return 'Altere pelo menos um valor em relação à regra da turma.';
      if (motivo === 'OUTRO' && justificativa.trim().length < 5) return 'Descreva o motivo da condição individual.';
      if (previewQuery.isLoading) return 'Aguarde a simulação oficial da condição individual.';
      if (previewQuery.isError || !previewQuery.data) return 'A simulação oficial não foi confirmada. Revise os valores e tente novamente.';
    }
    if (step === 2 && canManageFinanceiro && !primeiroVencimento) {
      return 'Informe o primeiro vencimento desta matrícula.';
    }
    if (step === 3 && intent === 'AGENDADA' && !ativarEm) {
      return 'Informe quando a cobrança inicial deve ser gerada.';
    }
    return null;
  };

  const advance = () => {
    const validation = validateCurrentStep();
    if (validation) {
      setStepError(validation);
      return;
    }
    setStepError('');
    setStep((current) => Math.min(STEPS.length - 1, current + 1));
  };

  const authorizeCode = async () => {
    if (!codigo.trim()) {
      setStepError('Digite o código de autorização.');
      return;
    }
    if (motivo === 'OUTRO' && justificativa.trim().length < 5) {
      setStepError('Descreva o motivo da condição individual.');
      return;
    }
    try {
      const result = await validateCodeMutation.mutateAsync({
        turmaId: turma.id,
        alunoId: student.id,
        codigo,
        motivo,
        justificativa: justificativa.trim() || null,
      });
      if (!result.autorizado) {
        setCodigoAutorizado(false);
        setStepError(result.motivo === 'BLOQUEADO'
          ? 'Muitas tentativas. Aguarde o período de bloqueio antes de tentar novamente.'
          : result.motivo === 'NAO_CONFIGURADO'
            ? 'A turma ainda não possui código de autorização configurado.'
            : `Código não aceito.${result.tentativasRestantes == null ? '' : ` Restam ${result.tentativasRestantes} tentativa(s).`}`);
        return;
      }
      setCodigoAutorizado(true);
      setStepError('');
    } catch (validationError) {
      setCodigoAutorizado(false);
      setStepError(validationError instanceof Error ? validationError.message : 'Não foi possível validar o código.');
    }
  };

  const submit = () => {
    const validation = validateCurrentStep();
    if (validation) {
      setStepError(validation);
      return;
    }
    onConfirm({
      intent: canManageFinanceiro ? intent : 'PENDENTE',
      primeiroVencimento: canManageFinanceiro ? primeiroVencimento : '',
      ativarEm: canManageFinanceiro ? ativarEm : '',
      override: individual && override && hasTechnicalEnrollmentOverride(override) ? override : null,
      codigoAutorizacao: individual ? codigo : null,
      motivo: individual ? motivo : null,
      justificativa: individual ? justificativa.trim() || null : null,
    });
  };

  const renderPlan = () => (
    <div className="space-y-5">
      <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
        <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-blue-700"><CheckCircle2 size={15} /> Regra oficial da turma · revisão {regra?.revisao}</p>
        <p className="mt-2 text-[11px] font-semibold leading-relaxed text-blue-900">Os valores, encargos e datas abaixo vieram do financeiro da turma. Nenhuma cobrança é criada enquanto você apenas navega por estas etapas.</p>
      </div>
      {regraCompleta ? (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            {[
              ['1', 'Matrícula', regraCompleta.cobranca.matricula.habilitada ? formatMoney(regraCompleta.cobranca.matricula.valor) : 'Isenta'],
              ['2', `Ciclo 1 · ${regraCompleta.mensalidadesPorCiclo} mens.`, `${regraCompleta.mensalidadesPorCiclo}x ${formatMoney(regraCompleta.valorMensalidade)}`],
              ['3', 'Rematrícula', regraCompleta.cobranca.rematricula.habilitada ? formatMoney(regraCompleta.valorRematricula) : 'Não cobrar'],
              ['4', `Ciclo 2 · ${regraCompleta.mensalidadesPorCiclo} mens.`, regraCompleta.cobranca.rematricula.habilitada ? `${regraCompleta.mensalidadesPorCiclo}x ${formatMoney(regraCompleta.valorMensalidade)}` : 'Curso encerra no ciclo 1'],
            ].map(([number, title, value]) => (
              <div key={number} className="relative rounded-2xl border border-slate-200 bg-white p-4">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#001a33] text-[10px] font-black text-white">{number}</span>
                <p className="mt-3 text-[10px] font-black uppercase text-slate-500">{title}</p>
                <p className="mt-1 text-sm font-black text-[#001a33]">{value}</p>
              </div>
            ))}
          </div>
          <div className="rounded-2xl bg-[#001a33] p-5 text-white">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div><p className="text-[10px] font-black uppercase tracking-wider text-blue-200">Composição do curso</p><p className="mt-1 text-xs font-semibold text-slate-300">A rematrícula separa os dois ciclos e não abre um terceiro ciclo.</p></div>
              <div className="sm:text-right"><p className="text-[9px] font-black uppercase text-blue-200">Total nominal do curso</p><p className="mt-1 text-2xl font-black">{formatMoney(nominalCourseTotal)}</p></div>
            </div>
          </div>
        </>
      ) : (
        <p className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs font-semibold text-slate-600">Seu acesso permite somente o vínculo acadêmico. Valores e geração ficam disponíveis para quem possui a aba Financeiro.</p>
      )}
    </div>
  );

  const renderCondition = () => (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-2">
        <button type="button" onClick={() => { setIndividual(false); setStepError(''); }} className={`rounded-2xl border p-4 text-left ${!individual ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white'}`}>
          <span className="flex items-center gap-2 text-xs font-black uppercase text-[#001a33]"><ShieldCheck size={17} /> Usar regra da turma</span>
          <span className="mt-2 block text-[11px] font-semibold text-slate-600">Mantém exatamente os valores oficiais apresentados na etapa anterior.</span>
        </button>
        <button type="button" disabled={!canManageFinanceiro || !regraCompleta} onClick={() => { setIndividual(true); setStepError(''); }} className={`rounded-2xl border p-4 text-left disabled:cursor-not-allowed disabled:opacity-50 ${individual ? 'border-violet-500 bg-violet-50' : 'border-slate-200 bg-white'}`}>
          <span className="flex items-center gap-2 text-xs font-black uppercase text-[#001a33]"><Sparkles size={17} /> Bolsa, incentivo ou valor especial</span>
          <span className="mt-2 block text-[11px] font-semibold text-slate-600">Exige o código da turma e registra o motivo da exceção.</span>
        </button>
      </div>

      {individual ? (
        <div className="rounded-2xl border border-violet-100 bg-violet-50/50 p-5">
          {codeStatusQuery.isError ? (
            <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-800">Não foi possível consultar a proteção da turma. <button type="button" onClick={() => { void codeStatusQuery.refetch(); }} className="underline">Tentar novamente</button>.</div>
          ) : !codeStatusQuery.data?.configurado && !codeStatusQuery.isLoading ? (
            <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-900">Condição individual indisponível: defina o código em Configurações da turma.</p>
          ) : null}
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-[9px] font-black uppercase text-violet-700">Motivo</span>
              <select value={motivo} onChange={(event) => { setMotivo(event.target.value as CondicaoIndividualMotivo); setCodigoAutorizado(false); }} className="w-full rounded-xl border border-violet-100 bg-white px-3 py-3 text-sm font-bold outline-none focus:border-violet-500">
                {Object.entries(motivoLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="text-[9px] font-black uppercase text-violet-700">Código de autorização</span>
              <div className="flex gap-2">
                <input type="password" autoComplete="off" value={codigo} onChange={(event) => { setCodigo(event.target.value); setCodigoAutorizado(false); setStepError(''); }} className="min-w-0 flex-1 rounded-xl border border-violet-100 bg-white px-3 py-3 text-sm font-bold outline-none focus:border-violet-500" />
                <button type="button" onClick={() => { void authorizeCode(); }} disabled={validateCodeMutation.isPending || codeStatusQuery.isError || !codeStatusQuery.data?.configurado} className="inline-flex items-center gap-2 rounded-xl bg-violet-700 px-4 text-[10px] font-black uppercase text-white disabled:opacity-50">{validateCodeMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />} Validar</button>
              </div>
            </label>
          </div>
          <label className="mt-3 block space-y-1.5">
            <span className="text-[9px] font-black uppercase text-violet-700">Justificativa {motivo === 'OUTRO' ? '(obrigatória)' : '(opcional)'}</span>
            <input value={justificativa} maxLength={300} onChange={(event) => { setJustificativa(event.target.value); setCodigoAutorizado(false); }} placeholder="Ex.: bolsa institucional de 30%" className="w-full rounded-xl border border-violet-100 bg-white px-3 py-3 text-sm font-semibold outline-none focus:border-violet-500" />
          </label>

          {codigoAutorizado && draft && regraCompleta ? (
            <div className="mt-5 border-t border-violet-100 pt-5">
              <p className="flex items-center gap-2 text-[10px] font-black uppercase text-emerald-700"><CheckCircle2 size={15} /> Código validado · campos liberados</p>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <label className="space-y-1.5"><span className="text-[9px] font-black uppercase text-slate-500">Matrícula individual</span><CurrencyInput disabled={!draft.cobrarMatricula} value={draft.valorMatricula} onChange={(value) => setDraft({ ...draft, valorMatricula: value })} /><label className="flex items-center gap-2 text-[10px] font-bold text-slate-600"><input type="checkbox" checked={!draft.cobrarMatricula} onChange={(event) => setDraft({ ...draft, cobrarMatricula: !event.target.checked })} /> Isentar matrícula</label></label>
                <label className="space-y-1.5"><span className="text-[9px] font-black uppercase text-slate-500">Mensalidade individual</span><CurrencyInput value={draft.valorMensalidade} onChange={(value) => setDraft({ ...draft, valorMensalidade: value })} /><span className="block text-[9px] font-semibold text-slate-400">Turma: {formatMoney(regraCompleta.valorMensalidade)}</span></label>
                <label className="space-y-1.5"><span className="text-[9px] font-black uppercase text-slate-500">Rematrícula individual</span><CurrencyInput disabled={!draft.cobrarRematricula} value={draft.valorRematricula} onChange={(value) => setDraft({ ...draft, valorRematricula: value })} /><span className="block text-[9px] font-semibold text-slate-400">Pode reduzir o valor; a rematrícula continua separando os dois ciclos.</span></label>
                <label className="space-y-1.5 md:col-span-2"><span className="text-[9px] font-black uppercase text-slate-500">Desconto adicional pagando em dia</span><CurrencyInput value={draft.descontoPontualidade} onChange={(value) => setDraft({ ...draft, descontoPontualidade: value })} /><span className="block text-[9px] font-semibold text-slate-400">Não altera juros, multa, ciclos nem o dia de vencimento da turma.</span></label>
                <button type="button" onClick={() => setDraft(createTechnicalEnrollmentConditionDraft(regraCompleta))} className="self-end rounded-xl border border-slate-200 px-4 py-3 text-[10px] font-black uppercase text-slate-600">Restaurar regra da turma</button>
              </div>
            </div>
          ) : (
            <div className="mt-5 flex items-center gap-2 rounded-xl border border-violet-100 bg-white p-4 text-xs font-bold text-violet-800"><LockKeyhole size={16} /> Valide o código para editar os valores deste aluno.</div>
          )}
        </div>
      ) : null}
    </div>
  );

  const renderSimulation = () => (
    <div className="space-y-5">
      {individual && previewQuery.isLoading ? <p className="flex items-center gap-2 rounded-xl bg-slate-50 p-4 text-xs font-bold text-slate-500"><Loader2 size={16} className="animate-spin" /> Calculando a condição individual no servidor...</p> : null}
      {monthlySimulation ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5">
            <p className="text-[10px] font-black uppercase text-emerald-700">Pagamento até o vencimento</p>
            <p className="mt-2 text-[11px] font-semibold text-slate-600">Mensalidade {formatMoney(monthlySimulation.valor)} − desconto de {formatMoney(monthlySimulation.simulacao.descontoAplicado)}.</p>
            <p className="mt-5 text-[9px] font-black uppercase text-emerald-600">Valor final</p><p className="mt-1 text-2xl font-black text-emerald-700">{formatMoney(monthlySimulation.simulacao.valorComDesconto)}</p>
          </div>
          <div className="rounded-2xl border border-rose-100 bg-rose-50 p-5">
            <p className="text-[10px] font-black uppercase text-rose-600">Pagamento com 30 dias de atraso</p>
            <p className="mt-2 text-[11px] font-semibold leading-relaxed text-slate-600">Juros de {formatPercent(effectiveRule?.encargos.jurosAtrasoPercentual || 0, 2)}% ao mês = {formatPercent(monthlySimulation.simulacao.jurosPercentualDia)}% ao dia ≈ {formatMoney(monthlySimulation.simulacao.jurosValorDia)}/dia. Em 30 dias: {formatMoney(monthlySimulation.simulacao.jurosMensal)}. Multa única: {formatPercent(effectiveRule?.encargos.multaAtrasoPercentual || 0, 2)}% = {formatMoney(monthlySimulation.simulacao.multa)}.</p>
            <p className="mt-5 text-[9px] font-black uppercase text-rose-500">Valor final</p><p className="mt-1 text-2xl font-black text-rose-700">{formatMoney(monthlySimulation.simulacao.valorComAtraso)}</p>
          </div>
        </div>
      ) : null}
      {canManageFinanceiro ? (
        <label className="block max-w-md space-y-2 rounded-2xl border border-blue-100 bg-blue-50/60 p-5">
          <span className="text-[10px] font-black uppercase tracking-wider text-blue-700">Primeiro vencimento desta matrícula</span>
          <input type="date" required value={primeiroVencimento} onChange={(event) => setPrimeiroVencimento(event.target.value)} className="w-full rounded-xl border border-blue-100 bg-white p-3 text-sm font-bold text-slate-700 outline-none focus:border-blue-500" />
          <span className="block text-[10px] font-semibold leading-relaxed text-blue-800">Preenchido pela turma ({regra?.primeiroVencimentoSugerido}). Altere apenas se este aluno tiver uma data diferente.</span>
        </label>
      ) : null}
    </div>
  );

  const renderConfirmation = () => (
    <div className="space-y-5">
      <fieldset>
        <legend className="text-[10px] font-black uppercase tracking-wider text-slate-500">O que fazer ao concluir?</legend>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {intentOptions.filter((option) => canManageFinanceiro || option.value === 'PENDENTE').map((option) => (
            <label key={option.value} className={`cursor-pointer rounded-2xl border p-4 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500 has-[:focus-visible]:ring-offset-2 ${intent === option.value ? 'border-blue-500 bg-blue-50 text-blue-800' : 'border-slate-200 text-slate-600 hover:border-blue-200'}`}>
              <input type="radio" name="finance-intent" value={option.value} checked={intent === option.value} onChange={() => setIntent(option.value)} className="sr-only" />
              <span className="flex items-center gap-2 text-xs font-black uppercase">{option.icon}{option.title}</span>
              <span className="mt-2 block text-[10px] font-semibold leading-relaxed">{option.description}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {intent === 'AGENDADA' ? <label className="block max-w-md space-y-2"><span className="text-[10px] font-black uppercase text-slate-500">Gerar cobrança inicial em</span><input type="datetime-local" value={ativarEm} onChange={(event) => setAtivarEm(event.target.value)} className="w-full rounded-xl border border-slate-200 p-3 text-sm font-bold outline-none focus:border-blue-500" /></label> : null}
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">Revisão final</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl bg-white p-3"><p className="text-[9px] font-black uppercase text-slate-400">Aluno</p><p className="mt-1 text-xs font-black text-[#001a33]">{student.nome}</p></div>
          <div className="rounded-xl bg-white p-3"><p className="text-[9px] font-black uppercase text-slate-400">Condição</p><p className="mt-1 text-xs font-black text-[#001a33]">{individual ? motivoLabels[motivo] : 'Regra da turma'}</p></div>
          <div className="rounded-xl bg-white p-3"><p className="text-[9px] font-black uppercase text-slate-400">Primeiro vencimento</p><p className="mt-1 text-xs font-black text-[#001a33]">{primeiroVencimento || 'Definido pelo servidor'}</p></div>
          <div className="rounded-xl bg-white p-3"><p className="text-[9px] font-black uppercase text-slate-400">Ação</p><p className="mt-1 text-xs font-black text-[#001a33]">{intentOptions.find((item) => item.value === intent)?.title}</p></div>
        </div>
      </div>
    </div>
  );

  const content = [renderPlan, renderCondition, renderSimulation, renderConfirmation][step];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-2 backdrop-blur-sm sm:p-4">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="confirmar-matricula-title" tabIndex={-1} className="flex max-h-[calc(100dvh-1rem)] w-full max-w-5xl flex-col overflow-hidden rounded-[1.5rem] bg-white shadow-2xl sm:max-h-[calc(100dvh-2rem)] sm:rounded-[2rem]">
        <div className="flex shrink-0 items-start justify-between bg-[#001a33] p-5 text-white sm:p-6">
          <div><p className="text-[9px] font-black uppercase tracking-[0.2em] text-blue-300">Matrícula técnica · etapa {step + 1} de {STEPS.length}</p><h3 id="confirmar-matricula-title" className="mt-1 text-xl font-black">{student.nome}</h3><p className="mt-1 text-xs font-semibold text-blue-200">{turma.codigo || turma.nome}</p></div>
          <button ref={(node) => { initialFocusRef.current = node; }} type="button" onClick={onClose} disabled={isPending} className="rounded-full p-2 text-blue-200 hover:bg-white/10 disabled:opacity-50" aria-label="Fechar"><X size={18} /></button>
        </div>
        <nav aria-label="Etapas da matrícula" className="shrink-0 border-b border-slate-100 bg-slate-50 px-4 py-4 sm:px-6">
          <ol className="grid grid-cols-4 gap-2">{STEPS.map((label, index) => <li key={label} className="flex min-w-0 flex-col items-center text-center"><span className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-[10px] font-black ${index < step ? 'border-emerald-600 bg-emerald-600 text-white' : index === step ? 'border-[#001a33] bg-[#001a33] text-white' : 'border-slate-200 bg-white text-slate-400'}`}>{index < step ? <Check size={14} /> : index + 1}</span><span className={`mt-2 hidden truncate text-[9px] font-black uppercase sm:block ${index === step ? 'text-[#001a33]' : 'text-slate-400'}`}>{label}</span></li>)}</ol>
        </nav>
        <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
          {loading ? <div className="flex min-h-64 items-center justify-center gap-3 text-sm font-bold text-slate-500"><Loader2 className="animate-spin text-blue-600" size={22} /> Carregando regra oficial da turma...</div> : error || !regra ? <div className="rounded-2xl border border-rose-100 bg-rose-50 p-6 text-center"><p className="text-sm font-black text-rose-800">Regra financeira indisponível</p><p className="mt-1 text-xs font-semibold text-rose-600">A matrícula foi bloqueada para não usar valores ou vencimentos antigos.</p><button type="button" onClick={onRetry} disabled={retrying} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-4 py-2 text-[10px] font-black uppercase text-rose-700 disabled:opacity-50"><RefreshCw size={14} className={retrying ? 'animate-spin' : ''} /> Tentar novamente</button></div> : content()}
          {stepError ? <p role="alert" className="mt-5 rounded-xl border border-rose-100 bg-rose-50 p-3 text-xs font-bold text-rose-700">{stepError}</p> : null}
        </div>
        {!loading && !error && regra ? <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-100 bg-white p-4 sm:px-6"><button type="button" onClick={step === 0 ? onClose : () => { setStepError(''); setStep((current) => current - 1); }} disabled={isPending} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-[10px] font-black uppercase text-slate-600 disabled:opacity-50">{step > 0 ? <ArrowLeft size={14} /> : null}{step === 0 ? 'Cancelar' : 'Voltar'}</button>{step < STEPS.length - 1 ? <button type="button" onClick={advance} disabled={isPending} className="inline-flex items-center gap-2 rounded-xl bg-[#001a33] px-6 py-3 text-[10px] font-black uppercase text-white disabled:opacity-50">Avançar <ArrowRight size={14} /></button> : <button type="button" onClick={submit} disabled={isPending} className="inline-flex min-w-48 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-[10px] font-black uppercase text-white disabled:opacity-50">{isPending ? <Loader2 size={14} className="animate-spin" /> : null}{intent === 'PENDENTE' ? 'Vincular sem cobrança' : intent === 'AGORA' ? 'Vincular e gerar matrícula' : 'Vincular e agendar'}</button>}</footer> : null}
      </div>
    </div>
  );
};

export default ConfirmarMatriculaModal;
