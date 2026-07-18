import React from 'react';
import { AlertTriangle, CheckCircle2, Copy, Layers3, Loader2, Plus, Upload } from 'lucide-react';
import type { CrachaEditorTab, CrachaPeriodoEleitoralEditor } from '../useCrachaPeriodoEleitoralEditor';
import CrachaPeriodoEleitoralElementsPanel from './CrachaPeriodoEleitoralElementsPanel';
import CrachaPeriodoEleitoralFieldInspector from './CrachaPeriodoEleitoralFieldInspector';

interface Props {
  editor: CrachaPeriodoEleitoralEditor;
}

const TABS: [CrachaEditorTab, string][] = [
  ['modelos', 'Modelos'],
  ['config', 'Config'],
  ['frente', 'Frente'],
  ['verso', 'Verso'],
];

const BackgroundControl: React.FC<{
  editor: CrachaPeriodoEleitoralEditor;
  fieldName: 'bgFrenteUrl' | 'bgVersoUrl';
  label: string;
}> = ({ editor, fieldName, label }) => (
  <div>
    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Imagem de Fundo ({label})</label>
    <div className="flex gap-2">
      <input type="text" name={fieldName} placeholder="URL da imagem (.png / .jpg)" value={editor.formData[fieldName] || ''} onChange={editor.handleChange} className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold text-slate-700 outline-none focus:border-blue-500 focus:bg-white transition-all" />
      <label className="flex items-center justify-center p-3 bg-slate-100 hover:bg-blue-50 hover:text-blue-600 rounded-xl border border-slate-200 cursor-pointer transition-colors relative">
        <input type="file" accept="image/*" onChange={(event) => editor.handleUploadBg(event, fieldName)} className="absolute inset-0 opacity-0 cursor-pointer" disabled={editor.isUploading} />
        {editor.isUploading ? <Loader2 size={18} className="animate-spin text-blue-600" /> : <Upload size={18} />}
      </label>
    </div>
    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-1">Recomendado: imagem horizontal na proporção do crachá SES.</p>
  </div>
);

const ModelsPanel: React.FC<Props> = ({ editor }) => (
  <div className="space-y-4 animate-fadeIn">
    <div className="flex gap-2">
      <button type="button" onClick={() => editor.handleNewModel()} className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 py-3 text-[10px] font-black uppercase tracking-widest text-white hover:bg-blue-700"><Plus size={14} /> Novo modelo</button>
      <button type="button" onClick={() => editor.handleNewModel(editor.formData)} className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-3 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:border-blue-200 hover:text-blue-600"><Copy size={14} /> Duplicar</button>
    </div>

    <div className="space-y-3">
      {editor.catalog.models.map((model) => {
        const isActive = editor.catalog.activeModelId === model.id;
        const isSelected = editor.formData.id === model.id;
        return (
          <article key={model.id} className={`overflow-hidden rounded-2xl border ${isSelected ? 'border-blue-300 ring-2 ring-blue-100' : 'border-slate-200'} bg-white`}>
            <div className="flex min-h-24">
              <div className="w-24 shrink-0 bg-slate-100 bg-cover bg-center" style={model.bgFrenteUrl ? { backgroundImage: `url(${model.bgFrenteUrl})` } : undefined}>
                {!model.bgFrenteUrl && <div className="flex h-full items-center justify-center text-slate-300"><Layers3 size={28} /></div>}
              </div>
              <div className="min-w-0 flex-1 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-black uppercase text-[#001a33]">{model.nome}</p>
                    <p className="mt-1 line-clamp-2 text-[10px] font-semibold text-slate-500">{model.hospitalNome || model.orgaoTitulo || 'Hospital não informado'}</p>
                  </div>
                  {isActive && <span className="rounded-full bg-emerald-100 px-2 py-1 text-[8px] font-black uppercase text-emerald-700">Em uso</span>}
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => editor.handleSelectModel(model)} className="rounded-lg bg-slate-100 px-2 py-1.5 text-[8px] font-black uppercase text-slate-700 hover:bg-blue-50 hover:text-blue-600">Editar</button>
                  {!isActive && <button type="button" onClick={() => editor.handleSetActiveModel(model.id)} className="rounded-lg bg-emerald-50 px-2 py-1.5 text-[8px] font-black uppercase text-emerald-700 hover:bg-emerald-100">Usar modelo</button>}
                  <button type="button" onClick={() => editor.handleDeleteModel(model.id)} className="rounded-lg bg-red-50 px-2 py-1.5 text-[8px] font-black uppercase text-red-600 hover:bg-red-100">Excluir</button>
                </div>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  </div>
);

const ConfigPanel: React.FC<Props> = ({ editor }) => {
  const { formData, handleChange } = editor;
  return (
    <div className="space-y-5 animate-fadeIn">
      <div>
        <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Nome do Modelo <span className="text-red-500">*</span></label>
        <input name="nome" value={formData.nome || ''} onChange={handleChange} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all" />
      </div>
      <div>
        <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Status</label>
        <select name="status" value={formData.status || 'ativo'} onChange={handleChange} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all"><option value="ativo">Ativo</option><option value="inativo">Inativo</option></select>
      </div>
      <div>
        <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Nome do Hospital</label>
        <input name="hospitalNome" value={formData.hospitalNome || formData.orgaoTitulo || ''} onChange={handleChange} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all" />
      </div>
      <div>
        <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Título da Frente</label>
        <textarea name="tituloPrincipal" value={formData.tituloPrincipal || ''} onChange={handleChange} rows={2} className="w-full resize-y bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all" />
      </div>
      {[
        ['instituicaoEnsinoPadrao', 'Instituição de Ensino Padrão'],
        ['categoriaPadrao', 'Categoria Profissional'],
        ['instrutorPadrao', 'Instrutor Padrão'],
        ['validadePadrao', 'Validade Padrão'],
      ].map(([name, label]) => (
        <div key={name}><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">{label}</label><input name={name} value={formData[name] || ''} onChange={handleChange} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all" /></div>
      ))}
      <div className="grid grid-cols-3 gap-3">
        {[
          ['corPrimaria', 'Cor Primária'],
          ['corTexto', 'Cor Texto'],
          ['corBorda', 'Cor Borda'],
        ].map(([name, label]) => (
          <div key={name}><label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">{label}</label><input type="color" name={name} value={formData[name] || '#0b58a8'} onChange={handleChange} className="w-full h-12 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer p-1" /></div>
        ))}
      </div>
      <label className="flex items-center gap-3 cursor-pointer p-4 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
        <input type="checkbox" name="hasVerso" checked={formData.hasVerso !== false} onChange={handleChange} className="w-5 h-5 text-blue-600 rounded" />
        <div><span className="block text-sm font-bold text-[#001a33] uppercase">Ter verso impresso</span><span className="block text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Dados complementares e assinaturas no verso.</span></div>
      </label>
    </div>
  );
};

const CrachaPeriodoEleitoralSidebar: React.FC<Props> = ({ editor }) => {
  const { activeTab, availableNow, formData, handleChange, setActiveTab } = editor;
  return (
    <div className="w-full xl:w-[400px] flex flex-col gap-6 shrink-0">
      <div className={`rounded-2xl border p-4 ${availableNow ? 'border-emerald-100 bg-emerald-50 text-emerald-800' : 'border-amber-100 bg-amber-50 text-amber-800'}`}>
        <div className="flex items-start gap-3">
          {availableNow ? <CheckCircle2 size={20} className="mt-0.5 shrink-0" /> : <AlertTriangle size={20} className="mt-0.5 shrink-0" />}
          <div><p className="text-xs font-black uppercase tracking-widest">{availableNow ? 'Modelo habilitado' : 'Modelo desativado'}</p><p className="mt-1 text-xs font-semibold leading-relaxed">O aluno só poderá acessar ou emitir este crachá depois que houver registro de entrada no estágio.</p></div>
        </div>
      </div>

      <div className="p-1 rounded-xl flex gap-1 bg-slate-100">
        {TABS.map(([id, label]) => <button key={id} onClick={() => setActiveTab(id)} className={`flex-1 py-2 px-2 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all ${activeTab === id ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{label}</button>)}
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-6 max-h-[60vh] xl:max-h-[68vh]">
        {activeTab === 'modelos' && <ModelsPanel editor={editor} />}
        {activeTab === 'config' && <ConfigPanel editor={editor} />}
        {activeTab === 'frente' && (
          <div className="space-y-5 animate-fadeIn">
            <BackgroundControl editor={editor} fieldName="bgFrenteUrl" label="Frente" />
            <label className="flex items-center gap-3 cursor-pointer p-3 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
              <input type="checkbox" name="ocultarDesignPadrao" checked={!!formData.ocultarDesignPadrao} onChange={handleChange} className="w-5 h-5 text-blue-600 rounded" />
              <div><span className="block text-xs font-bold text-[#001a33] uppercase">Ocultar desenho padrão</span><span className="block text-[8px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Mostra apenas a imagem de fundo customizada.</span></div>
            </label>
            <CrachaPeriodoEleitoralElementsPanel editor={editor} page="frente" />
          </div>
        )}
        {activeTab === 'verso' && formData.hasVerso !== false && (
          <div className="space-y-5 animate-fadeIn"><BackgroundControl editor={editor} fieldName="bgVersoUrl" label="Verso" /><CrachaPeriodoEleitoralElementsPanel editor={editor} page="verso" /></div>
        )}
        {activeTab === 'verso' && formData.hasVerso === false && (
          <div className="p-8 text-center text-slate-500 bg-slate-50 rounded-xl border border-slate-200 border-dashed"><p className="text-xs font-bold uppercase tracking-widest">O verso está desabilitado na aba Config.</p></div>
        )}
      </div>

      <CrachaPeriodoEleitoralFieldInspector editor={editor} />
    </div>
  );
};

export default CrachaPeriodoEleitoralSidebar;
