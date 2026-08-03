import React, { useState } from 'react';
import { ArrowRight, Check, Loader2, LockKeyhole, MapPin, PhoneCall, ShieldCheck, Sparkles } from 'lucide-react';
import type {
  TechnicalEnrollmentFormValues,
  TechnicalEnrollmentPayload,
  TechnicalLandingConfig,
  TechnicalLandingData,
  TechnicalLandingEnrollmentController,
} from '../technicalLanding.types';
import HighSchoolSituationFields from './HighSchoolSituationFields';
import TechnicalPaymentMethodFields from './TechnicalPaymentMethodFields';
import {
  formatLandingMoney,
  getTechnicalEnrollmentState,
  getTechnicalFinancialSummary,
} from './technicalLanding.utils';

export interface TechnicalEnrollmentFormProps {
  data: TechnicalLandingData;
  config: TechnicalLandingConfig;
  enrollment: TechnicalLandingEnrollmentController;
}

const INITIAL_VALUES: TechnicalEnrollmentFormValues = {
  highSchoolSituation: '',
  schoolName: '',
  completionYear: '',
  expectedCompletionYear: '',
  paymentMethod: '',
  acceptedDeclaration: false,
};

const isFourDigitYear = (value: string) => /^\d{4}$/.test(value);

const TechnicalEnrollmentForm: React.FC<TechnicalEnrollmentFormProps> = ({
  data,
  config,
  enrollment,
}) => {
  const [values, setValues] = useState<TechnicalEnrollmentFormValues>(INITIAL_VALUES);
  const [error, setError] = useState('');
  const [localSubmitting, setLocalSubmitting] = useState(false);
  const submitting = enrollment.isSubmitting === true || localSubmitting;

  const updateValues = (patch: Partial<TechnicalEnrollmentFormValues>) => {
    setError('');
    setValues((current) => ({ ...current, ...patch }));
  };

  // State: Online Enrollment NOT available (Presencial or Sold Out)
  if (!data.turma.onlineEnrollmentAvailable) {
    const enrollmentState = getTechnicalEnrollmentState(data.turma);
    const soldOut = enrollmentState === 'SOLD_OUT';
    const comingSoon = enrollmentState === 'UPCOMING';
    const closed = enrollmentState === 'CLOSED';
    const address = [data.polo.address, data.polo.number, data.polo.district].filter(Boolean).join(', ');
    const financial = getTechnicalFinancialSummary(data.turma);

    return (
      <section
        id="inscricao-tecnica"
        className="relative scroll-mt-32 overflow-hidden rounded-[2.5rem] border border-blue-200/80 bg-white p-7 shadow-2xl md:p-9"
      >
        <div className="absolute top-0 right-0 left-0 h-2 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-800" />

        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 shadow-sm">
          <MapPin size={24} />
        </div>

        <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3.5 py-1 text-[10px] font-black uppercase tracking-widest text-blue-700">
          <span className="h-2 w-2 rounded-full bg-blue-600" />
          {data.turma.availabilityLabel}
        </div>

        <h2 className="mt-3 text-2xl font-black text-[#001a33]">
          {soldOut
            ? 'Vagas Esgotadas para esta Turma'
            : closed
              ? 'Inscrições Encerradas'
            : comingSoon
              ? 'Inscrições Online em Breve'
              : 'Inscrição Presencial na Unidade'}
        </h2>

        <p className="mt-3 text-xs font-semibold leading-relaxed text-slate-500">
          {soldOut
            ? 'Esta turma atingiu o limite de vagas disponíveis. Entre em contato para ingressar na lista de espera ou verificar turmas futuras.'
            : closed
              ? 'O período de inscrição desta turma foi encerrado. Consulte o catálogo para conhecer outras turmas disponíveis.'
            : comingSoon
              ? 'A matrícula online está configurada e será liberada automaticamente na data de início das inscrições.'
              : 'As matrículas desta turma são finalizadas diretamente com nossa equipe no polo presencial. Entre em contato para confirmar sua vaga.'}
        </p>

        {!soldOut && !closed && financial.hasPunctualDiscount ? (
          <div className="mt-6 overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50">
            <div className="border-b border-emerald-200/70 px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.15em] text-emerald-800">
              Condição de pontualidade
            </div>
            <div className="grid grid-cols-[1fr_auto] items-center gap-4 p-4">
              <div>
                <p className="text-xs font-bold text-slate-500">
                  De <span className="line-through decoration-red-500">{formatLandingMoney(data.turma.installmentValue)}</span> por
                </p>
                <p className="mt-0.5 text-3xl font-black tracking-tight text-[#001a33]">
                  {formatLandingMoney(financial.payableInstallmentValue)}
                </p>
                <p className="text-[11px] font-black text-emerald-700">pagando até o vencimento</p>
              </div>
              <div className="rounded-xl bg-emerald-600 px-3 py-2 text-center text-white">
                <p className="text-[9px] font-black uppercase tracking-wider">Economize</p>
                <p className="text-base font-black">{formatLandingMoney(financial.punctualDiscount)}</p>
                <p className="text-[9px] font-bold">por parcela</p>
              </div>
            </div>
          </div>
        ) : null}

        <div className="mt-6 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 space-y-1">
          <p className="text-xs font-black uppercase text-[#001a33] flex items-center gap-2">
            <BuildingIcon /> {data.polo.name}
          </p>
          <p className="text-xs font-medium leading-relaxed text-slate-600">
            {[address, data.polo.city, data.polo.state].filter(Boolean).join(' · ') || 'Consulte a secretaria para localização.'}
          </p>
        </div>

        <a
          href={soldOut || closed ? '/cursos-tecnicos' : '/contato'}
          className="mt-6 flex w-full items-center justify-center gap-2.5 rounded-2xl bg-[#001a33] px-5 py-4 text-xs font-black uppercase tracking-widest text-white shadow-lg transition-all duration-300 hover:bg-blue-800 hover:scale-[1.02]"
        >
          {soldOut || closed ? 'Ver Outras Turmas' : comingSoon ? 'Consultar a Abertura' : 'Falar com a Secretaria'}
          {soldOut || closed ? <ArrowRight size={16} /> : <PhoneCall size={16} />}
        </a>
      </section>
    );
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!enrollment.isAuthenticated) {
      enrollment.onRequireAuthentication();
      return;
    }
    if (!enrollment.onSubmit) {
      setError('A etapa de pagamento ainda não foi conectada a este formulário.');
      return;
    }
    if (!values.highSchoolSituation || !values.schoolName.trim()) {
      setError('Informe sua situação escolar e o nome da escola.');
      return;
    }
    if (values.highSchoolSituation === 'CONCLUIDO' && !isFourDigitYear(values.completionYear)) {
      setError('Informe um ano de conclusão válido com quatro números (ex.: 2024).');
      return;
    }
    if (values.highSchoolSituation !== 'CONCLUIDO' && !isFourDigitYear(values.expectedCompletionYear)) {
      setError('Informe o ano previsto de conclusão com quatro números (ex.: 2026).');
      return;
    }
    if (!values.paymentMethod) {
      setError('Escolha a forma de pagamento para continuar.');
      return;
    }
    if (!values.acceptedDeclaration) {
      setError('Confirme que as informações escolares estão corretas marcando a caixa de declaração.');
      return;
    }

    const payload: TechnicalEnrollmentPayload = {
      turmaId: data.turma.id,
      courseId: data.course.id,
      highSchoolSituation: values.highSchoolSituation,
      schoolName: values.schoolName.trim().toLocaleUpperCase('pt-BR'),
      completionYear: values.highSchoolSituation === 'CONCLUIDO' ? values.completionYear : null,
      expectedCompletionYear: values.highSchoolSituation === 'CONCLUIDO' ? null : values.expectedCompletionYear,
      paymentMethod: values.paymentMethod,
    };

    setLocalSubmitting(true);
    setError('');
    try {
      await enrollment.onSubmit(payload);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Não foi possível continuar a inscrição.');
    } finally {
      setLocalSubmitting(false);
    }
  };

  // State: User NOT Authenticated
  if (!enrollment.isAuthenticated) {
    return (
      <section
        id="inscricao-tecnica"
        className="scroll-mt-32 rounded-[2.5rem] border border-blue-200/80 bg-white p-7 shadow-2xl md:p-9 relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 left-0 h-2 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700" />

        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 shadow-sm">
          <LockKeyhole size={22} />
        </div>

        <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3.5 py-1 text-[10px] font-black uppercase tracking-widest text-blue-700">
          <Sparkles size={12} /> Passo 1 de 2 · Login Necessário
        </div>

        <h2 className="mt-3 text-2xl font-black text-[#001a33]">{config.formTitle}</h2>
        <p className="mt-3 text-xs font-semibold leading-relaxed text-slate-500">{config.formDescription}</p>

        <div className="mt-6 rounded-2xl border border-slate-100 bg-slate-50/80 p-4 space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
            <Check size={16} className="text-emerald-600 shrink-0" />
            <span>Cadastro realizado com sua conta do portal do aluno</span>
          </div>
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
            <Check size={16} className="text-emerald-600 shrink-0" />
            <span>Nenhum documento enviado nesta etapa</span>
          </div>
        </div>

        <button
          type="button"
          onClick={enrollment.onRequireAuthentication}
          className="group mt-7 flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 px-6 py-4 text-sm font-black uppercase tracking-[0.11em] text-white shadow-xl shadow-blue-600/25 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-2xl focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-blue-300 active:translate-y-0"
        >
          <span>Entrar ou Criar Conta</span>
          <ArrowRight className="shrink-0 transition-transform group-hover:translate-x-1" size={18} strokeWidth={2.75} />
        </button>
      </section>
    );
  }

  // State: Authenticated User Online Enrollment Form
  return (
    <section
      id="inscricao-tecnica"
      className="scroll-mt-32 rounded-[2.5rem] border border-blue-200/80 bg-white p-7 shadow-2xl md:p-9 relative overflow-hidden"
    >
      <div className="absolute top-0 right-0 left-0 h-2 bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600" />

      <div className="flex items-center justify-between">
        <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3.5 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-800">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          Matrícula Online Ativa
        </div>
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Passo Final</span>
      </div>

      <h2 className="mt-3 text-2xl font-black text-[#001a33]">{config.formTitle}</h2>
      <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-500">{config.formDescription}</p>

      <form onSubmit={handleSubmit} className="mt-7 space-y-6">
        <HighSchoolSituationFields
          value={values}
          onChange={updateValues}
          disabled={submitting}
          acceptsConcurrent={data.turma.acceptsConcurrent}
          acceptsSubsequent={data.turma.acceptsSubsequent}
          minimumHighSchoolGrade={data.turma.minimumHighSchoolGrade}
        />

        <TechnicalPaymentMethodFields
          value={values.paymentMethod}
          onChange={(paymentMethod) => updateValues({ paymentMethod })}
          methods={data.course.paymentMethods}
          disabled={submitting}
        />

        <label className="group flex items-start gap-3 rounded-2xl border border-slate-200/90 bg-slate-50/70 p-4 transition-all hover:bg-slate-100/70 cursor-pointer">
          <input
            type="checkbox"
            checked={values.acceptedDeclaration}
            disabled={submitting}
            onChange={(event) => updateValues({ acceptedDeclaration: event.target.checked })}
            className="mt-0.5 h-4 w-4 rounded accent-emerald-600 cursor-pointer"
          />
          <span className="text-xs font-bold leading-relaxed text-slate-700">
            Declaro que as informações escolares acima são autênticas e que enviarei a comprovação no portal do aluno.
          </span>
        </label>

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-xs font-bold text-red-700 shadow-sm">
            {error}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={submitting || data.course.paymentMethods.length === 0}
          className="flex min-h-14 w-full items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-600 px-6 py-4 text-xs font-black uppercase tracking-widest text-white shadow-xl shadow-emerald-600/30 transition-all duration-300 hover:scale-[1.02] hover:brightness-110 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:opacity-60 disabled:hover:scale-100"
        >
          {submitting ? <Loader2 className="animate-spin" size={18} /> : <ArrowRight size={18} />}
          <span>Continuar para Pagamento</span>
        </button>

        <div className="flex items-center justify-center gap-2 text-[11px] font-bold text-slate-400">
          <ShieldCheck className="text-emerald-600" size={16} />
          <span>Matrícula segura e protegida pelo portal</span>
        </div>
      </form>
    </section>
  );
};

const BuildingIcon = () => (
  <svg className="h-3.5 w-3.5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
  </svg>
);

export default TechnicalEnrollmentForm;
