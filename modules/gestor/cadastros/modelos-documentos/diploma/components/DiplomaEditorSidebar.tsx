import React from 'react';
import { Eye, FileSignature, Image as ImageIcon, Layout, Loader2, Plus, Sliders, Type, Upload } from 'lucide-react';
import { getTemplateBackgroundUrl } from './DiplomaPreview';
import DiplomaElementProperties from './DiplomaElementProperties';
import { buildBackgroundPatch, DiplomaEditorTab } from './diploma-editor.helpers';

interface DiplomaEditorSidebarProps {
  formData: any;
  activeTab: DiplomaEditorTab;
  selectedBlock: any;
  inactiveBlocks: any[];
  copiedVar: string | null;
  isUploading: boolean;
  signatureSourceOptions: Array<{ value: string; label: string }>;
  setFormData: React.Dispatch<React.SetStateAction<any>>;
  setActiveTab: React.Dispatch<React.SetStateAction<DiplomaEditorTab>>;
  onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void;
  onUploadBackground: (event: React.ChangeEvent<HTMLInputElement>, field: 'bgFrenteUrl' | 'bgVersoUrl') => void;
  onUploadBlockImage: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onUploadSignature: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onAddTextBlock: () => void;
  onAddConfiguredSignature: (source: 'diretoriaGeral' | 'secretaria', label: string) => void;
  onAddBlock: (blockId: string) => void;
  onUpdateBlock: (blockId: string, key: string, value: any) => void;
  onRemoveBlock: (blockId: string) => void;
  onCopy: (token: string) => void;
}

const DiplomaEditorSidebar: React.FC<DiplomaEditorSidebarProps> = ({
  formData,
  activeTab,
  selectedBlock,
  inactiveBlocks,
  copiedVar,
  isUploading,
  signatureSourceOptions,
  setFormData,
  setActiveTab,
  onChange,
  onUploadBackground,
  onUploadBlockImage,
  onUploadSignature,
  onAddTextBlock,
  onAddConfiguredSignature,
  onAddBlock,
  onUpdateBlock,
  onRemoveBlock,
  onCopy,
}) => (
  <div className="w-full xl:w-[400px] flex flex-col gap-6 shrink-0">
    <div className="p-1 rounded-xl flex gap-1 bg-slate-150 border border-slate-200">
      <button onClick={() => setActiveTab('visualizar')} className={`flex-1 py-2.5 px-3 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all flex items-center justify-center gap-1.5 ${activeTab === 'visualizar' ? 'bg-[#001a33] text-white shadow-md' : 'text-slate-600 hover:text-slate-800'}`}><Eye size={14} /> Final</button>
      <button onClick={() => setActiveTab('frente')} className={`flex-1 py-2.5 px-3 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all flex items-center justify-center gap-1.5 ${activeTab === 'frente' ? 'bg-[#001a33] text-white shadow-md' : 'text-slate-600 hover:text-slate-800'}`}><Layout size={14} /> Frente</button>
      <button onClick={() => setActiveTab('verso')} className={`flex-1 py-2.5 px-3 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all flex items-center justify-center gap-1.5 ${activeTab === 'verso' ? 'bg-[#001a33] text-white shadow-md' : 'text-slate-600 hover:text-slate-800'}`}><Sliders size={14} /> Verso</button>
    </div>

    <div className="flex-grow overflow-y-auto custom-scrollbar pr-2 space-y-6 max-h-[60vh] xl:max-h-[calc(100vh-25rem)]">
      {activeTab === 'visualizar' && (
        <div className="space-y-5 animate-fadeIn">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Nome do Modelo</label>
            <input type="text" name="nome" value={formData.nome} readOnly placeholder="Ex: Diploma Padrão Téc. Enfermagem" className="w-full bg-slate-100 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-600 outline-none" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Tipo de Curso</label>
            <select name="tipoCurso" value={formData.tipoCurso} disabled className="w-full bg-slate-100 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-600 outline-none">
              <option value="Educação a Distância (EAD)">Educação a Distância (EAD)</option>
              <option value="Cursos Especialização">Cursos Especialização</option>
              <option value="Cursos Técnicos">Cursos Técnicos</option>
              <option value="Cursos Livres">Cursos Livres</option>
            </select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              ['corPrimaria', 'Cor Primária', '#001a33'],
              ['corSecundaria', 'Cor Secundária', '#e2e8f0'],
              ['corTexto', 'Cor do Texto', '#1e293b'],
            ].map(([name, label, fallback]) => (
              <div key={name}>
                <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">{label}</label>
                <input type="color" name={name} value={formData[name] || fallback} onChange={onChange} className="w-full h-10 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer p-1" />
              </div>
            ))}
          </div>
          <div className="space-y-3 pt-4 border-t border-slate-100">
            <label className="flex items-center gap-3 cursor-pointer p-4 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
              <input type="checkbox" name="hasVerso" checked={formData.hasVerso} onChange={onChange} className="w-5 h-5 text-purple-600 rounded" />
              <div><span className="block text-sm font-bold text-[#001a33] uppercase">Ter página de verso</span><span className="block text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Histórico acadêmico e registros.</span></div>
            </label>
            <div className="p-4 border border-slate-200 rounded-xl bg-slate-50">
              <span className="block text-sm font-bold text-[#001a33] uppercase">Verso com marca d'água da empresa</span>
              <span className="block text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Usa automaticamente a imagem paisagem cadastrada em Configurações.</span>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div><label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Opacidade</label><input type="range" min="0.02" max="0.35" step="0.01" value={formData.landscapeWatermarkOpacity || 0.1} onChange={(event) => setFormData({ ...formData, landscapeWatermarkOpacity: Number(event.target.value) })} className="w-full accent-purple-600" /></div>
                <div><label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Escala</label><input type="range" min="25" max="110" step="1" value={formData.landscapeWatermarkScale || 55} onChange={(event) => setFormData({ ...formData, landscapeWatermarkScale: Number(event.target.value) })} className="w-full accent-purple-600" /></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {(activeTab === 'frente' || activeTab === 'verso') && (
        <div className="space-y-6 animate-fadeIn">
          <div className="bg-slate-50 p-4 border border-slate-200 rounded-2xl">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Imagem de Fundo ({activeTab === 'frente' ? 'Frente' : 'Verso'})</label>
            <div className="flex gap-2">
              <input
                type="text"
                name={activeTab === 'frente' ? 'bgFrenteUrl' : 'bgVersoUrl'}
                placeholder="URL da imagem de fundo (.png / .jpg)"
                value={getTemplateBackgroundUrl(formData, activeTab)}
                onChange={(event) => setFormData({ ...formData, ...buildBackgroundPatch(activeTab, event.target.value) })}
                className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-semibold text-slate-700 outline-none focus:border-purple-500"
              />
              <label className="flex items-center justify-center p-3 bg-white hover:bg-purple-50 hover:text-purple-600 rounded-xl border border-slate-200 cursor-pointer transition-colors relative shadow-sm shrink-0">
                <input type="file" accept="image/*" onChange={(event) => onUploadBackground(event, activeTab === 'frente' ? 'bgFrenteUrl' : 'bgVersoUrl')} className="absolute inset-0 opacity-0 cursor-pointer" disabled={isUploading} />
                {isUploading ? <Loader2 size={18} className="animate-spin text-purple-600" /> : <Upload size={18} />}
              </label>
            </div>
            <p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest mt-1.5 leading-normal">Recomendado: Proporção A4 horizontal (2970 x 2100 px). Pode ser exportado do Canva/Photoshop.</p>
          </div>

          <div className="bg-slate-50 p-4 border border-slate-200 rounded-2xl">
            <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2.5">Inserir novos elementos</span>
            <div className="flex flex-wrap gap-2">
              <button onClick={onAddTextBlock} className="flex items-center gap-1 bg-white hover:bg-purple-50 text-slate-700 hover:text-purple-700 font-bold text-[9px] uppercase tracking-wider px-3 py-2 rounded-lg border border-slate-200 transition-colors shadow-sm"><Type size={12} /> Texto</button>
              <label className="flex items-center gap-1 bg-white hover:bg-purple-50 text-slate-700 hover:text-purple-700 font-bold text-[9px] uppercase tracking-wider px-3 py-2 rounded-lg border border-slate-200 transition-colors shadow-sm cursor-pointer">
                <input type="file" accept="image/*" onChange={onUploadBlockImage} className="hidden" disabled={isUploading} />
                {isUploading ? <Loader2 size={12} className="animate-spin" /> : <ImageIcon size={12} />} Imagem
              </label>
              <button onClick={() => onAddConfiguredSignature('diretoriaGeral', 'Assinatura Diretoria Geral')} className="flex items-center gap-1 bg-white hover:bg-purple-50 text-slate-700 hover:text-purple-700 font-bold text-[9px] uppercase tracking-wider px-3 py-2 rounded-lg border border-slate-200 transition-colors shadow-sm"><FileSignature size={12} /> Ass. Diretoria</button>
              <button onClick={() => onAddConfiguredSignature('secretaria', 'Assinatura Secretaria Escolar')} className="flex items-center gap-1 bg-white hover:bg-purple-50 text-slate-700 hover:text-purple-700 font-bold text-[9px] uppercase tracking-wider px-3 py-2 rounded-lg border border-slate-200 transition-colors shadow-sm"><FileSignature size={12} /> Ass. Secretaria</button>
            </div>
          </div>

          <div className="bg-slate-50 p-4 border border-slate-200 rounded-2xl">
            <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2.5">Adicionar Elementos à página</span>
            {inactiveBlocks.length === 0 ? <p className="text-[10px] text-slate-500 font-semibold italic">Todos os elementos deste lado estão visíveis.</p> : (
              <div className="flex flex-wrap gap-2">{inactiveBlocks.map(block => <button key={block.id} onClick={() => onAddBlock(block.id)} className="flex items-center gap-1 bg-[#001a33] hover:bg-blue-900 text-white font-bold text-[9px] uppercase tracking-wider px-2.5 py-1.5 rounded-lg transition-colors shadow-sm"><Plus size={10} />{block.label}</button>)}</div>
            )}
          </div>

          <DiplomaElementProperties
            selectedBlock={selectedBlock}
            formData={formData}
            isUploading={isUploading}
            copiedVar={copiedVar}
            signatureSourceOptions={signatureSourceOptions}
            onUpdate={onUpdateBlock}
            onRemove={onRemoveBlock}
            onUploadSignature={onUploadSignature}
            onCopy={onCopy}
          />
        </div>
      )}
    </div>
  </div>
);

export default DiplomaEditorSidebar;
