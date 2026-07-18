import React from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  Sliders,
  Trash2,
} from 'lucide-react';

interface CrachaFieldEditorPanelProps {
  field: any;
  hasBack: boolean;
  onClose: () => void;
  onRemove: (fieldId: string) => void;
  onUpdate: (updates: any) => void;
  onUpdateStyle: (updates: any) => void;
}

const templateVariables = [
  '{{ALUNO_NOME}}',
  '{{ALUNO_MATRICULA}}',
  '{{ALUNO_CPF}}',
  '{{ALUNO_CURSO}}',
  '{{DATA_HOJE}}',
  '{{DATA_VALIDADE}}',
];

const CrachaFieldEditorPanel: React.FC<CrachaFieldEditorPanelProps> = ({
  field,
  hasBack,
  onClose,
  onRemove,
  onUpdate,
  onUpdateStyle,
}) => (
  <div className="border-t border-slate-200 pt-4 flex flex-col gap-3 shrink-0 animate-fadeIn bg-white">
    <div className="flex justify-between items-center mb-1">
      <h4 className="text-xs font-black text-[#001a33] uppercase tracking-wider flex items-center gap-2">
        <Sliders size={14} className="text-blue-600" /> Ajustar Elemento
      </h4>
      <button
        type="button"
        onClick={onClose}
        className="text-[10px] font-bold text-slate-400 hover:text-slate-600 uppercase"
      >
        Fechar
      </button>
    </div>

    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 flex flex-col gap-3 max-h-[300px] overflow-y-auto custom-scrollbar">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="flex justify-between text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">
            <span>Posição X</span>
            <span className="font-mono">{field.x}%</span>
          </label>
          <input
            type="range"
            min="-10"
            max="100"
            step="0.5"
            value={field.x}
            onChange={(event) => onUpdate({ x: parseFloat(event.target.value) })}
            className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
          />
        </div>
        <div>
          <label className="flex justify-between text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">
            <span>Posição Y</span>
            <span className="font-mono">{field.y}%</span>
          </label>
          <input
            type="range"
            min="-10"
            max="100"
            step="0.5"
            value={field.y}
            onChange={(event) => onUpdate({ y: parseFloat(event.target.value) })}
            className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="flex justify-between text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">
            <span>Largura</span>
            <span className="font-mono">{field.width || 30}%</span>
          </label>
          <input
            type="range"
            min="5"
            max="100"
            step="0.5"
            value={field.width || 30}
            onChange={(event) => onUpdate({ width: parseFloat(event.target.value) })}
            className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
          />
        </div>
        {(field.type === 'foto' || field.type === 'qrcode' || field.type === 'image') ? (
          <div>
            <label className="flex justify-between text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">
              <span>Altura</span>
              <span className="font-mono">{field.height || 15}%</span>
            </label>
            <input
              type="range"
              min="3"
              max="100"
              step="0.5"
              value={field.height || 15}
              onChange={(event) => onUpdate({ height: parseFloat(event.target.value) })}
              className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
          </div>
        ) : null}
      </div>

      <div>
        <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">
          Página do Elemento
        </label>
        <select
          value={field.page || 'frente'}
          onChange={(event) => onUpdate({ page: event.target.value })}
          className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-700 outline-none"
        >
          <option value="frente">Frente</option>
          {hasBack ? <option value="verso">Verso</option> : null}
        </select>
      </div>

      {field.type === 'text' ? (
        <div className="space-y-3 pt-2 border-t border-slate-200">
          <div>
            <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">
              Conteúdo do Texto
            </label>
            <textarea
              value={field.value}
              onChange={(event) => onUpdate({ value: event.target.value })}
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 outline-none focus:border-blue-500 resize-y custom-scrollbar min-h-[60px]"
            />
            <div className="flex flex-wrap gap-1 mt-1">
              {templateVariables.map((variable) => (
                <button
                  key={variable}
                  type="button"
                  onClick={() => onUpdate({ value: `${field.value} ${variable}` })}
                  className="text-[7.5px] font-mono font-bold bg-slate-200 hover:bg-slate-300 text-slate-600 px-1 py-0.5 rounded"
                >
                  {variable}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="flex justify-between text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                <span>Tam. Fonte</span>
                <span className="font-mono">{field.style?.fontSize || '8px'}</span>
              </label>
              <input
                type="range"
                min="4"
                max="24"
                step="0.2"
                value={parseFloat(field.style?.fontSize) || 8}
                onChange={(event) => onUpdateStyle({ fontSize: `${event.target.value}px` })}
                className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
            </div>
            <div>
              <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Cor Texto</label>
              <input
                type="color"
                value={field.style?.color || '#1e293b'}
                onChange={(event) => onUpdateStyle({ color: event.target.value })}
                className="w-full h-7 bg-white border border-slate-200 rounded cursor-pointer p-0.5"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <div className="flex rounded-lg bg-white border border-slate-200 p-0.5 overflow-hidden">
              <button
                type="button"
                onClick={() => onUpdateStyle({ fontWeight: field.style?.fontWeight === 'bold' ? 'normal' : 'bold' })}
                className={`p-1.5 rounded transition-colors ${field.style?.fontWeight === 'bold' ? 'bg-slate-200 text-slate-800' : 'text-slate-400 hover:text-slate-600'}`}
              >
                <Bold size={12} />
              </button>
              <button
                type="button"
                onClick={() => onUpdateStyle({ fontStyle: field.style?.fontStyle === 'italic' ? 'normal' : 'italic' })}
                className={`p-1.5 rounded transition-colors ${field.style?.fontStyle === 'italic' ? 'bg-slate-200 text-slate-800' : 'text-slate-400 hover:text-slate-600'}`}
              >
                <Italic size={12} />
              </button>
            </div>
            <div className="flex rounded-lg bg-white border border-slate-200 p-0.5 overflow-hidden">
              {(['left', 'center', 'right'] as const).map((alignment) => {
                const Icon = alignment === 'left' ? AlignLeft : alignment === 'center' ? AlignCenter : AlignRight;
                const active = (field.style?.textAlign || 'center') === alignment;
                return (
                  <button
                    key={alignment}
                    type="button"
                    onClick={() => onUpdateStyle({ textAlign: alignment })}
                    className={`p-1.5 rounded transition-colors ${active ? 'bg-slate-200 text-slate-800' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                    <Icon size={12} />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {field.type === 'image' ? (
        <div className="pt-2 border-t border-slate-200">
          <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">
            Modo de Mesclagem
          </label>
          <select
            value={field.style?.mixBlendMode || 'multiply'}
            onChange={(event) => onUpdateStyle({ mixBlendMode: event.target.value })}
            className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-700 outline-none"
          >
            <option value="normal">Normal (Sem transparência)</option>
            <option value="multiply">Multiplicar (Fundo transparente)</option>
          </select>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => onRemove(field.id)}
        className="w-full mt-2 flex items-center justify-center gap-1.5 bg-red-50 hover:bg-red-100 text-red-600 py-2 border border-red-200 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-colors"
      >
        <Trash2 size={12} /> Remover Elemento
      </button>
    </div>
  </div>
);

export default CrachaFieldEditorPanel;
