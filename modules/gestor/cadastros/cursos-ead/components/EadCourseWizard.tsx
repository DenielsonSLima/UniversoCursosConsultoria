import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Save,
  Sparkles,
} from 'lucide-react';
import type { FC } from 'react';
import { EadCourseWizardProvider } from './EadCourseWizardContext';
import type { EadCourseWizardProps } from './eadCourseWizard.types';
import EadCourseWizardStep1 from './steps/EadCourseWizardStep1';
import EadCourseWizardStep2 from './steps/EadCourseWizardStep2';
import EadCourseWizardStep3 from './steps/EadCourseWizardStep3';
import EadCourseWizardStep4 from './steps/EadCourseWizardStep4';
import EadCourseWizardStep5 from './steps/EadCourseWizardStep5';
import EadCourseWizardStep6 from './steps/EadCourseWizardStep6';
import EadCourseWizardStep7 from './steps/EadCourseWizardStep7';
import { useEadCourseWizardController } from './useEadCourseWizardController';

const steps = [
  { num: 1, name: 'Informações Básicas' },
  { num: 2, name: 'Financeiro' },
  { num: 3, name: 'Cronograma' },
  { num: 4, name: 'Vídeo do Curso' },
  { num: 5, name: 'Aulas e Conteúdo' },
  { num: 6, name: 'Provas & Atividades' },
  { num: 7, name: 'Certificado EAD' },
];

const stepComponents = [
  EadCourseWizardStep1,
  EadCourseWizardStep2,
  EadCourseWizardStep3,
  EadCourseWizardStep4,
  EadCourseWizardStep5,
  EadCourseWizardStep6,
  EadCourseWizardStep7,
];

const EadCourseWizardSession: FC<EadCourseWizardProps> = ({ curso, onBack, onSave }) => {
  const controller = useEadCourseWizardController({ curso, onSave });
  const {
    confirmModal,
    currentStep,
    handleFinalSave,
    isSaving,
    nome,
    setConfirmModal,
    setCurrentStep,
    toast,
  } = controller;
  const CurrentStepComponent = stepComponents[currentStep - 1] || EadCourseWizardStep1;

  return (
    <EadCourseWizardProvider value={controller}>
      <div className="flex h-full min-h-screen min-w-0 flex-col overflow-x-hidden bg-slate-50 animate-fadeIn">
        <header className="flex flex-col items-start justify-between gap-4 border-b border-slate-200 bg-white px-4 py-5 sm:px-6 xl:flex-row xl:items-center">
          <div className="flex min-w-0 items-center gap-4">
            <button
              onClick={onBack}
              className="flex-shrink-0 rounded-xl border border-slate-200 bg-white p-2 text-slate-400 shadow-sm transition-colors hover:border-purple-200 hover:text-purple-600"
              aria-label="Voltar para cursos EAD"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="min-w-0">
              <span className="rounded-md bg-purple-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-purple-600">
                Ensino a Distância
              </span>
              <h3 className="mt-1.5 truncate text-lg font-black uppercase tracking-tight text-[#001a33] sm:text-xl">
                {curso ? `Editando: ${nome}` : 'Novo Curso EAD'}
              </h3>
            </div>
          </div>

          <div className="flex w-full flex-wrap gap-2 sm:w-auto xl:flex-shrink-0">
            <button
              onClick={() => handleFinalSave()}
              disabled={isSaving}
              className="flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[#001a33] px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm transition-colors hover:bg-slate-800 disabled:opacity-70 sm:flex-none sm:px-5 sm:text-xs"
            >
              {isSaving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
              Salvar Rascunho
            </button>
            <button
              onClick={() => handleFinalSave(true)}
              disabled={isSaving}
              className="flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-purple-600 px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-white shadow-lg shadow-purple-600/25 transition-all hover:bg-purple-700 disabled:opacity-70 sm:flex-none sm:px-5 sm:text-xs"
            >
              {isSaving ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
              Publicar Curso
            </button>
          </div>
        </header>

        <nav className="border-b border-slate-200 bg-white px-3 py-3 sm:px-6 sm:py-4" aria-label="Etapas do curso EAD">
          <div className="mx-auto grid w-full max-w-6xl grid-cols-6">
            {steps.map((step, index) => (
              <button
                key={step.num}
                onClick={() => setCurrentStep(step.num)}
                className="group relative flex min-w-0 flex-col items-center gap-1.5 px-1 focus:outline-none sm:gap-2"
                aria-current={currentStep === step.num ? 'step' : undefined}
                title={step.name}
              >
                {index > 0 && (
                  <span
                    aria-hidden="true"
                    className={`absolute left-0 right-1/2 top-4 h-0.5 ${currentStep >= step.num ? 'bg-purple-400' : 'bg-slate-200'}`}
                  />
                )}
                {index < steps.length - 1 && (
                  <span
                    aria-hidden="true"
                    className={`absolute left-1/2 right-0 top-4 h-0.5 ${currentStep > step.num ? 'bg-purple-400' : 'bg-slate-200'}`}
                  />
                )}
                <span className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border text-sm font-bold transition-all ${
                  currentStep === step.num
                    ? 'border-purple-600 bg-purple-600 text-white shadow-md shadow-purple-600/20'
                    : currentStep > step.num
                      ? 'border-purple-200 bg-purple-55 text-purple-600'
                      : 'border-slate-200 bg-slate-50 text-slate-400 group-hover:bg-slate-100 group-hover:text-slate-600'
                }`}>
                  {step.num}
                </span>
                <span className={`block w-full truncate text-center text-[8px] font-bold uppercase tracking-tight sm:text-[10px] lg:text-xs lg:tracking-wide ${
                  currentStep === step.num ? 'font-black text-purple-650' : 'text-slate-500 group-hover:text-slate-700'
                }`}>
                  {step.name}
                </span>
              </button>
            ))}
          </div>
        </nav>

        <main className="mx-auto w-full max-w-4xl min-w-0 flex-1 p-4 sm:p-6 md:p-8">
          <div className="rounded-[2.5rem] border border-slate-200/60 bg-white p-6 shadow-sm md:p-8">
            <CurrentStepComponent />
          </div>

          <div className="mt-6 flex items-center justify-between">
            <button
              onClick={() => setCurrentStep((previous) => Math.max(1, previous - 1))}
              disabled={currentStep === 1}
              className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold uppercase text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50"
            >
              <ChevronLeft size={16} /> Voltar
            </button>

            {currentStep < steps.length ? (
              <button
                onClick={() => setCurrentStep((previous) => Math.min(steps.length, previous + 1))}
                className="flex items-center gap-1 rounded-xl bg-purple-600 px-5 py-2.5 text-xs font-bold uppercase text-white shadow-md shadow-purple-600/15 transition-colors hover:bg-purple-700"
              >
                Avançar <ChevronRight size={16} />
              </button>
            ) : (
              <button
                onClick={() => handleFinalSave(true)}
                disabled={isSaving}
                className="flex items-center gap-1 rounded-xl bg-purple-600 px-6 py-3 text-xs font-bold uppercase text-white shadow-lg shadow-purple-600/25 transition-all hover:bg-purple-700 animate-pulse"
              >
                {isSaving ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
                Publicar Curso EAD
              </button>
            )}
          </div>
        </main>

        {confirmModal?.isOpen && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fadeIn">
            <div className="relative w-full max-w-md rounded-[2.5rem] border border-slate-100 bg-white p-8 shadow-2xl animate-slideUp">
              <h3 className="mb-2 text-lg font-black uppercase tracking-tight text-[#001a33]">{confirmModal.title}</h3>
              <p className="mb-6 text-xs font-semibold leading-relaxed text-slate-500">{confirmModal.message}</p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setConfirmModal(null)}
                  className="flex-1 rounded-xl border border-slate-200 bg-slate-50 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 transition-colors hover:bg-slate-100"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    confirmModal.onConfirm();
                    setConfirmModal(null);
                  }}
                  className="flex-1 rounded-xl border border-red-700/10 bg-red-600 py-3 text-[10px] font-bold uppercase tracking-wider text-white shadow-md shadow-red-600/20 transition-all hover:bg-red-700"
                >
                  Excluir
                </button>
              </div>
            </div>
          </div>
        )}

        {toast && (
          <div className="fixed right-6 top-6 z-[99999] animate-fadeIn">
            <div className={`flex items-center gap-3 rounded-2xl border px-6 py-3.5 text-white shadow-2xl backdrop-blur-md transition-all duration-300 ${
              toast.type === 'success'
                ? 'border-emerald-400 bg-emerald-500/95'
                : toast.type === 'warning'
                  ? 'border-amber-400 bg-amber-500/95'
                  : 'border-red-400 bg-red-500/95'
            }`}>
              {toast.type === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
              <span className="text-xs font-black uppercase tracking-wider">{toast.message}</span>
            </div>
          </div>
        )}
      </div>
    </EadCourseWizardProvider>
  );
};

const EadCourseWizard = (props: EadCourseWizardProps) => (
  <EadCourseWizardSession
    key={props.curso?.id || 'novo-curso-ead'}
    {...props}
  />
);

export default EadCourseWizard;
