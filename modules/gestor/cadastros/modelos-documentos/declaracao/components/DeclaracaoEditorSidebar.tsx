import React from 'react';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Building2,
  Image as ImageIcon,
  Italic,
  Palette,
  QrCode,
  Sliders,
  Trash2,
  Type,
  Upload,
} from 'lucide-react';
import type {
  AbsoluteField,
  CentralSignatureRole,
  EditorVariable,
} from './declaracao-editor.types';

interface DeclaracaoEditorSidebarProps {
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onAddCentralSignature: (role: CentralSignatureRole) => void;
  onDragStart: (
    event: React.DragEvent,
    item: Partial<EditorVariable>,
    type: 'variable' | 'qrcode',
  ) => void;
  onImageUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onInsertVariable: (variableCode: string) => void;
  onRemoveField: (id: string) => void;
  onSelectField: (id: string | null) => void;
  onUpdateField: (updates: Partial<AbsoluteField>) => void;
  onUpdateFieldStyle: (updates: React.CSSProperties) => void;
  selectedField?: AbsoluteField;
  setValidityDays: (days: number) => void;
  showValidity: boolean;
  validityDays: number;
  variables: EditorVariable[];
}

const SIGNATURE_ROLES: CentralSignatureRole[] = [
  { id: 'diretoriaGeral', label: 'Diretoria' },
  { id: 'secretaria', label: 'Secretaria' },
  { id: 'coordenacao', label: 'Coordenação' },
  { id: 'financeiro', label: 'Financeiro' },
];

const TEXT_ALIGNMENTS = [
  { value: 'left', icon: AlignLeft, title: 'Esquerda' },
  { value: 'center', icon: AlignCenter, title: 'Centralizado' },
  { value: 'right', icon: AlignRight, title: 'Direita' },
  { value: 'justify', icon: AlignJustify, title: 'Justificado' },
] as const;

const DeclaracaoEditorSidebar: React.FC<DeclaracaoEditorSidebarProps> = ({
  fileInputRef,
  onAddCentralSignature,
  onDragStart,
  onImageUpload,
  onInsertVariable,
  onRemoveField,
  onSelectField,
  onUpdateField,
  onUpdateFieldStyle,
  selectedField,
  setValidityDays,
  showValidity,
  validityDays,
  variables,
}) => {
  const selectedTextAlign = String(selectedField?.style?.textAlign || 'left');
  const selectedTextAlignLabel = {
    left: 'Esquerda',
    center: 'Centralizado',
    right: 'Direita',
    justify: 'Justificado',
  }[selectedTextAlign] || 'Esquerda';

  return (
    <div className="w-72 flex flex-col gap-6 bg-white p-4 rounded-[2rem] border border-slate-100 shadow-sm overflow-y-auto custom-scrollbar h-full shrink-0">
      {showValidity && (
        <div className="border-b border-slate-100 pb-4 flex flex-col gap-2 shrink-0">
          <h4 className="text-xs font-black text-[#001a33] uppercase tracking-wider flex items-center gap-2 mb-1">
            <Building2 size={14} className="text-blue-600" /> Validade do Documento
          </h4>
          <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
            {([30, 60, 90] as const).map(days => (
              <button
                key={days}
                onClick={() => setValidityDays(days)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all uppercase tracking-wider ${
                  validityDays === days
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {days} Dias
              </button>
            ))}
          </div>
          <p className="text-[9px] text-slate-400 font-medium leading-normal">
            Define o prazo padrão que será impresso no documento e usado na verificação do QR Code.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2 flex-1 overflow-hidden">
        <h4 className="text-xs font-black text-[#001a33] uppercase tracking-wider flex items-center gap-2 mb-1">
          <Type size={14} className="text-blue-600" /> Texto Dinâmico
        </h4>
        <div className="overflow-y-auto custom-scrollbar space-y-2 pr-1 pb-2">
          {variables.map(variable => (
            <div
              key={variable.code}
              draggable
              onDragStart={event => onDragStart(event, variable, 'variable')}
              className="bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 rounded-xl p-3 cursor-grab active:cursor-grabbing transition-colors group select-none"
            >
              <div className="flex justify-between items-center mb-1">
                <span className="text-[10px] font-bold text-slate-700 uppercase">{variable.label}</span>
                <button
                  onClick={() => onInsertVariable(variable.code)}
                  className="text-[9px] bg-white border border-slate-200 px-2 py-0.5 rounded text-blue-600 font-bold hover:bg-blue-600 hover:text-white transition-colors"
                  title="Inserir no cursor"
                >
                  Add
                </button>
              </div>
              <code className="text-[10px] text-slate-400 font-mono block bg-white px-2 py-1 rounded border border-slate-100 truncate">
                {variable.code}
              </code>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-slate-100 pt-4 flex flex-col gap-3 shrink-0">
        <h4 className="text-xs font-black text-[#001a33] uppercase tracking-wider flex items-center gap-2 mb-1">
          <ImageIcon size={14} className="text-purple-600" /> Elementos Visuais
        </h4>
        <div
          draggable
          onDragStart={event => onDragStart(event, { code: 'QR_VALIDADOR' }, 'qrcode')}
          className="bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-xl p-3 cursor-grab active:cursor-grabbing transition-colors flex items-center gap-3 select-none"
        >
          <div className="p-2 bg-white rounded-lg text-purple-600">
            <QrCode size={20} />
          </div>
          <div>
            <p className="text-xs font-bold text-purple-900">QR Code Validador</p>
            <p className="text-[9px] text-purple-700">Link Autenticação</p>
          </div>
        </div>

        <div
          onClick={() => fileInputRef.current?.click()}
          className="bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl p-3 cursor-pointer transition-colors flex items-center gap-3 select-none group"
        >
          <div className="p-2 bg-white rounded-lg text-emerald-600 group-hover:text-emerald-700">
            <Upload size={20} />
          </div>
          <div>
            <p className="text-xs font-bold text-emerald-900">Upload Assinatura</p>
            <p className="text-[9px] text-emerald-700">PNG (Fundo Transparente)</p>
          </div>
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept="image/png"
            onChange={onImageUpload}
          />
        </div>

        <div className="border-t border-slate-100 pt-3 flex flex-col gap-2">
          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest leading-none">
            Usar Assinatura Central
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {SIGNATURE_ROLES.map(role => (
              <button
                key={role.id}
                type="button"
                onClick={() => onAddCentralSignature(role)}
                className="py-1.5 px-2 bg-slate-50 hover:bg-pink-50 hover:text-pink-600 rounded-xl border border-slate-200 hover:border-pink-200 text-[10px] font-bold text-slate-600 transition-colors truncate"
              >
                {role.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {selectedField && (
        <div className="border-t border-slate-100 pt-4 flex flex-col gap-3 shrink-0 animate-fadeIn">
          <div className="flex justify-between items-center mb-1">
            <h4 className="text-xs font-black text-[#001a33] uppercase tracking-wider flex items-center gap-2">
              <Sliders size={14} className="text-blue-600" /> Ajustar Elemento
            </h4>
            <button
              onClick={() => onSelectField(null)}
              className="text-[10px] font-bold text-slate-400 hover:text-slate-650 uppercase hover:text-slate-655"
            >
              Fechar
            </button>
          </div>

          <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-3 flex flex-col gap-3">
            {selectedField.type === 'image' && (
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-[9px] font-black text-slate-500 uppercase mb-1">
                    <span>Largura</span>
                    <span>{selectedField.width || 200}px</span>
                  </div>
                  <input
                    type="range"
                    min="40"
                    max="500"
                    value={selectedField.width || 200}
                    onChange={event => onUpdateField({ width: parseInt(event.target.value) })}
                    className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />
                </div>
                <div className="flex items-center justify-between bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
                  <div>
                    <p className="text-[10px] font-bold text-slate-700 leading-tight">Efeito Caneta (Mesclar)</p>
                    <p className="text-[8px] text-slate-500 leading-tight">Remove o fundo branco</p>
                  </div>
                  <button
                    onClick={() => {
                      const currentBlend = selectedField.style?.mixBlendMode;
                      onUpdateFieldStyle({ mixBlendMode: currentBlend === 'multiply' ? 'normal' : 'multiply' });
                    }}
                    className={`w-9 h-5 flex items-center rounded-full p-0.5 transition-colors duration-300 focus:outline-none ${
                      selectedField.style?.mixBlendMode === 'multiply'
                        ? 'bg-emerald-500 justify-end'
                        : 'bg-slate-300 justify-start'
                    }`}
                  >
                    <span className="w-4 h-4 rounded-full bg-white shadow-md transform transition-transform duration-300" />
                  </button>
                </div>
              </div>
            )}

            {selectedField.type === 'qrcode' && (
              <div>
                <div className="flex justify-between text-[9px] font-black text-slate-500 uppercase mb-1">
                  <span>Tamanho</span>
                  <span>{selectedField.width || 100}px</span>
                </div>
                <input
                  type="range"
                  min="60"
                  max="250"
                  value={selectedField.width || 100}
                  onChange={event => onUpdateField({ width: parseInt(event.target.value) })}
                  className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
              </div>
            )}

            {selectedField.type === 'text' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-[9px] font-black text-slate-500 uppercase mb-1">
                    Conteúdo do Texto
                  </label>
                  <textarea
                    value={selectedField.value}
                    onChange={event => onUpdateField({ value: event.target.value })}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-700 outline-none focus:border-blue-500 text-xs font-bold resize-y min-h-[60px] custom-scrollbar"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-[9px] font-black text-slate-500 uppercase mb-1">
                    <span>Tamanho da Fonte</span>
                    <span>{selectedField.style?.fontSize ? parseInt(selectedField.style.fontSize.toString()) : 14}px</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="36"
                    value={selectedField.style?.fontSize ? parseInt(selectedField.style.fontSize.toString()) : 14}
                    onChange={event => onUpdateFieldStyle({ fontSize: `${event.target.value}px` })}
                    className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />
                </div>
                <div>
                  <label className="mb-1 flex items-center gap-1.5 text-[9px] font-black text-slate-500 uppercase">
                    <Palette size={12} /> Cor da fonte
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={String(selectedField.style?.color || '#000000')}
                      onChange={event => onUpdateFieldStyle({ color: event.target.value })}
                      className="h-9 w-12 rounded-lg border border-slate-200 bg-white p-1"
                    />
                    <input
                      value={String(selectedField.style?.color || '#000000')}
                      onChange={event => onUpdateFieldStyle({ color: event.target.value })}
                      className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-[9px] font-black text-slate-500 uppercase">Fonte</label>
                  <select
                    value={String(selectedField.style?.fontFamily || 'Arial, sans-serif')}
                    onChange={event => onUpdateFieldStyle({ fontFamily: event.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 outline-none focus:border-blue-500"
                  >
                    <option value="Arial, sans-serif">Arial</option>
                    <option value="'Times New Roman', Times, serif">Times New Roman</option>
                    <option value="Georgia, serif">Georgia</option>
                    <option value="'Courier New', monospace">Courier New</option>
                    <option value="'Trebuchet MS', sans-serif">Trebuchet</option>
                  </select>
                </div>
                <div>
                  <div className="flex justify-between text-[9px] font-black text-slate-500 uppercase mb-1">
                    <span>Largura do Bloco</span>
                    <span>{selectedField.width ? `${selectedField.width}px` : 'Automático'}</span>
                  </div>
                  <input
                    type="range"
                    min="50"
                    max="700"
                    value={selectedField.width || 300}
                    onChange={event => onUpdateField({ width: parseInt(event.target.value) })}
                    className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />
                  <button
                    onClick={() => onUpdateField({ width: undefined })}
                    className="text-[9px] font-bold text-slate-400 mt-1 hover:text-blue-600 block text-left"
                  >
                    Limpar Largura (Auto)
                  </button>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => onUpdateFieldStyle({
                      fontWeight: selectedField.style?.fontWeight === 'bold' ? 'normal' : 'bold',
                    })}
                    className={`flex-1 flex items-center justify-center p-1.5 border rounded-xl transition-colors ${
                      selectedField.style?.fontWeight === 'bold'
                        ? 'bg-blue-50 border-blue-200 text-blue-600 font-bold'
                        : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                    }`}
                    title="Negrito"
                  >
                    <Bold size={12} />
                  </button>
                  <button
                    onClick={() => onUpdateFieldStyle({
                      fontStyle: selectedField.style?.fontStyle === 'italic' ? 'normal' : 'italic',
                    })}
                    className={`flex-1 flex items-center justify-center p-1.5 border rounded-xl transition-colors ${
                      selectedField.style?.fontStyle === 'italic'
                        ? 'bg-blue-50 border-blue-200 text-blue-600 font-bold'
                        : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                    }`}
                    title="Itálico"
                  >
                    <Italic size={12} />
                  </button>
                </div>
                <div>
                  <div className="flex items-center justify-between text-[9px] font-black text-slate-500 uppercase mb-1">
                    <span>Alinhamento</span>
                    <span className="text-blue-600">{selectedTextAlignLabel}</span>
                  </div>
                  <div className="flex gap-1 bg-slate-100 p-0.5 rounded-xl">
                    {TEXT_ALIGNMENTS.map(({ value: align, icon: Icon, title }) => {
                      const isAligned = selectedField.style?.textAlign === align
                        || (!selectedField.style?.textAlign && align === 'left');
                      return (
                        <button
                          key={align}
                          type="button"
                          title={title}
                          aria-label={title}
                          onClick={() => onUpdateFieldStyle({ textAlign: align })}
                          className={`flex-1 flex items-center justify-center py-1.5 rounded-lg transition-colors ${
                            isAligned
                              ? 'bg-white text-blue-600 shadow-sm font-bold'
                              : 'text-slate-400 hover:text-slate-650 hover:text-slate-600'
                          }`}
                        >
                          <Icon size={12} />
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            <button
              onClick={() => onRemoveField(selectedField.id)}
              className="w-full mt-1 flex items-center justify-center gap-1.5 bg-red-50 hover:bg-red-100 text-red-600 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-colors border border-red-200"
            >
              <Trash2 size={12} /> Excluir Elemento
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DeclaracaoEditorSidebar;
