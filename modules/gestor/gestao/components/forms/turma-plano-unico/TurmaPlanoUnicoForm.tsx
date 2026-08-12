import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Loader2, Save, X } from 'lucide-react';
import { polosService } from '../../../../configuracoes/polos/polos.service';
import { TURMA_PLANO_UNICO_STEPS, createInitialTurmaPlanoUnicoFormData } from './turma-plano-unico-form.constants';
import type {
  TurmaPlanoUnicoFormData,
  TurmaPlanoUnicoFormProps,
  TurmaPlanoUnicoPoloOption,
  TurmaPlanoUnicoSubmission,
} from './turma-plano-unico-form.types';
import {
  buildInstallmentSchedule,
  getDiaVencimento,
  getFriendlyPlanoUnicoSubmitError,
} from './turma-plano-unico-form.utils';
import { validateTurmaPlanoUnicoStep } from './turma-plano-unico-form.validation';
import TurmaPlanoUnicoStepper from './TurmaPlanoUnicoStepper';
import TurmaPlanoUnicoDadosStep from './steps/TurmaPlanoUnicoDadosStep';
import TurmaPlanoUnicoFinanceiroStep from './steps/TurmaPlanoUnicoFinanceiroStep';
import TurmaPlanoUnicoReviewStep from './steps/TurmaPlanoUnicoReviewStep';
import { useTurmaPlanoUnicoDialog } from './useTurmaPlanoUnicoDialog';

const LAST_STEP_INDEX = TURMA_PLANO_UNICO_STEPS.length - 1;

const TurmaPlanoUnicoForm: React.FC<TurmaPlanoUnicoFormProps> = ({
  isOpen,
  onClose,
  onSave,
  cursosDisponiveis,
  selectedPoloId,
  config,
}) => {
  const [formData, setFormData] = useState<TurmaPlanoUnicoFormData>(() => (
    createInitialTurmaPlanoUnicoFormData(config, selectedPoloId)
  ));
  const [polos, setPolos] = useState<TurmaPlanoUnicoPoloOption[]>([]);
  const [polosError, setPolosError] = useState('');
  const [currentStep, setCurrentStep] = useState(0);
  const [stepError, setStepError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const requestClose = useCallback(() => {
    if (!isSaving) onClose();
  }, [isSaving, onClose]);
  const { dialogRef, initialFocusRef } = useTurmaPlanoUnicoDialog(isOpen, requestClose, isSaving);

  useEffect(() => {
    if (!isOpen) return;
    setFormData(createInitialTurmaPlanoUnicoFormData(config, selectedPoloId));
    setCurrentStep(0);
    setStepError('');
    setSubmitError('');
    setIsSaving(false);
  }, [config, isOpen, selectedPoloId]);

  useEffect(() => {
    if (!isOpen) return undefined;
    let active = true;
    setPolosError('');
    polosService.getAll()
      .then((items) => {
        if (active) setPolos(items as TurmaPlanoUnicoPoloOption[]);
      })
      .catch((error: unknown) => {
        console.error('Erro ao carregar polos para a nova turma:', error);
        if (active) setPolosError('Não foi possível carregar os polos. Feche o formulário e tente novamente.');
      });
    return () => { active = false; };
  }, [isOpen]);

  const selectedCourse = useMemo(
    () => cursosDisponiveis.find((course) => course.id === formData.cursoId),
    [cursosDisponiveis, formData.cursoId],
  );
  const selectedPolo = useMemo(
    () => polos.find((polo) => polo.id === formData.poloId),
    [formData.poloId, polos],
  );
  const identity = useMemo(() => {
    if (!selectedCourse || !selectedPolo) return { nome: '', codigo: '' };
    return config.generateIdentity({ curso: selectedCourse, polo: selectedPolo, formData }) || { nome: '', codigo: '' };
  }, [config, formData, selectedCourse, selectedPolo]);
  const initialStatus = 'EM_ANDAMENTO' as const;
  const activeStep = TURMA_PLANO_UNICO_STEPS[currentStep];

  const updateForm = useCallback((patch: Partial<TurmaPlanoUnicoFormData>) => {
    setFormData((current) => ({ ...current, ...patch }));
    setStepError('');
    setSubmitError('');
  }, []);

  const moveToStep = (nextStep: number) => {
    setCurrentStep(nextStep);
    setStepError('');
    contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const advance = () => {
    const error = validateTurmaPlanoUnicoStep(activeStep.id, formData, identity);
    if (error) {
      setStepError(error);
      return;
    }
    if (currentStep < LAST_STEP_INDEX) moveToStep(currentStep + 1);
  };

  const buildSubmission = (): TurmaPlanoUnicoSubmission => {
    const schedule = buildInstallmentSchedule(
      formData.valorTotal,
      formData.qtdParcelas,
      formData.primeiroVencimento,
    );
    const planoFinanceiroUnico = {
      valorTotal: formData.valorTotal,
      qtdParcelas: formData.qtdParcelas,
      primeiroVencimento: formData.primeiroVencimento,
      diaVencimento: getDiaVencimento(formData.primeiroVencimento),
      descontoPontualidade: formData.descontoPontualidade,
      jurosAtrasoPercentual: formData.jurosAtrasoPercentual,
      multaAtraso: formData.multaAtraso,
    };

    return {
      codigo: identity.codigo,
      nome: identity.nome,
      cursoId: formData.cursoId,
      cursoNome: selectedCourse?.nome || '',
      modalidade: config.modalidade,
      poloId: formData.poloId,
      poloNome: selectedPolo?.cidade || '',
      dataInicio: formData.dataInicio,
      dataPrevisaoTermino: formData.dataPrevisaoTermino,
      dataInicioInscricao: '',
      dataFimInscricao: '',
      publicarNoSite: false,
      permitirInscricoesOnline: false,
      exigeMatricula: false,
      aceitaConcomitante: false,
      aceitaSubsequente: true,
      serieMinimaEnsinoMedio: 2,
      bloquearMatriculasAposCompletarVagas: true,
      qtdVagasMinima: 0,
      frequenciaMinimaPercent: 75,
      mediaMinima: 6,
      turno: formData.turno,
      status: initialStatus,
      vagasTotais: formData.vagasTotais,
      cobrarMatricula: false,
      valorMatricula: 0,
      cobrarRematricula: false,
      valorRematricula: 0,
      qtdParcelas: planoFinanceiroUnico.qtdParcelas,
      valorParcela: schedule[0]?.valor || 0,
      descontoPontualidade: planoFinanceiroUnico.descontoPontualidade,
      jurosAtraso: planoFinanceiroUnico.jurosAtrasoPercentual,
      multaAtraso: planoFinanceiroUnico.multaAtraso,
      diaVencimentoPadrao: planoFinanceiroUnico.diaVencimento,
      primeiroVencimentoPadrao: planoFinanceiroUnico.primeiroVencimento,
      origemFinanceira: 'NORMAL',
      financeiroHerdado: false,
      gerarCobrancasFuturas: true,
      sincronizarAsaasFuturo: true,
      cronogramaFinanceiro: schedule.map((installment) => ({
        numero: installment.numero,
        valor: installment.valor,
        dataVencimento: installment.vencimento,
      })),
      planoFinanceiroUnico,
    };
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSaving) return;
    if (currentStep < LAST_STEP_INDEX) {
      advance();
      return;
    }

    for (let index = 0; index < TURMA_PLANO_UNICO_STEPS.length; index += 1) {
      const error = validateTurmaPlanoUnicoStep(TURMA_PLANO_UNICO_STEPS[index].id, formData, identity);
      if (error) {
        setCurrentStep(index);
        setStepError(error);
        contentRef.current?.scrollTo({ top: 0 });
        return;
      }
    }

    setStepError('');
    setSubmitError('');
    setIsSaving(true);
    try {
      await onSave(buildSubmission());
      onClose();
    } catch (error) {
      console.error('Erro ao abrir turma com plano único:', error);
      setSubmitError(getFriendlyPlanoUnicoSubmitError(error));
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  const dialogId = `nova-turma-${config.modalidade.toLowerCase()}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
      <div className="absolute inset-0 bg-[#001a33]/65 backdrop-blur-sm" onClick={requestClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${dialogId}-title`}
        aria-describedby={`${dialogId}-description`}
        tabIndex={-1}
        className="relative flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-[1.5rem] border border-white/70 bg-white shadow-2xl sm:rounded-[2rem]"
      >
        <header className="flex shrink-0 items-start justify-between gap-4 px-5 pb-4 pt-5 sm:px-8 sm:pt-7">
          <div>
            <div className={`mb-2 h-1 w-10 rounded-full ${config.theme.accentStepBg}`} />
            <h3 id={`${dialogId}-title`} className="text-xl font-black uppercase tracking-tight text-[#001a33] sm:text-2xl">{config.title}</h3>
            <p id={`${dialogId}-description`} className="mt-1 text-xs font-medium text-slate-500">Etapa {currentStep + 1} de {TURMA_PLANO_UNICO_STEPS.length} · {activeStep.description}</p>
          </div>
          <button
            ref={(node) => { initialFocusRef.current = node; }}
            type="button"
            onClick={requestClose}
            disabled={isSaving}
            aria-label="Fechar formulário"
            className={`rounded-full p-2.5 text-slate-400 transition hover:bg-slate-50 hover:text-rose-500 focus:outline-none focus:ring-2 ${config.theme.accentFocus} disabled:cursor-not-allowed disabled:opacity-50`}
          >
            <X size={20} />
          </button>
        </header>

        <TurmaPlanoUnicoStepper currentStep={currentStep} steps={TURMA_PLANO_UNICO_STEPS} theme={config.theme} />

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div ref={contentRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-8 sm:py-7">
            {activeStep.id === 'TURMA' ? (
              <TurmaPlanoUnicoDadosStep
                cursos={cursosDisponiveis}
                config={config}
                formData={formData}
                identity={identity}
                initialStatus={initialStatus}
                polos={polos}
                polosError={polosError}
                selectedPolo={selectedPolo}
                selectedPoloId={selectedPoloId}
                onChange={updateForm}
              />
            ) : activeStep.id === 'PLANO_FINANCEIRO' ? (
              <TurmaPlanoUnicoFinanceiroStep config={config} formData={formData} onChange={updateForm} />
            ) : (
              <TurmaPlanoUnicoReviewStep
                config={config}
                course={selectedCourse}
                formData={formData}
                identity={identity}
                initialStatus={initialStatus}
                polo={selectedPolo}
              />
            )}

            {stepError ? <div role="alert" className="mt-5 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">{stepError}</div> : null}
            {submitError ? <div role="alert" className="mt-5 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">{submitError}</div> : null}
          </div>

          <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-100 bg-white px-5 py-4 sm:px-8">
            <button
              type="button"
              onClick={currentStep === 0 ? requestClose : () => moveToStep(currentStep - 1)}
              disabled={isSaving}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-[10px] font-black uppercase tracking-wide text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 sm:px-5"
            >
              {currentStep > 0 ? <ArrowLeft size={15} /> : null}
              {currentStep === 0 ? 'Cancelar' : 'Voltar'}
            </button>
            <div className="text-right">
              <p className="hidden text-[9px] font-bold uppercase tracking-wide text-slate-400 sm:block">{activeStep.label}</p>
              <button
                type="submit"
                disabled={isSaving}
                className={`mt-1 inline-flex min-w-36 items-center justify-center gap-2 rounded-xl bg-[#001a33] px-5 py-3 text-[10px] font-black uppercase tracking-wide text-white shadow-lg shadow-slate-900/15 transition ${config.theme.accentHoverBg} focus:outline-none focus:ring-2 ${config.theme.accentFocus} disabled:cursor-not-allowed disabled:opacity-50 sm:min-w-44`}
              >
                {isSaving ? <Loader2 size={15} className="animate-spin" /> : currentStep === LAST_STEP_INDEX ? <Save size={15} /> : <ArrowRight size={15} />}
                {isSaving ? 'Criando turma...' : currentStep === LAST_STEP_INDEX ? config.submitLabel : 'Avançar'}
              </button>
            </div>
          </footer>
        </form>
      </div>
    </div>
  );
};

export default TurmaPlanoUnicoForm;
