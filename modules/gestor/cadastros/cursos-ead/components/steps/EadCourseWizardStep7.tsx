import { Loader2, Award } from 'lucide-react';
import { useEadCourseWizardContext } from '../EadCourseWizardContext';
import DiplomaPreview from '../../../modelos-documentos/diploma/components/DiplomaPreview';

const EadCourseWizardStep7 = () => {
  const {
    emitirAutomatico,
    setEmitirAutomatico,
    minimoAproveitamento,
    setMinimoAproveitamento,
    modeloCertificadoEad,
    isLoadingModeloCertificado,
    previewTemplateValues,
    certificatePreviewZoom,
    certificatePreviewFrameStyle,
  } = useEadCourseWizardContext();

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
        <span className="p-2.5 bg-purple-50 text-purple-600 rounded-xl"><Award size={20} /></span>
        <div>
          <h4 className="font-black text-lg text-[#001a33] uppercase tracking-tight">Geração de Certificado EAD</h4>
          <p className="text-slate-400 text-xs font-medium mt-0.5">
            Configure as regras acadêmicas. O preview abaixo usa o modelo atual de certificado cadastrado em Formações &gt; Modelos Documentos.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Parâmetros do Certificado */}
        <div className="space-y-5">
          <div className="flex items-start justify-between gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-200">
            <div className="space-y-1">
              <span className="font-bold text-xs text-slate-800 block uppercase tracking-wide">Emissão Automática</span>
              <span className="text-[10px] text-slate-400 font-medium block leading-relaxed">
                Liberar o certificado na área do aluno automaticamente após a aprovação nas provas.
              </span>
            </div>
            <button
              onClick={() => setEmitirAutomatico(!emitirAutomatico)}
              className={`w-12 h-6 rounded-full p-0.5 transition-colors shrink-0 flex items-center ${
                emitirAutomatico ? 'bg-purple-600' : 'bg-slate-300'
              }`}
            >
              <div
                className={`bg-white w-5 h-5 rounded-full shadow-md transform transition-transform ${
                  emitirAutomatico ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <div className="space-y-1.5">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">% de Aproveitamento Mínimo</label>
            <input
              type="number"
              placeholder="Ex: 70"
              className="w-full px-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-purple-100 focus:border-purple-500 outline-none font-semibold text-slate-800"
              value={minimoAproveitamento}
              onChange={e => setMinimoAproveitamento(e.target.value)}
            />
            <p className="text-[9px] text-slate-400 leading-normal">Média geral nas avaliações do curso necessária para obter aprovação.</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <span className="block text-xs font-black uppercase tracking-wide text-slate-800">Modelo aplicado na emissão</span>
            <span className="mt-1 block text-[10px] font-medium leading-relaxed text-slate-400">
              {isLoadingModeloCertificado ? 'Carregando modelo de certificado...' : (modeloCertificadoEad?.nome || 'Modelo não encontrado.')}
            </span>
          </div>
        </div>

        <div className="rounded-3xl border border-purple-100 bg-purple-50/60 p-6">
          <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-purple-700">Modelo usado na emissão</span>
          {isLoadingModeloCertificado ? (
            <p className="text-xs font-bold text-slate-500">Carregando configuração do modelo...</p>
          ) : modeloCertificadoEad ? (
            <>
              <h5 className="text-lg font-black uppercase tracking-tight text-[#001a33]">{modeloCertificadoEad.nome}</h5>
              <p className="mt-1 text-[10px] font-black uppercase tracking-wide text-slate-600">{modeloCertificadoEad.tipoCurso}</p>
              <p className="mt-3 text-xs leading-relaxed text-slate-500">
                Alterações feitas em Formações &gt; Modelos Documentos são refletidas automaticamente nesta prévia.
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-bold">
                <span className="px-2.5 py-1 rounded-full border border-purple-200 bg-white text-purple-700">
                  {modeloCertificadoEad.hasVerso ? 'Frente e verso' : 'Somente frente'}
                </span>
                <span className="px-2.5 py-1 rounded-full border border-slate-200 bg-white text-slate-600">
                  QR Code: {modeloCertificadoEad.hasValidationQrCode ? 'Ativo' : 'Desativado'}
                </span>
              </div>
            </>
          ) : (
            <p className="mt-3 text-xs leading-relaxed text-slate-500">
              Não foi possível carregar o modelo. O curso continua podendo ser salvo com o modelo padrão.
            </p>
          )}
        </div>
      </div>

      {/* Prévia do Certificado */}
      <div className="border border-slate-250 bg-slate-50/50 rounded-3xl p-6 mt-4 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-2 h-full bg-purple-600" />
        <div className="mb-5 flex flex-col gap-1 pl-2">
          <h5 className="font-black text-xs text-slate-600 uppercase tracking-wider">Pré-visualização real do certificado</h5>
          <p className="text-[10px] font-semibold text-slate-400">
            Frente e verso renderizados com o modelo usado na emissão do certificado EAD.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {isLoadingModeloCertificado ? (
            <div className="flex min-h-[260px] items-center justify-center text-xs font-bold text-slate-400">
              <Loader2 size={16} className="mr-2 animate-spin" />
              Carregando preview do certificado...
            </div>
          ) : !modeloCertificadoEad ? (
            <div className="flex min-h-[220px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-xs font-bold text-slate-400">
              Modelo indisponível no momento.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl bg-slate-200/70 p-4">
              <div className="flex min-w-max gap-6">
                <div className="space-y-2">
                  <span className="block text-center text-[10px] font-black uppercase tracking-widest text-slate-500">Frente</span>
                  <div className="relative" style={certificatePreviewFrameStyle}>
                    <div className="absolute left-0 top-0">
                      <DiplomaPreview
                        formData={modeloCertificadoEad}
                        page="frente"
                        zoomLevel={certificatePreviewZoom}
                        previewValues={previewTemplateValues}
                      />
                    </div>
                  </div>
                </div>
                {modeloCertificadoEad.hasVerso && (
                  <div className="space-y-2">
                    <span className="block text-center text-[10px] font-black uppercase tracking-widest text-slate-500">Verso</span>
                    <div className="relative" style={certificatePreviewFrameStyle}>
                      <div className="absolute left-0 top-0">
                        <DiplomaPreview
                          formData={modeloCertificadoEad}
                          page="verso"
                          zoomLevel={certificatePreviewZoom}
                          previewValues={previewTemplateValues}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EadCourseWizardStep7;
