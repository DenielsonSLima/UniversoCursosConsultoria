import React from 'react';
import { MonitorPlay, CheckCircle2, ImageIcon, FileText, Lock } from 'lucide-react';
import { useEadCourseWizardContext } from '../EadCourseWizardContext';

const EadCourseWizardStep1 = () => {
  const {
    nome,
    setNome,
    area,
    setArea,
    cargaHoraria,
    setCargaHoraria,
    descricao,
    setDescricao,
    imagemUrl,
    versao,
    setVersao,
    isUploadingCapa,
    subtituloPagina,
    setSubtituloPagina,
    objetivosPagina,
    setObjetivosPagina,
    publicoAlvo,
    setPublicoAlvo,
    requisitos,
    setRequisitos,
    metodologia,
    setMetodologia,
    tempoMinimoMinutos,
    setTempoMinimoMinutos,
    intervaloReprovacaoHoras,
    setIntervaloReprovacaoHoras,
    liberarSequencialmente,
    setLiberarSequencialmente,
    exigirAtividades,
    setExigirAtividades,
    exigirVideosConcluidos,
    setExigirVideosConcluidos,
    handleUploadImage,
    handleRemoveImage,
  } = useEadCourseWizardContext();

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
        <span className="p-2.5 bg-purple-50 text-purple-600 rounded-xl"><MonitorPlay size={20} /></span>
        <h4 className="font-black text-lg text-[#001a33] uppercase tracking-tight">Informações Principais do Curso</h4>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-1.5">
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Nome do Curso *</label>
          <input
            type="text"
            required
            placeholder="Ex: Gestão e Planejamento Hospitalar"
            className="w-full px-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-purple-100 focus:border-purple-500 outline-none font-semibold text-slate-800 transition-all"
            value={nome}
            onChange={e => setNome(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Área de Formação</label>
          <select
            className="w-full px-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-purple-100 focus:border-purple-500 outline-none font-bold text-slate-800 transition-all appearance-none cursor-pointer"
            value={area}
            onChange={e => setArea(e.target.value)}
          >
            <option value="Saúde">Saúde</option>
            <option value="Tecnologia">Tecnologia</option>
            <option value="Gestão">Gestão</option>
            <option value="Educação">Educação</option>
            <option value="Outros">Outros</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Carga Horária (Horas) *</label>
          <input
            type="number"
            required
            placeholder="Ex: 80"
            className="w-full px-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-purple-100 focus:border-purple-500 outline-none font-semibold text-slate-800 transition-all"
            value={cargaHoraria}
            onChange={e => setCargaHoraria(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Versão do curso</label>
          <input
            type="text"
            placeholder="Ex: 1.0"
            className="w-full px-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-purple-100 focus:border-purple-500 outline-none font-semibold text-slate-800 transition-all"
            value={versao}
            onChange={e => setVersao(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Resumo do Curso (Exibido no Catálogo)</label>
        <textarea
          rows={4}
          placeholder="Forneça um breve resumo descrevendo os objetivos do curso, público-alvo e diferenciais."
          className="w-full px-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-purple-100 focus:border-purple-500 outline-none font-semibold text-slate-800 transition-all resize-none"
          value={descricao}
          onChange={e => setDescricao(e.target.value)}
        />
      </div>

      <div className="border border-slate-200 rounded-3xl p-5 bg-slate-50/60 space-y-5">
        <div className="flex items-center gap-2">
          <FileText size={18} className="text-purple-600" />
          <h5 className="font-black text-sm text-[#001a33] uppercase tracking-tight">Página Própria do Curso</h5>
        </div>

        <div className="space-y-1.5">
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Subtítulo Comercial</label>
          <input
            type="text"
            placeholder="Ex: Aprenda com etapas guiadas, atividades e certificado"
            className="w-full px-4 py-3 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-100 outline-none font-semibold text-slate-800"
            value={subtituloPagina}
            onChange={e => setSubtituloPagina(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Objetivos (um por linha)</label>
            <textarea
              rows={5}
              placeholder="Compreender...\nAplicar...\nIdentificar..."
              className="w-full px-4 py-3 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-100 outline-none font-semibold text-slate-800 resize-none"
              value={objetivosPagina}
              onChange={e => setObjetivosPagina(e.target.value)}
            />
          </div>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Público-alvo</label>
              <textarea
                rows={2}
                className="w-full px-4 py-3 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-100 outline-none font-semibold text-slate-800 resize-none"
                value={publicoAlvo}
                onChange={e => setPublicoAlvo(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Requisitos</label>
              <textarea
                rows={2}
                className="w-full px-4 py-3 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-100 outline-none font-semibold text-slate-800 resize-none"
                value={requisitos}
                onChange={e => setRequisitos(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Metodologia</label>
          <textarea
            rows={3}
            placeholder="Como o aluno vai estudar, avançar, fazer atividades e liberar a prova."
            className="w-full px-4 py-3 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-100 outline-none font-semibold text-slate-800 resize-none"
            value={metodologia}
            onChange={e => setMetodologia(e.target.value)}
          />
        </div>
      </div>

      <div className="border border-amber-200 rounded-3xl p-5 bg-amber-50/50 space-y-4">
        <div className="flex items-center gap-2">
          <Lock size={18} className="text-amber-700" />
          <h5 className="font-black text-sm text-[#001a33] uppercase tracking-tight">Regras para Forçar Aprendizagem</h5>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="space-y-1.5">
            <label className="block text-[10px] font-black text-amber-700 uppercase tracking-widest">Tempo mínimo na plataforma</label>
            <input
              type="number"
              className="w-full px-4 py-3 text-sm bg-white border border-amber-200 rounded-xl outline-none font-black text-slate-800"
              value={tempoMinimoMinutos}
              onChange={e => setTempoMinimoMinutos(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-[10px] font-black text-amber-700 uppercase tracking-widest">Retentativa após reprovar</label>
            <input
              type="number"
              min={1}
              className="w-full px-4 py-3 text-sm bg-white border border-amber-200 rounded-xl outline-none font-black text-slate-800"
              value={intervaloReprovacaoHoras}
              onChange={e => setIntervaloReprovacaoHoras(e.target.value)}
            />
            <p className="text-[9px] font-bold text-amber-700">Em horas. Padrão: 3h.</p>
          </div>
          {[
            ['Sequencial', liberarSequencialmente, setLiberarSequencialmente],
            ['Atividades obrigatórias', exigirAtividades, setExigirAtividades],
            ['Vídeos concluídos', exigirVideosConcluidos, setExigirVideosConcluidos]
          ].map(([label, checked, setter]) => (
            <button
              key={label as string}
              type="button"
              onClick={() => (setter as React.Dispatch<React.SetStateAction<boolean>>)(!(checked as boolean))}
              className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left text-xs font-black uppercase tracking-wide transition-all ${
                checked ? 'bg-white border-emerald-200 text-emerald-700' : 'bg-white/70 border-slate-200 text-slate-400'
              }`}
            >
              <span>{label as string}</span>
              <CheckCircle2 size={16} />
            </button>
          ))}
        </div>
      </div>

      {/* Upload de Capa */}
      <div className="space-y-2.5">
        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Imagem de Capa do Curso</label>
        <div className="border-2 border-dashed border-slate-200 rounded-3xl p-6 text-center bg-slate-50/50 flex flex-col items-center justify-center gap-4 relative overflow-hidden group hover:bg-slate-50 transition-colors">
          {imagemUrl ? (
            <>
              <img
                src={imagemUrl}
                alt="Capa do Curso EAD"
                className="max-h-48 rounded-2xl object-cover border border-slate-200 shadow-sm animate-fadeIn"
              />
              <div className="flex gap-2">
                <label className="px-4 py-2 bg-[#001a33] hover:bg-slate-800 text-white text-xs font-bold uppercase tracking-wider rounded-xl cursor-pointer transition-all">
                  {isUploadingCapa ? 'Enviando...' : 'Alterar Imagem'}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => e.target.files?.[0] && handleUploadImage(e.target.files[0], 'capa')}
                    disabled={isUploadingCapa}
                    className="hidden"
                  />
                </label>
                <button
                  onClick={() => void handleRemoveImage('capa')}
                  className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold uppercase tracking-wider rounded-xl transition-all border border-red-200"
                >
                  Remover
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="w-14 h-14 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center border border-slate-200 shadow-inner">
                <ImageIcon size={24} />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-700">Selecione a imagem de capa do curso</p>
                <p className="text-[10px] text-slate-400 mt-1 font-medium">Recomendado formato horizontal (16:9)</p>
              </div>
              <label className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold uppercase tracking-wider rounded-xl cursor-pointer transition-all shadow-md shadow-purple-600/15">
                {isUploadingCapa ? 'Enviando...' : 'Carregar Foto'}
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => e.target.files?.[0] && handleUploadImage(e.target.files[0], 'capa')}
                  disabled={isUploadingCapa}
                  className="hidden"
                />
              </label>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default EadCourseWizardStep1;
