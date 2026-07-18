import React, { useState } from 'react';
import { ArrowRight, Loader2, LockKeyhole, MapPin, ShieldCheck } from 'lucide-react';
import type {
  TechnicalEnrollmentFormValues,
  TechnicalEnrollmentPayload,
  TechnicalLandingConfig,
  TechnicalLandingData,
  TechnicalLandingEnrollmentController,
} from '../technicalLanding.types';
import HighSchoolSituationFields from './HighSchoolSituationFields';
import TechnicalPaymentMethodFields from './TechnicalPaymentMethodFields';

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

  if (!data.turma.onlineEnrollmentAvailable) {
    const soldOut = data.turma.availabilityLabel === 'VAGAS ESGOTADAS';
    const address = [data.polo.address, data.polo.number, data.polo.district]
      .filter(Boolean)
      .join(', ');

    return (
      <section id="inscricao-tecnica" className="scroll-mt-32 rounded-[2rem] border border-blue-100 bg-white p-7 shadow-xl md:p-9">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
          <MapPin size={22} />
        </div>
        <p className="mt-5 text-[10px] font-black uppercase tracking-[0.22em] text-blue-600">
          {data.turma.availabilityLabel}
        </p>
        <h2 className="mt-2 text-2xl font-black text-[#001a33]">
          {soldOut ? 'Vagas esgotadas nesta turma' : 'Inscrição online indisponível'}
        </h2>
        <p className="mt-3 text-sm font-semibold leading-relaxed text-slate-500">
          {soldOut
            ? 'A turma continua divulgada para consulta, mas atingiu o limite configurado de vagas.'
            : 'A turma continua divulgada para consulta. Entre em contato com a unidade para confirmar a matrícula presencial.'}
        </p>
        <div className="mt-6 rounded-2xl border border-slate-100 bg-slate-50 p-4">
          <p className="text-xs font-black uppercase text-[#001a33]">{data.polo.name}</p>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            {[address, data.polo.city, data.polo.state].filter(Boolean).join(' · ') || 'Consulte a unidade para receber as orientações.'}
          </p>
        </div>
        <a
          href={soldOut ? '/cursos-tecnicos' : '/contato'}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#001a33] px-5 py-4 text-xs font-black uppercase tracking-widest text-white transition hover:bg-blue-700"
        >
          {soldOut ? 'Ver outras turmas' : 'Falar com a unidade'} <ArrowRight size={16} />
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
      setError('Informe um ano de conclusão válido com quatro números.');
      return;
    }
    if (values.highSchoolSituation !== 'CONCLUIDO' && !isFourDigitYear(values.expectedCompletionYear)) {
      setError('Informe o ano previsto de conclusão com quatro números.');
      return;
    }
    if (!values.paymentMethod) {
      setError('Escolha a forma de pagamento para continuar.');
      return;
    }
    if (!values.acceptedDeclaration) {
      setError('Confirme que as informações escolares estão corretas.');
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

  if (!enrollment.isAuthenticated) {
    return (
      <section id="inscricao-tecnica" className="scroll-mt-32 rounded-[2rem] border border-blue-100 bg-white p-7 shadow-xl md:p-9">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
          <LockKeyhole size={22} />
        </div>
        <p className="mt-5 text-[10px] font-black uppercase tracking-[0.22em] text-blue-600">Inscrição protegida</p>
        <h2 className="mt-2 text-2xl font-black text-[#001a33]">{config.formTitle}</h2>
        <p className="mt-3 text-sm font-semibold leading-relaxed text-slate-500">{config.formDescription}</p>
        <button
          type="button"
          onClick={enrollment.onRequireAuthentication}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-4 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700"
        >
          Entrar ou criar cadastro <ArrowRight size={16} />
        </button>
        <p className="mt-4 flex items-start gap-2 text-xs font-semibold leading-relaxed text-slate-500">
          <ShieldCheck className="mt-0.5 shrink-0 text-emerald-600" size={15} />
          A turma escolhida será mantida durante o login. Nenhum documento é enviado nesta etapa.
        </p>
      </section>
    );
  }

  return (
    <section id="inscricao-tecnica" className="scroll-mt-32 rounded-[2rem] border border-blue-100 bg-white p-7 shadow-xl md:p-9">
      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-blue-600">Cadastro escolar básico</p>
      <h2 className="mt-2 text-2xl font-black text-[#001a33]">{config.formTitle}</h2>
      <p className="mt-3 text-sm font-semibold leading-relaxed text-slate-500">{config.formDescription}</p>

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
        <label className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4">
          <input
            type="checkbox"
            checked={values.acceptedDeclaration}
            disabled={submitting}
            onChange={(event) => updateValues({ acceptedDeclaration: event.target.checked })}
            className="mt-0.5 h-4 w-4 accent-blue-600"
          />
          <span className="text-xs font-bold leading-relaxed text-slate-600">
            Confirmo que as informações escolares são verdadeiras e enviarei os comprovantes solicitados no portal do aluno.
          </span>
        </label>
        {error ? <p className="rounded-xl border border-red-100 bg-red-50 p-3 text-xs font-bold text-red-700">{error}</p> : null}
        <button
          type="submit"
          disabled={submitting || data.course.paymentMethods.length === 0}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-4 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:opacity-60"
        >
          {submitting ? <Loader2 className="animate-spin" size={16} /> : <ArrowRight size={16} />}
          Continuar para pagamento
        </button>
      </form>
    </section>
  );
};

export default TechnicalEnrollmentForm;
