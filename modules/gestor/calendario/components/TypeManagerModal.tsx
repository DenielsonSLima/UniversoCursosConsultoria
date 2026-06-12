
import React, { useState } from 'react';
import { X, Plus, Trash2, Tag } from 'lucide-react';
import { EventType } from '../calendario.types';

interface TypeManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  types: EventType[];
  onAddType: (data: { label: string; color: string }) => void;
  onDeleteType: (id: string) => void;
}

const PRESET_COLORS = [
  '#001a33', '#dc2626', '#d97706', '#059669', '#2563eb', 
  '#7c3aed', '#db2777', '#4b5563', '#0891b2', '#84cc16'
];

const TypeManagerModal: React.FC<TypeManagerModalProps> = ({ 
  isOpen, onClose, types, onAddType, onDeleteType 
}) => {
  const [newLabel, setNewLabel] = useState('');
  const [selectedColor, setSelectedColor] = useState(PRESET_COLORS[4]);

  if (!isOpen) return null;

  const handleAdd = () => {
    if (!newLabel.trim()) return;
    onAddType({ label: newLabel, color: selectedColor });
    setNewLabel('');
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
            {types.map(type => (
                <div key={type.id} className="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-xl hover:border-slate-300 transition-colors group">
                    <div className="flex items-center gap-3">
                        <div className="w-4 h-4 rounded-full" style={{ backgroundColor: type.color }}></div>
                        <span className="text-sm font-bold text-slate-700">{type.label}</span>
                    </div>
                    {!type.isSystem && (
                        <button 
                            onClick={() => onDeleteType(type.id)}
                            className="text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                        >
                            <Trash2 size={16} />
                        </button>
                    )}
                    {type.isSystem && (
                        <span className="text-[9px] text-slate-300 font-bold uppercase">Padrão</span>
                    )}
                </div>
            ))}
        </div>

      </div>
    </div>
  );
};

export default TypeManagerModal;
