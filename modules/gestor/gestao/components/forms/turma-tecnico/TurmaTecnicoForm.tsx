import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Loader2, Save, X } from 'lucide-react';
import { polosService } from '../../../../configuracoes/polos/polos.service';
import { getInitialTechnicalStatus } from '../../../tecnicos/technicalClassDates';
import { useAccessibleDialog } from '../../../tecnicos/detalhes/components/financeiro/hooks/useAccessibleDialog';
import TechnicalEnrollmentSettings from '../TechnicalEnrollmentSettings';
import { createInitialTurmaTecnicoFormData, TURMA_TECNICO_STEPS } from './turma-tecnico-form.constants';
import type {
  TurmaTecnicoFormData,
  TurmaTecnicoFormProps,
  TurmaTecnicoPoloOption,
  TurmaTecnicoSubmission,
} from './turma-tecnico-form.types';
import {
  buildTurmaTecnicoIdentity,
  getFriendlyTechnicalClassSubmitError,
} from './turma-tecnico-form.utils';
import { validateTurmaTecnicoStep } from './turma-tecnico-form.validation';
import TurmaTecnicoDadosStep from './TurmaTecnicoDadosStep';
import TurmaTecnicoFinanceiroStep from './TurmaTecnicoFinanceiroStep';
import TurmaTecnicoAutorizacaoStep from './TurmaTecnicoAutorizacaoStep';
import TurmaTecnicoReviewStep from './TurmaTecnicoReviewStep';
import TurmaTecnicoStepper from './TurmaTecnicoStepper';

const LAST_STEP_INDEX = TURMA_TECNICO_STEPS.length - 1;

const TurmaTecnicoForm: React.FC<TurmaTecnicoFormProps> = ({
  isOpen,
  onClose,
  onSave,
  cursosDisponiveis,
  selectedPoloId,
}) => {
  const [formData, setFormData] = useState<TurmaTecnicoFormData>(() => (
    createInitialTurmaTecnicoFormData(selectedPoloId)
  ));
  const [polos, setPolos] = useState<TurmaTecnicoPoloOption[]>([]);
  const [polosError, setPolosError] = useState('');
  const [currentStep, setCurrentStep] = useState(0);
  const [stepError, setStepError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const requestClose = useCallback(() => {
    if (!isSaving) onClose();
  }, [isSaving, onClose]);
  const { dialogRef, initialFocusRef } = useAccessibleDialog(isOpen, requestClose, isSaving);

  useEffect(() => {
    if (!isOpen) return;
    setFormData(createInitialTurmaTecnicoFormData(selectedPoloId));
    setCurrentStep(0);
    setStepError('');
    setSubmitError('');
    setIsSaving(false);
  }, [isOpen, selectedPoloId]);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    setPolosError('');
    polosService.getAll()
      .then((items) => {
        if (active) setPolos(items as TurmaTecnicoPoloOption[]);
      })
      .catch((error: unknown) => {
        if (!active) return;
        console.error('Erro ao carregar polos para a nova turma:', error);
        setPolosError('Não foi possível carregar os polos. Feche o formulário e tente novamente.');
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
  const identity = useMemo(
    () => buildTurmaTecnicoIdentity(formData, selectedCourse, selectedPolo),
    [formData, selectedCourse, selectedPolo],
  );
  const initialStatus = formData.dataInicio ? getInitialTechnicalStatus(formData) : 'PLANEJADA';
  const activeStep = TURMA_TECNICO_STEPS[currentStep];

  const updateForm = useCallback((patch: Partial<TurmaTecnicoFormData>) => {
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
    const error = validateTurmaTecnicoStep(activeStep.id, formData, identity);
    if (error) {
      setStepError(error);
      return;
    }
    if (currentStep < LAST_STEP_INDEX) moveToStep(currentStep + 1);
  };

  const goBack = () => {
    if (currentStep > 0) moveToStep(currentStep - 1);
  };

  const buildSubmission = (): TurmaTecnicoSubmission => ({
    codigo: identity.codigo,
    nome: identity.nome,
    cursoId: formData.cursoId,
    cursoNome: selectedCourse?.nome || '',
    modalidade: 'TECNICO',
    poloId: formData.poloId,
    poloNome: selectedPolo?.cidade || '',
    dataInicio: formData.dataInicio,
    dataPrevisaoTermino: formData.dataPrevisaoTermino,
    dataInicioInscricao: formData.dataInicioInscricao,
    dataFimInscricao: formData.dataFimInscricao,
    publicarNoSite: formData.publicarNoSite,
    permitirInscricoesOnline: formData.permitirInscricoesOnline,
    exigeMatricula: formData.cobrarMatricula,
    aceitaConcomitante: formData.aceitaConcomitante,
    aceitaSubsequente: formData.aceitaSubsequente,
    serieMinimaEnsinoMedio: formData.serieMinimaEnsinoMedio,
    bloquearMatriculasAposCompletarVagas: formData.bloquearMatriculasAposCompletarVagas,
    qtdVagasMinima: 0,
    frequenciaMinimaPercent: formData.frequenciaMinimaPercent,
    mediaMinima: formData.mediaMinima,
    turno: formData.turno,
    status: initialStatus,
    vagasTotais: formData.vagasTotais,
    cobrarMatricula: formData.cobrarMatricula,
    valorMatricula: formData.valorMatricula,
    cobrarRematricula: formData.cobrarRematricula,
    valorRematricula: formData.valorRematricula,
    qtdParcelas: formData.qtdParcelas,
    valorParcela: formData.valorParcela,
    descontoPontualidade: formData.descontoPontualidade,
    jurosAtraso: formData.jurosAtraso,
    multaAtraso: 0,
    multaAtrasoPercentual: formData.multaAtrasoPercentual,
    aplicarDescontoMatricula: formData.aplicarDescontoMatricula,
    aplicarMultaJurosMatricula: formData.aplicarMultaJurosMatricula,
    aplicarDescontoMensalidade: formData.aplicarDescontoMensalidade,
    aplicarMultaJurosMensalidade: formData.aplicarMultaJurosMensalidade,
    aplicarDescontoRematricula: formData.aplicarDescontoRematricula,
    aplicarMultaJurosRematricula: formData.aplicarMultaJurosRematricula,
    diaVencimentoPadrao: formData.diaVencimentoPadrao,
    primeiroVencimentoPadrao: formData.primeiroVencimentoPadrao,
    codigoCondicaoIndividual: formData.codigoCondicaoIndividual,
    instrucaoBoletoCarne: formData.instrucaoBoletoCarne.trim(),
    origemFinanceira: formData.origemFinanceira,
    financeiroHerdado: formData.origemFinanceira === 'LEGADO',
    gerarCobrancasFuturas: formData.origemFinanceira !== 'LEGADO',
    sincronizarAsaasFuturo: false,
    cronogramaFinanceiro: [],
  });

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSaving) return;
    if (currentStep < LAST_STEP_INDEX) {
      advance();
      return;
    }

    for (let index = 0; index < TURMA_TECNICO_STEPS.length; index += 1) {
      const error = validateTurmaTecnicoStep(TURMA_TECNICO_STEPS[index].id, formData, identity);
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
      console.error('Erro ao abrir turma técnica:', error);
      setSubmitError(getFriendlyTechnicalClassSubmitError(error));
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
      <div className="absolute inset-0 bg-[#001a33]/65 backdrop-blur-sm" onClick={requestClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="nova-turma-tecnica-title"
        aria-describedby="nova-turma-tecnica-description"
        tabIndex={-1}
        className="relative flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-[1.5rem] border border-white/70 bg-white shadow-2xl sm:rounded-[2rem]"
      >
        <header className="flex shrink-0 items-start justify-between gap-4 px-5 pb-4 pt-5 sm:px-8 sm:pt-7">
          <div>
            <div className="mb-2 h-1 w-10 rounded-full bg-emerald-500" />
            <h3 id="nova-turma-tecnica-title" className="text-xl font-black uppercase tracking-tight text-[#001a33] sm:text-2xl">Nova turma técnica</h3>
            <p id="nova-turma-tecnica-description" className="mt-1 text-xs font-medium text-slate-500">Etapa {currentStep + 1} de {TURMA_TECNICO_STEPS.length} · {activeStep.description}</p>
          </div>
          <button
            ref={(node) => { initialFocusRef.current = node; }}
            type="button"
            onClick={requestClose}
            disabled={isSaving}
            aria-label="Fechar formulário"
            className="rounded-full p-2.5 text-slate-400 transition hover:bg-slate-50 hover:text-rose-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X size={20} />
          </button>
        </header>

        <TurmaTecnicoStepper currentStep={currentStep} steps={TURMA_TECNICO_STEPS} />

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div ref={contentRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-8 sm:py-7">
            {activeStep.id === 'TURMA' ? (
              <TurmaTecnicoDadosStep
                cursos={cursosDisponiveis}
                formData={formData}
                identity={identity}
                initialStatus={initialStatus}
                polos={polos}
                polosError={polosError}
                selectedPolo={selectedPolo}
                selectedPoloId={selectedPoloId}
                onChange={updateForm}
              />
            ) : activeStep.id === 'INSCRICOES' ? (
              <section aria-labelledby="enrollment-step-title" className="space-y-5">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-600">Etapa 2</p>
                  <h4 id="enrollment-step-title" className="mt-1 text-lg font-black uppercase tracking-tight text-[#001a33]">Divulgação e inscrições</h4>
                  <p className="mt-1 text-xs font-medium text-slate-500">Configure a entrada de alunos. A cobrança de matrícula será definida somente na próxima etapa.</p>
                </div>
                <TechnicalEnrollmentSettings
                  value={formData}
                  showEnrollmentPaymentRule={false}
                  onChange={updateForm}
                />
              </section>
            ) : activeStep.id === 'FINANCEIRO' ? (
              <TurmaTecnicoFinanceiroStep formData={formData} onChange={updateForm} />
            ) : activeStep.id === 'AUTORIZACAO' ? (
              <TurmaTecnicoAutorizacaoStep formData={formData} onChange={updateForm} />
            ) : (
              <TurmaTecnicoReviewStep
                course={selectedCourse}
                formData={formData}
                identity={identity}
                initialStatus={initialStatus}
                polo={selectedPolo}
                onChange={updateForm}
              />
            )}

            {stepError ? (
              <div role="alert" className="mt-5 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">{stepError}</div>
            ) : null}
            {submitError ? (
              <div role="alert" className="mt-5 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">{submitError}</div>
            ) : null}
          </div>

          <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-100 bg-white px-5 py-4 sm:px-8">
            <button
              type="button"
              onClick={currentStep === 0 ? requestClose : goBack}
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
                className="mt-1 inline-flex min-w-36 items-center justify-center gap-2 rounded-xl bg-[#001a33] px-5 py-3 text-[10px] font-black uppercase tracking-wide text-white shadow-lg shadow-slate-900/15 transition hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:min-w-44"
              >
                {isSaving ? <Loader2 size={15} className="animate-spin" /> : currentStep === LAST_STEP_INDEX ? <Save size={15} /> : <ArrowRight size={15} />}
                {isSaving ? 'Criando turma...' : currentStep === LAST_STEP_INDEX ? 'Criar turma' : 'Avançar'}
              </button>
            </div>
          </footer>
        </form>
      </div>
    </div>
  );
};

export default TurmaTecnicoForm;
