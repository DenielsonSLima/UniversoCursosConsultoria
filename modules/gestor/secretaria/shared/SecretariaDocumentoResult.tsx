import { CheckCircle2, Printer } from 'lucide-react';
import type { SecretariaDocumentoWorkspace } from './useSecretariaDocumentoWorkspace';

  const SecretariaDocumentoResult = ({ workspace }: { workspace: SecretariaDocumentoWorkspace }) => {
  const {
    definition,
    mode,
    step,
    crachaPrintLayout,
    setIsCrachaPrinting,
    issuedEmissions,
    setIsIssuedDocumentOpen,
    isCrachaPeriodoEleitoral,
    isCrachaDocument,
    usesDirectDocumentViewer,
    supportsIssuedDocumentPreview,
    emissionMutation,
    resetFlow,
    crachaPrintItems,
  } = workspace;
  return (<>
{!usesDirectDocumentViewer && step === 3 && (
            <div className="py-10 text-center">
              <div className={`w-20 h-20 rounded-full ${definition.softAccent} ${definition.accent} flex items-center justify-center mx-auto`}>
                <CheckCircle2 size={38} />
              </div>
              <h4 className="text-2xl font-black text-[#001a33] mt-6">Emissão preparada</h4>
              <p className="text-sm text-slate-500 mt-2 max-w-md mx-auto">
                A solicitação foi registrada para esta unidade e já pode seguir para a composição do documento.
              </p>
              {!!emissionMutation.data?.codes?.length && (
                <div className="mt-6 max-w-xl mx-auto p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">
                    {emissionMutation.data.codes.length === 1 ? 'Código de validação' : 'Códigos de validação'}
                  </p>
                  <div className="max-h-36 overflow-y-auto space-y-2">
                    {emissionMutation.data.codes.map((code: string) => (
                      <code key={code} className="block px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-black text-blue-700 select-all">
                        {code}
                      </code>
                    ))}
                  </div>
                </div>
              )}
              {isCrachaDocument && !!crachaPrintItems.length && (
                <div className="mt-6 max-w-xl mx-auto p-4 bg-rose-50 border border-rose-100 rounded-2xl text-left">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-rose-700">Exportação do crachá</p>
                      <p className="mt-1 text-xs font-semibold text-slate-600">
                        {isCrachaPeriodoEleitoral
                          ? 'Modelo eleitoral: 2 alunos por folha, frente e verso lado a lado.'
                          : `Layout selecionado: ${crachaPrintLayout === 'dobra' ? '5 por folha, frente e verso juntos' : '10 por página, frente e verso'}.`}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsCrachaPrinting(true)}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-5 py-3 text-xs font-black uppercase tracking-widest text-white hover:bg-rose-700"
                    >
                      <Printer size={15} /> Imprimir / PDF
                    </button>
                  </div>
                </div>
              )}
              {supportsIssuedDocumentPreview && issuedEmissions.length > 0 && (
                <button
                  type="button"
                  onClick={() => setIsIssuedDocumentOpen(true)}
                  className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg hover:bg-blue-700"
                >
                  <Printer size={15} /> Abrir documento / PDF
                </button>
              )}
              <button onClick={() => resetFlow(mode)} className="mt-7 px-6 py-3 rounded-xl bg-[#001a33] text-white text-xs font-black uppercase tracking-widest">
                Nova emissão
              </button>
            </div>
          )}
</>);
};

export default SecretariaDocumentoResult;
