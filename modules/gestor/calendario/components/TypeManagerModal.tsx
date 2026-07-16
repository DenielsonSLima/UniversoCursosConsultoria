
import React, { useState } from 'react';
import { Check, Palette, Trash2, X } from 'lucide-react';
import type { EventType } from '../calendario.types';

interface TypeManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  types: EventType[];
  onAddType: (data: { label: string; color: string }) => void | Promise<void>;
  onUpdateTypeColor: (id: string, color: string) => void | Promise<void>;
  onDeleteType: (id: string) => void | Promise<void>;
}

const PRESET_COLORS = [
  '#001a33', '#dc2626', '#d97706', '#059669', '#2563eb', 
  '#7c3aed', '#db2777', '#4b5563', '#0891b2', '#84cc16',
];

const TypeManagerModal: React.FC<TypeManagerModalProps> = ({ 
  isOpen, onClose, types, onAddType, onUpdateTypeColor, onDeleteType,
}) => {
  const [newLabel, setNewLabel] = useState('');
  const [selectedColor, setSelectedColor] = useState(PRESET_COLORS[4]);
  const [editingTypeId, setEditingTypeId] = useState<string | null>(null);
  const [editingColor, setEditingColor] = useState(PRESET_COLORS[4]);
  const [isSavingColor, setIsSavingColor] = useState(false);

  if (!isOpen) return null;

  const handleAdd = () => {
    if (!newLabel.trim()) return;
    onAddType({ label: newLabel, color: selectedColor });
    setNewLabel('');
  };

  const startColorEdit = (type: EventType) => {
    setEditingTypeId(type.id);
    setEditingColor(type.color);
  };

  const cancelColorEdit = () => {
    setEditingTypeId(null);
    setIsSavingColor(false);
  };

  const saveColor = async () => {
    if (!editingTypeId) return;
    setIsSavingColor(true);
    try {
      await onUpdateTypeColor(editingTypeId, editingColor);
      setEditingTypeId(null);
    } finally {
      setIsSavingColor(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#001a33]/60 backdrop-blur-sm transition-opacity" onClick={onClose}></div>
      
      <div className="relative bg-white rounded-[2rem] w-full max-w-md p-6 shadow-2xl animate-fadeIn border border-slate-100 flex flex-col">
        <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
          <h3 className="text-xl font-black text-[#001a33] uppercase tracking-tight">Gerenciar Legenda</h3>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-50 text-slate-400 hover:text-red-500 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Criar Novo */}
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-6">
            <label className="text-[10px] font-bold text-slate-400 uppercase mb-2 block">Nova Categoria</label>
            <div className="flex gap-2 mb-3">
                <input 
                    type="text" 
                    placeholder="Nome (ex: Reunião)"
                    className="flex-1 px-3 py-2 rounded-lg border border-slate-200 bg-white text-[#001a33] text-sm outline-none focus:border-blue-500"
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                />
                <div className="w-10 h-10 rounded-lg shrink-0 border border-slate-200 overflow-hidden relative">
                    <input 
                        type="color" 
                        value={selectedColor}
                        onChange={(e) => setSelectedColor(e.target.value)}
                        className="absolute inset-0 w-[150%] h-[150%] -top-1/4 -left-1/4 cursor-pointer p-0 border-0"
                    />
                </div>
            </div>
            
            <div className="flex flex-wrap gap-2 mb-4">
                {PRESET_COLORS.map(color => (
                    <button
                        key={color}
                        onClick={() => setSelectedColor(color)}
                        className={`w-6 h-6 rounded-full border-2 transition-all ${selectedColor === color ? 'border-slate-600 scale-110' : 'border-transparent hover:scale-110'}`}
                        style={{ backgroundColor: color }}
                    />
                ))}
            </div>

            <button 
                onClick={handleAdd}
                disabled={!newLabel}
                className="w-full py-2 bg-blue-600 text-white rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
                Adicionar Categoria
            </button>
        </div>

        {/* Lista Existente */}
        <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
            {types.map(type => {
              const isEditing = editingTypeId === type.id;
              return (
                <div key={type.id} className={`overflow-hidden rounded-xl border bg-white transition-colors ${isEditing ? 'border-blue-200 ring-2 ring-blue-50' : 'border-slate-100 hover:border-slate-300'}`}>
                  <div className="group flex items-center justify-between p-3">
                    <button
                      type="button"
                      onClick={() => startColorEdit(type)}
                      className="flex min-w-0 items-center gap-3 text-left"
                      title={`Editar a cor de ${type.label}`}
                    >
                      <span className="h-4 w-4 shrink-0 rounded-full ring-2 ring-white shadow-sm" style={{ backgroundColor: type.color }} />
                      <span className="truncate text-sm font-bold text-slate-700">{type.label}</span>
                    </button>
                    <div className="flex items-center gap-1.5">
                      {type.isSystem ? <span className="mr-1 text-[9px] font-bold uppercase text-slate-300">Padrão</span> : null}
                      <button
                        type="button"
                        onClick={() => startColorEdit(type)}
                        className="rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-blue-50 hover:text-blue-600"
                        title={`Editar a cor de ${type.label}`}
                      >
                        <Palette size={16} />
                      </button>
                      {!type.isSystem ? (
                        <button
                          type="button"
                          onClick={() => onDeleteType(type.id)}
                          className="rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-red-50 hover:text-red-500"
                          title={`Excluir ${type.label}`}
                        >
                          <Trash2 size={16} />
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {isEditing ? (
                    <div className="border-t border-slate-100 bg-slate-50/80 p-3">
                      <div className="mb-3 flex items-center gap-2">
                        <label className="relative h-9 w-11 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-slate-200 bg-white" title="Escolher uma cor personalizada">
                          <input
                            type="color"
                            value={editingColor}
                            onChange={event => setEditingColor(event.target.value)}
                            className="absolute -left-1/4 -top-1/4 h-[150%] w-[150%] cursor-pointer border-0 p-0"
                            aria-label={`Cor personalizada para ${type.label}`}
                          />
                        </label>
                        <div className="flex flex-1 flex-wrap gap-1.5">
                          {PRESET_COLORS.map(color => (
                            <button
                              key={color}
                              type="button"
                              onClick={() => setEditingColor(color)}
                              className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 ${editingColor === color ? 'scale-110 border-slate-600' : 'border-white'}`}
                              style={{ backgroundColor: color }}
                              aria-label={`Usar cor ${color}`}
                            />
                          ))}
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={cancelColorEdit} className="rounded-lg px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:bg-slate-100">
                          Cancelar
                        </button>
                        <button type="button" onClick={saveColor} disabled={isSavingColor} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-white hover:bg-blue-700 disabled:opacity-60">
                          <Check size={13} /> {isSavingColor ? 'Salvando...' : 'Salvar cor'}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
        </div>

      </div>
    </div>
  );
};

export default TypeManagerModal;
