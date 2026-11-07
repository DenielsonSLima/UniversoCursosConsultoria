import InstitutionalSelect from '../../../shared/components/InstitutionalSelect';
import { AlertTriangle, ChevronRight, CreditCard, FileCheck2, Loader2, RefreshCw, Search, Users } from 'lucide-react';
import { SecretariaDocumentoDefinition } from './secretaria-documentos.types';
import SecretariaIssuedDocumentModal from './SecretariaIssuedDocumentModal';
import { getSecretariaErrorMessage } from './secretaria-error';
import { useSecretariaDocumentoWorkspace } from './useSecretariaDocumentoWorkspace';
import SecretariaDocumentoPrint from './SecretariaDocumentoPrint';
import SecretariaDocumentoResult from './SecretariaDocumentoResult';
import SecretariaDocumentoConfirmation from './SecretariaDocumentoConfirmation';
import SecretariaDocumentoCustomSelection from './SecretariaDocumentoCustomSelection';
import SecretariaDocumentoBatchSelection from './SecretariaDocumentoBatchSelection';
import SecretariaDocumentoIndividualSelection from './SecretariaDocumentoIndividualSelection';

  const SecretariaDocumentoEmissionPage = ({ definition }: { definition: SecretariaDocumentoDefinition }) => {
  const workspace = useSecretariaDocumentoWorkspace(definition);
  const {
    context,
    mode,
    step,
    setStep,
    selectedTemplateId,
    setSelectedTemplateId,
    issuedEmissions,
    isIssuedDocumentOpen,
    setIsIssuedDocumentOpen,
    selectsFichaTemplate,
    usesDirectDocumentViewer,
    isLoadingFichaTemplates,
    compatibleFichaTemplates,
    dataLoadError,
    retryFailedDataQueries,
    emissionMutation,
    canContinue,
    resetFlow,
  } = workspace;
  if (workspace.isCrachaPrinting) return <SecretariaDocumentoPrint workspace={workspace} />;
  return (
    <div className="animate-fadeIn">
      <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 p-4">
          <div data-secretaria-modes className={`grid gap-2 ${definition.allowBatch !== false ? 'md:grid-cols-3' : 'md:grid-cols-1'}`}>
          <button
            aria-pressed={mode === 'individual'}
            onClick={() => resetFlow('individual')}
            className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition-colors ${mode === 'individual' ? 'border-cyan-200 bg-cyan-50 text-cyan-800' : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200'}`}
          >
            <Search size={20} />
            <div>
              <p className="text-xs font-black uppercase tracking-wider">Individual</p>
              <p className="mt-0.5 text-[11px] font-medium leading-snug">
                {usesDirectDocumentViewer
                  ? 'Busque um aluno e visualize o documento.'
                  : 'Localize um aluno e confira a matrícula.'}
              </p>
            </div>
          </button>
          {definition.allowBatch !== false && (
            <>
              <button
                aria-pressed={mode === 'lote'}
            onClick={() => resetFlow('lote')}
                className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition-colors ${mode === 'lote' ? 'border-cyan-200 bg-cyan-50 text-cyan-800' : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200'}`}
              >
                <Users size={20} />
                <div>
                  <p className="text-xs font-black uppercase tracking-wider">Em lote</p>
                  <p className="mt-0.5 text-[11px] font-medium leading-snug">
                    {usesDirectDocumentViewer
                      ? 'Gere para uma turma ou todos os alunos.'
                      : 'Prepare a emissão para uma turma.'}
                  </p>
                </div>
              </button>
              <button
                aria-pressed={mode === 'custom'}
            onClick={() => resetFlow('custom')}
                className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition-colors ${mode === 'custom' ? 'border-cyan-200 bg-cyan-50 text-cyan-800' : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200'}`}
              >
                <CreditCard size={20} />
                <div>
                  <p className="text-xs font-black uppercase tracking-wider">Personalizado</p>
                  <p className="mt-0.5 text-[11px] font-medium leading-snug">
                    {usesDirectDocumentViewer
                      ? 'Monte uma lista mista de alunos.'
                      : 'Monte uma lista de alunos deste polo.'}
                  </p>
                </div>
              </button>
            </>
          )}
          </div>
        </div>

        {selectsFichaTemplate && (
          <div className="border-b border-slate-100 bg-blue-50/50 p-4">
            <label className="block text-[9px] font-black uppercase tracking-[0.18em] text-blue-700">
              Modelo da ficha
            </label>
            <InstitutionalSelect
              value={selectedTemplateId}
              onValueChange={(value) => setSelectedTemplateId(value)}
              ariaLabel="Modelo da ficha"
              options={compatibleFichaTemplates.map((model) => ({ value: model.id, label: `${model.nome} — ${model.tipoCurso === 'TODOS' ? 'Todos os cursos' : model.tipoCurso}` }))}
              disabled={isLoadingFichaTemplates || !compatibleFichaTemplates.length}
              placeholder={isLoadingFichaTemplates ? 'Carregando modelos...' : 'Nenhum modelo ativo compatível com a seleção'}
              className="mt-2 w-full"
            />
            {!isLoadingFichaTemplates && !compatibleFichaTemplates.length && (
              <p className="mt-2 text-[10px] font-bold text-rose-600">
                Cadastre e ative um modelo geral ou compatível em Formações → Ficha Cadastral antes de emitir.
              </p>
            )}
          </div>
        )}

        {dataLoadError && (
          <div className="mx-4 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
            <div className="flex min-w-0 items-start gap-3">
              <AlertTriangle className="mt-0.5 shrink-0 text-amber-600" size={18} />
              <div>
                <p className="text-xs font-black uppercase tracking-wider">Dados temporariamente indisponíveis</p>
                <p className="mt-1 text-xs font-semibold">
                  {getSecretariaErrorMessage(
                    dataLoadError,
                    'Não foi possível carregar os dados necessários para esta emissão.',
                  )}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={retryFailedDataQueries}
              className="inline-flex items-center gap-2 rounded-xl bg-amber-700 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-white hover:bg-amber-800"
            >
              <RefreshCw size={13} /> Tentar novamente
            </button>
          </div>
        )}

      <div className="border-t border-slate-100">
        {!usesDirectDocumentViewer && (
        <div className="grid grid-cols-3 border-b border-slate-100 bg-slate-50/70">
          {['Selecionar', 'Conferir', 'Concluído'].map((label, index) => {
            const itemStep = (index + 1) as 1 | 2 | 3;
            return (
              <div key={label} className={`px-4 py-3 text-center text-[10px] font-black uppercase tracking-widest ${step >= itemStep ? definition.accent : 'text-slate-350'}`}>
                {index + 1}. {label}
              </div>
            );
          })}
        </div>
        )}

        <div className="p-6 md:p-9 min-h-[390px]">
          <SecretariaDocumentoIndividualSelection workspace={workspace} />

          <SecretariaDocumentoBatchSelection workspace={workspace} />

          <SecretariaDocumentoCustomSelection workspace={workspace} />

          {usesDirectDocumentViewer && mode !== 'individual' && emissionMutation.isError && (
            <p className="mt-5 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-bold text-red-700">
              {getSecretariaErrorMessage(
                emissionMutation.error,
                'Não foi possível preparar a visualização.',
              )}
            </p>
          )}

          <SecretariaDocumentoConfirmation workspace={workspace} />

          <SecretariaDocumentoResult workspace={workspace} />
        </div>

        {!usesDirectDocumentViewer && step < 3 && (
          <div className="px-6 md:px-9 py-5 border-t border-slate-100 bg-slate-50/70 flex justify-between gap-3">
            <button
              onClick={() => step === 2 ? setStep(1) : resetFlow(mode)}
              className="px-5 py-3 rounded-xl border border-slate-200 bg-white text-slate-600 text-xs font-black uppercase tracking-wider"
            >
              {step === 2 ? 'Voltar' : 'Limpar'}
            </button>
            <button
              disabled={!canContinue || emissionMutation.isPending}
              onClick={() => {
                if (step === 1) {
                  setStep(2);
                  return;
                }
                emissionMutation.mutate();
              }}
              className="px-6 py-3 rounded-xl bg-[#001a33] text-white text-xs font-black uppercase tracking-wider disabled:opacity-40 flex items-center gap-2"
            >
              {emissionMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : step === 1 ? <ChevronRight size={15} /> : <FileCheck2 size={15} />}
              {step === 1 ? 'Continuar' : definition.actionLabel}
            </button>
          </div>
        )}
      </div>
      {isIssuedDocumentOpen && issuedEmissions.length > 0 && (
        <SecretariaIssuedDocumentModal
          emissions={issuedEmissions}
          poloId={context.poloId}
          definition={definition}
          onClose={() => setIsIssuedDocumentOpen(false)}
        />
      )}
    </div>
    </div>
  );
};

export default SecretariaDocumentoEmissionPage;
