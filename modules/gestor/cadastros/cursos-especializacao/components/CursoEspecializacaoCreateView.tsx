import React from 'react';
import { ArrowLeft, Award, Loader2, Image as ImageIcon, Save, Banknote, Receipt, CreditCard } from 'lucide-react';

interface CursoEspecializacaoCreateViewProps {
  areasDisponiveis: string[];
  financeiroBoleto: boolean;
  financeiroCartao: boolean;
  financeiroMaxParcelas: number;
  financeiroPix: boolean;
  isCreatingCurso: boolean;
  isUploading: boolean;
  newAreaName: string;
  newCursoArea: string;
  newCursoCargaHoraria: number;
  newCursoDesc: string;
  newCursoDuracaoMeses: number;
  newCursoImagemUrl: string;
  newCursoNome: string;
  newCursoPublicarSite: boolean;
  newCursoVersao: string;
  showNewAreaInput: boolean;
  handleAddArea: () => void;
  resetCreateForm: () => void;
  handleCreateCurso: (event: React.FormEvent) => void;
  handleUploadImagem: (event: React.ChangeEvent<HTMLInputElement>) => void;
  setFinanceiroBoleto: React.Dispatch<React.SetStateAction<boolean>>;
  setFinanceiroCartao: React.Dispatch<React.SetStateAction<boolean>>;
  setFinanceiroMaxParcelas: React.Dispatch<React.SetStateAction<number>>;
  setFinanceiroPix: React.Dispatch<React.SetStateAction<boolean>>;
  setNewAreaName: React.Dispatch<React.SetStateAction<string>>;
  setNewCursoArea: React.Dispatch<React.SetStateAction<string>>;
  setNewCursoCargaHoraria: React.Dispatch<React.SetStateAction<number>>;
  setNewCursoDesc: React.Dispatch<React.SetStateAction<string>>;
  setNewCursoDuracaoMeses: React.Dispatch<React.SetStateAction<number>>;
  setNewCursoImagemUrl: React.Dispatch<React.SetStateAction<string>>;
  setNewCursoNome: React.Dispatch<React.SetStateAction<string>>;
  setNewCursoPublicarSite: React.Dispatch<React.SetStateAction<boolean>>;
  setNewCursoVersao: React.Dispatch<React.SetStateAction<string>>;
  setShowNewAreaInput: React.Dispatch<React.SetStateAction<boolean>>;
}

const CursoEspecializacaoCreateView: React.FC<CursoEspecializacaoCreateViewProps> = ({
  areasDisponiveis,
  financeiroBoleto,
  financeiroCartao,
  financeiroMaxParcelas,
  financeiroPix,
  isCreatingCurso,
  isUploading,
  newAreaName,
  newCursoArea,
  newCursoCargaHoraria,
  newCursoDesc,
  newCursoDuracaoMeses,
  newCursoImagemUrl,
  newCursoNome,
  newCursoPublicarSite,
  newCursoVersao,
  showNewAreaInput,
  handleAddArea,
  resetCreateForm,
  handleCreateCurso,
  handleUploadImagem,
  setFinanceiroBoleto,
  setFinanceiroCartao,
  setFinanceiroMaxParcelas,
  setFinanceiroPix,
  setNewAreaName,
  setNewCursoArea,
  setNewCursoCargaHoraria,
  setNewCursoDesc,
  setNewCursoDuracaoMeses,
  setNewCursoImagemUrl,
  setNewCursoNome,
  setNewCursoPublicarSite,
  setNewCursoVersao,
  setShowNewAreaInput,
}: CursoEspecializacaoCreateViewProps) => (
  <div className="formacoes-cursos-create flex min-w-0 flex-col h-full animate-fadeIn bg-slate-50 min-h-screen overflow-x-hidden">
    <div className="formacoes-cursos-create-heading flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 bg-white px-4 py-5 sm:px-6 border-b border-slate-200">
      <div className="flex min-w-0 items-center gap-4">
        <button
          type="button"
          onClick={() => resetCreateForm()}
          className="flex-shrink-0 p-2 rounded-xl border border-slate-200 text-slate-400 hover:text-rose-600 hover:border-rose-200 transition-colors bg-white shadow-sm"
          aria-label="Voltar"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="min-w-0">
          <span className="text-[10px] font-black text-rose-600 uppercase tracking-widest bg-rose-50 px-2.5 py-1 rounded-md">
            Especialização Técnica
          </span>
          <h3 className="formacoes-cursos-create-title truncate text-lg sm:text-xl font-black text-[#001a33] mt-1.5 uppercase tracking-tight">
            Nova Especialização
          </h3>
        </div>
      </div>

      <button
        type="submit"
        form="create-especializacao-form"
        disabled={isCreatingCurso || isUploading}
        className="formacoes-cursos-create-submit flex w-full sm:w-auto items-center justify-center gap-2 bg-[#001a33] hover:bg-rose-600 text-white px-5 py-3 rounded-xl font-bold uppercase text-xs tracking-wider transition-all disabled:opacity-70 shadow-lg shadow-rose-900/20"
      >
        {isCreatingCurso ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
        Criar Especialização
      </button>
    </div>

    <div className="formacoes-cursos-create-steps bg-white border-b border-slate-200 px-3 py-3 sm:px-6 sm:py-4">
      <div className="mx-auto grid w-full max-w-5xl grid-cols-1">
        <div className="group relative flex min-w-0 flex-col items-center gap-2 px-1">
          <span className="relative z-10 w-8 h-8 rounded-xl flex items-center justify-center font-bold text-sm transition-all border bg-rose-600 border-rose-600 text-white shadow-md shadow-rose-600/20">
            1
          </span>
          <span className="block w-full truncate text-center text-[10px] font-black uppercase tracking-wide text-rose-600">
            Informações Básicas
          </span>
        </div>
      </div>
    </div>

    <div className="formacoes-cursos-create-body flex-1 min-w-0 max-w-4xl w-full mx-auto p-4 sm:p-6 md:p-8">
      <form id="create-especializacao-form" onSubmit={handleCreateCurso} className="formacoes-cursos-create-form bg-white border border-slate-200 rounded-[2.5rem] p-6 md:p-8 shadow-sm space-y-6">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
          <span className="p-2.5 bg-rose-50 text-rose-600 rounded-xl">
            <Award size={20} />
          </span>
          <h4 className="formacoes-cursos-create-section-title font-black text-lg text-[#001a33] uppercase tracking-tight">
            Informações Principais do Curso
          </h4>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="md:col-span-2 space-y-1.5">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Nome do Curso *</label>
            <input required type="text" value={newCursoNome} onChange={(e) => setNewCursoNome(e.target.value)} placeholder="Ex: Especialização em Instrumentação Cirúrgica" className="w-full px-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-rose-100 focus:border-rose-500 outline-none font-semibold text-slate-800 transition-all" />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-3">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Área de Formação</label>
              <button type="button" onClick={() => setShowNewAreaInput((prev) => !prev)} className="text-[10px] font-black uppercase tracking-wider text-rose-600 hover:text-rose-700">
                + Nova área
              </button>
            </div>
            <div className="flex flex-col gap-2">
              <select value={newCursoArea} onChange={(e) => setNewCursoArea(e.target.value)} className="w-full px-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-rose-100 focus:border-rose-500 outline-none font-bold text-slate-800 transition-all cursor-pointer">
                {areasDisponiveis.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              {showNewAreaInput && (
                <div className="flex gap-2">
                  <input type="text" value={newAreaName} onChange={(e) => setNewAreaName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddArea())} placeholder="Nome da nova área" className="min-w-0 flex-1 px-4 py-2.5 text-xs bg-white border border-rose-200 rounded-xl focus:ring-2 focus:ring-rose-100 outline-none font-bold text-slate-800" />
                  <button type="button" onClick={handleAddArea} className="px-4 py-2.5 rounded-xl bg-rose-600 text-white text-[10px] font-black uppercase tracking-wider hover:bg-rose-700">Adicionar</button>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Carga Horária (Horas) *</label>
            <input required type="number" min="1" value={newCursoCargaHoraria} onChange={(e) => setNewCursoCargaHoraria(parseInt(e.target.value, 10) || 0)} placeholder="Ex: 120" className="w-full px-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-rose-100 focus:border-rose-500 outline-none font-semibold text-slate-800 transition-all" />
          </div>

          <div className="space-y-1.5">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Versão do Curso</label>
            <input required type="text" value={newCursoVersao} onChange={(e) => setNewCursoVersao(e.target.value)} placeholder="Ex: 1.0" className="w-full px-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-rose-100 focus:border-rose-500 outline-none font-semibold text-slate-800 transition-all" />
          </div>

          <div className="space-y-1.5">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Duração (Meses)</label>
            <input required type="number" min="1" value={newCursoDuracaoMeses} onChange={(e) => setNewCursoDuracaoMeses(parseInt(e.target.value, 10) || 0)} placeholder="Ex: 6" className="w-full px-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-rose-100 focus:border-rose-500 outline-none font-semibold text-slate-800 transition-all" />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Resumo do Curso (Exibido no Catálogo)</label>
          <textarea value={newCursoDesc} onChange={(e) => setNewCursoDesc(e.target.value)} rows={4} placeholder="Forneça um breve resumo descrevendo os objetivos do curso, público-alvo e diferenciais." className="w-full px-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-rose-100 focus:border-rose-500 outline-none font-semibold text-slate-800 transition-all resize-none" />
        </div>

        <div className="border border-slate-200 rounded-3xl p-5 bg-slate-50/60 space-y-4">
          <div className="flex items-center gap-2">
            <Banknote size={18} className="text-rose-600" />
            <h5 className="font-black text-sm text-[#001a33] uppercase tracking-tight">Opções Financeiras do Curso</h5>
          </div>
          <p className="text-xs font-semibold leading-relaxed text-slate-500">
            Aqui ficam apenas os meios aceitos e o limite do cartão. Valor, número de parcelas, desconto, juros e multa serão definidos na turma.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              { label: 'Pix', icon: Banknote, enabled: financeiroPix, onToggle: () => setFinanceiroPix((prev) => !prev) },
              { label: 'Boleto', icon: Receipt, enabled: financeiroBoleto, onToggle: () => setFinanceiroBoleto((prev) => !prev) },
              { label: 'Cartão', icon: CreditCard, enabled: financeiroCartao, onToggle: () => setFinanceiroCartao((prev) => !prev) }
            ].map((method) => {
              const Icon = method.icon;
              return (
                <button type="button" key={method.label} onClick={method.onToggle} className={`flex items-center justify-between rounded-2xl border px-4 py-4 text-left transition-all ${method.enabled ? 'border-rose-200 bg-white text-rose-700 shadow-sm' : 'border-slate-200 bg-white/70 text-slate-400'}`}>
                  <span className="flex items-center gap-2 text-xs font-black uppercase tracking-wide">
                    <Icon size={16} />
                    {method.label}
                  </span>
                  <span className={`h-5 w-5 rounded-full border ${method.enabled ? 'border-rose-500 bg-rose-500' : 'border-slate-300 bg-white'}`} />
                </button>
              );
            })}
          </div>
          <label className="flex flex-col gap-2 md:max-w-xs">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Máximo de parcelas no cartão</span>
            <input type="number" min={1} max={12} disabled={!financeiroCartao} value={financeiroMaxParcelas} onChange={(e) => setFinanceiroMaxParcelas(Math.max(1, Math.min(12, Number(e.target.value) || 1)))} className="w-full px-4 py-3 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-rose-100 focus:border-rose-500 outline-none font-black text-slate-800 disabled:opacity-50" />
          </label>
        </div>

        <div className="border border-slate-200 rounded-3xl p-5 bg-slate-50/60 space-y-4">
          <div className="flex items-center gap-2">
            <ImageIcon size={18} className="text-rose-600" />
            <h5 className="font-black text-sm text-[#001a33] uppercase tracking-tight">Imagem de Capa do Curso</h5>
          </div>
          <div className="border-2 border-dashed border-slate-200 rounded-3xl p-6 text-center bg-white flex flex-col items-center justify-center gap-4">
            {newCursoImagemUrl ? (
              <>
                <img src={newCursoImagemUrl} alt="Capa da especialização" className="max-h-48 rounded-2xl object-cover border border-slate-200 shadow-sm" />
                <button type="button" onClick={() => setNewCursoImagemUrl('')} className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold uppercase tracking-wider rounded-xl transition-all border border-red-200">Remover</button>
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
              </>
            )}
            <label className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold uppercase tracking-wider rounded-xl cursor-pointer transition-all shadow-md shadow-rose-600/15">
              {isUploading ? 'Enviando...' : newCursoImagemUrl ? 'Alterar Imagem' : 'Carregar Foto'}
              <input type="file" accept="image/*" onChange={handleUploadImagem} disabled={isUploading} className="hidden" />
            </label>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <input type="checkbox" id="newCursoEspecializacaoPublicarSitePage" checked={newCursoPublicarSite} onChange={(e) => setNewCursoPublicarSite(e.target.checked)} className="h-4 w-4 cursor-pointer rounded border-slate-300 text-rose-600 focus:ring-rose-500" />
          <label htmlFor="newCursoEspecializacaoPublicarSitePage" className="cursor-pointer select-none text-xs font-bold text-slate-700">
            Publicar no site público
          </label>
        </div>
      </form>
    </div>
  </div>
);

export default CursoEspecializacaoCreateView;
