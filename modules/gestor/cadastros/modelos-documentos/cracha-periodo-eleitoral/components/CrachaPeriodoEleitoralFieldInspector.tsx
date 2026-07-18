import React from 'react';
import { AlignCenter, AlignLeft, AlignRight, Bold, Italic, Sliders, Trash2 } from 'lucide-react';
import type { CrachaPeriodoEleitoralEditor } from '../useCrachaPeriodoEleitoralEditor';

interface Props {
  editor: CrachaPeriodoEleitoralEditor;
}

const TEMPLATE_VARIABLES = [
  '{{ALUNO_NOME}}',
  '{{ALUNO_MATRICULA}}',
  '{{ALUNO_CURSO}}',
  '{{HOSPITAL_NOME}}',
  '{{INSTITUICAO_ENSINO}}',
  '{{CATEGORIA_PROFISSIONAL}}',
  '{{VALIDADE}}',
];

const CrachaPeriodoEleitoralFieldInspector: React.FC<Props> = ({ editor }) => {
  const {
    activeTab,
    formData,
    selectedField,
    setActiveTab,
    setSelectedFieldId,
    updateSelectedField,
    updateSelectedFieldStyle,
    handleRemoveField,
  } = editor;

  if (!selectedField || activeTab === 'config') return null;

  return (
    <div className="border-t border-slate-200 pt-4 flex flex-col gap-3 shrink-0 animate-fadeIn bg-white">
      <div className="flex justify-between items-center">
        <h4 className="text-xs font-black text-[#001a33] uppercase tracking-wider flex items-center gap-2">
          <Sliders size={14} className="text-blue-600" /> Ajustar Elemento
        </h4>
        <button type="button" onClick={() => setSelectedFieldId(null)} className="text-[10px] font-bold text-slate-400 hover:text-slate-600 uppercase">Fechar</button>
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 flex flex-col gap-3 max-h-[330px] overflow-y-auto custom-scrollbar">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="flex justify-between text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1"><span>Posição X</span><span className="font-mono">{selectedField.x}%</span></label>
            <input type="range" min="-10" max="105" step="0.5" value={selectedField.x || 0} onChange={(event) => updateSelectedField({ x: parseFloat(event.target.value) })} className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
          </div>
          <div>
            <label className="flex justify-between text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1"><span>Posição Y</span><span className="font-mono">{selectedField.y}%</span></label>
            <input type="range" min="-10" max="105" step="0.5" value={selectedField.y || 0} onChange={(event) => updateSelectedField({ y: parseFloat(event.target.value) })} className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="flex justify-between text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1"><span>Largura</span><span className="font-mono">{selectedField.width || 35}%</span></label>
            <input type="range" min="3" max="100" step="0.5" value={selectedField.width || 35} onChange={(event) => updateSelectedField({ width: parseFloat(event.target.value) })} className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
          </div>
          <div>
            <label className="flex justify-between text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1"><span>Altura</span><span className="font-mono">{selectedField.height || 8}%</span></label>
            <input type="range" min="0.2" max="80" step="0.25" value={selectedField.height || (selectedField.type === 'line' ? 0.25 : 8)} onChange={(event) => updateSelectedField({ height: parseFloat(event.target.value) })} className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
          </div>
        </div>

        <div>
          <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Página do Elemento</label>
          <select value={selectedField.page || 'frente'} onChange={(event) => {
            const nextPage = event.target.value as 'frente' | 'verso';
            updateSelectedField({ page: nextPage });
            setActiveTab(nextPage);
          }} className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-700 outline-none">
            <option value="frente">Frente</option>
            {formData.hasVerso !== false && <option value="verso">Verso</option>}
          </select>
        </div>

        {['text', 'boxText'].includes(selectedField.type) && (
          <div className="space-y-3 pt-2 border-t border-slate-200">
            <div>
              <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Conteúdo</label>
              <textarea value={selectedField.value || ''} onChange={(event) => updateSelectedField({ value: event.target.value })} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 outline-none focus:border-blue-500 resize-y custom-scrollbar min-h-[62px]" />
              <div className="flex flex-wrap gap-1 mt-1">
                {TEMPLATE_VARIABLES.map((variable) => (
                  <button key={variable} type="button" onClick={() => updateSelectedField({ value: `${selectedField.value || ''} ${variable}` })} className="text-[7.5px] font-mono font-bold bg-slate-200 hover:bg-slate-300 text-slate-600 px-1 py-0.5 rounded">{variable}</button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="flex justify-between text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1"><span>Tam. Fonte</span><span className="font-mono">{selectedField.style?.fontSize || '14px'}</span></label>
                <input type="range" min="5" max="40" step="0.5" value={parseFloat(selectedField.style?.fontSize) || 14} onChange={(event) => updateSelectedFieldStyle({ fontSize: `${event.target.value}px` })} className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
              </div>
              <div>
                <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Cor Texto</label>
                <input type="color" value={selectedField.style?.color || formData.corTexto || '#0b58a8'} onChange={(event) => updateSelectedFieldStyle({ color: event.target.value })} className="w-full h-7 bg-white border border-slate-200 rounded cursor-pointer p-0.5" />
              </div>
            </div>

            {selectedField.type === 'boxText' && (
              <div>
                <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Cor da Borda</label>
                <input type="color" value={selectedField.style?.borderColor || formData.corBorda || '#0b58a8'} onChange={(event) => updateSelectedFieldStyle({ borderColor: event.target.value })} className="w-full h-7 bg-white border border-slate-200 rounded cursor-pointer p-0.5" />
              </div>
            )}

            <div className="flex gap-2">
              <div className="flex rounded-lg bg-white border border-slate-200 p-0.5 overflow-hidden">
                <button type="button" onClick={() => updateSelectedFieldStyle({ fontWeight: selectedField.style?.fontWeight === '900' || selectedField.style?.fontWeight === 'bold' ? '400' : '900' })} className={`p-1.5 rounded transition-colors ${selectedField.style?.fontWeight === '900' || selectedField.style?.fontWeight === 'bold' ? 'bg-slate-200 text-slate-800' : 'text-slate-400 hover:text-slate-600'}`}><Bold size={12} /></button>
                <button type="button" onClick={() => updateSelectedFieldStyle({ fontStyle: selectedField.style?.fontStyle === 'italic' ? 'normal' : 'italic' })} className={`p-1.5 rounded transition-colors ${selectedField.style?.fontStyle === 'italic' ? 'bg-slate-200 text-slate-800' : 'text-slate-400 hover:text-slate-600'}`}><Italic size={12} /></button>
              </div>
              <div className="flex rounded-lg bg-white border border-slate-200 p-0.5 overflow-hidden">
                {(['left', 'center', 'right'] as const).map((align) => {
                  const Icon = align === 'left' ? AlignLeft : align === 'center' ? AlignCenter : AlignRight;
                  const isActive = (selectedField.style?.textAlign || 'left') === align;
                  return <button key={align} type="button" onClick={() => updateSelectedFieldStyle({ textAlign: align })} className={`p-1.5 rounded transition-colors ${isActive ? 'bg-slate-200 text-slate-800' : 'text-slate-400 hover:text-slate-600'}`}><Icon size={12} /></button>;
                })}
              </div>
            </div>
          </div>
        )}

        {['line', 'rect'].includes(selectedField.type) && (
          <div className="pt-2 border-t border-slate-200">
            <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Cor</label>
            <input type="color" value={selectedField.style?.backgroundColor || formData.corPrimaria || '#0b58a8'} onChange={(event) => updateSelectedFieldStyle({ backgroundColor: event.target.value })} className="w-full h-7 bg-white border border-slate-200 rounded cursor-pointer p-0.5" />
          </div>
        )}

        {selectedField.type === 'seal' && (
          <div className="pt-2 border-t border-slate-200">
            <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Cor do Selo</label>
            <input type="color" value={selectedField.style?.color || '#1f2937'} onChange={(event) => updateSelectedFieldStyle({ color: event.target.value })} className="w-full h-7 bg-white border border-slate-200 rounded cursor-pointer p-0.5" />
          </div>
        )}

        {selectedField.type === 'image' && (
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <label htmlFor="cracha-ses-mix-blend-mode" className="mb-1.5 block text-[9px] font-black uppercase tracking-widest text-slate-600">Modo de mesclagem</label>
            <select id="cracha-ses-mix-blend-mode" value={selectedField.style?.mixBlendMode || 'multiply'} onChange={(event) => updateSelectedFieldStyle({ mixBlendMode: event.target.value })} className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 text-[10px] font-bold text-slate-700 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100">
              <option value="normal">Normal (mantém o fundo)</option>
              <option value="multiply">Multiplicar (remove o fundo branco)</option>
            </select>
            <p className="mt-1.5 text-[8px] font-bold uppercase tracking-wide text-slate-400">O modo escolhido também será aplicado na impressão e no PDF.</p>
          </div>
        )}

        <button type="button" onClick={() => handleRemoveField(selectedField.id)} className="w-full mt-2 flex items-center justify-center gap-1.5 bg-red-50 hover:bg-red-100 text-red-600 py-2 border border-red-200 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-colors"><Trash2 size={12} /> Remover Elemento</button>
      </div>
    </div>
  );
};

export default CrachaPeriodoEleitoralFieldInspector;
