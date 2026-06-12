
import React, { useState } from 'react';
import { X, Trash2, Plus } from 'lucide-react';
import { CalendarEvent, EventType } from '../calendario.types';

interface EventModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDate: Date;
  eventsOnDate: CalendarEvent[];
  eventTypes: EventType[]; // Tipos passados via props
  onAddEvent: (event: any) => void;
  onDeleteEvent: (id: string) => void;
}

const EventModal: React.FC<EventModalProps> = ({ 
  isOpen, onClose, selectedDate, eventsOnDate, eventTypes, onAddEvent, onDeleteEvent 
}) => {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    typeId: '' // ID do tipo selecionado
  });

  if (!isOpen) return null;

  const dateStr = selectedDate.toISOString().split('T')[0];
  const displayDate = selectedDate.toLocaleDateString('pt-BR', { 
    weekday: 'long', day: 'numeric', month: 'long' 
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.typeId) return;

    onAddEvent({
      ...formData,
      date: dateStr
    });
    
    // Reset
    setFormData({ title: '', description: '', typeId: '' });
    setShowForm(false);
  };

  // Helper para pegar cor e nome do tipo
  const getTypeInfo = (typeId: string) => {
    const type = eventTypes.find(t => t.id === typeId);
    return type || { label: 'Desconhecido', color: '#ccc' };
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#001a33]/60 backdrop-blur-sm transition-opacity" onClick={onClose}></div>
      
      <div className="relative bg-white rounded-[2rem] w-full max-w-md p-6 shadow-2xl animate-fadeIn border border-slate-100 flex flex-col max-h-[85vh]">
        
        {/* Header */}
        <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-100">
          <div>
             <h3 className="text-xl font-black text-[#001a33] uppercase tracking-tight capitalize">
               {displayDate}
             </h3>
             <p className="text-xs text-slate-500 font-medium">Observações e eventos.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-50 text-slate-400 hover:text-red-500 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Lista de Eventos */}
        <div className="flex-1 overflow-y-auto mb-4 space-y-3 custom-scrollbar">
          {eventsOnDate.length === 0 && !showForm && (
            <div className="text-center py-8 text-slate-400 text-sm bg-slate-50 rounded-2xl border border-dashed border-slate-200">
              Nenhuma observação para este dia.
            </div>
          )}

          {eventsOnDate.map(event => {
            const typeInfo = getTypeInfo(event.typeId);
            return (
                <div key={event.id} className="p-4 rounded-xl border border-slate-100 bg-white shadow-sm flex items-start gap-3 group hover:border-slate-300 transition-all">
                <div 
                    className="w-3 h-3 rounded-full mt-1.5 shrink-0" 
                    style={{ backgroundColor: typeInfo.color }} 
                />
                <div className="flex-1">
                    <h4 className="text-sm font-bold text-[#001a33]">{event.title}</h4>
                    <p className="text-xs text-slate-500 mt-1">{event.description || 'Sem descrição'}</p>
                    <span className="inline-block mt-2 text-[9px] font-bold uppercase tracking-wider text-slate-500 bg-slate-50 px-2 py-0.5 rounded">
                        {typeInfo.label}
                    </span>
                </div>
                <button 
                    onClick={() => onDeleteEvent(event.id)}
                    className="opacity-0 group-hover:opacity-100 p-2 text-slate-300 hover:text-red-500 transition-all"
                >
                    <Trash2 size={16} />
                </button>
                </div>
            );
          })}
        </div>

        {/* Formulário */}
        {showForm ? (
          <form onSubmit={handleSubmit} className="bg-slate-50 p-4 rounded-2xl border border-slate-200 animate-fadeIn">
            <div className="space-y-3">
              <input 
                type="text" 
                placeholder="Título da Observação"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-bold text-[#001a33] outline-none focus:border-blue-500 bg-white"
                value={formData.title}
                onChange={(e) => setFormData({...formData, title: e.target.value})}
                autoFocus
                required
              />
              
              {/* Seleção de Tipo Dinâmico */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Categoria</label>
                <div className="flex flex-wrap gap-2">
                    {eventTypes.map(type => (
                        <button
                            key={type.id}
                            type="button"
                            onClick={() => setFormData({...formData, typeId: type.id})}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border flex items-center gap-1 ${
                                formData.typeId === type.id 
                                ? 'border-transparent text-white shadow-md transform scale-105' 
                                : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-100'
                            }`}
                            style={{ backgroundColor: formData.typeId === type.id ? type.color : undefined }}
                        >
                            {formData.typeId !== type.id && (
                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: type.color }}></div>
                            )}
                            {type.label}
                        </button>
                    ))}
                </div>
              </div>

              <textarea 
                placeholder="Detalhes adicionais..."
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-600 outline-none focus:border-blue-500 resize-none h-20 bg-white"
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
              />

              <div className="flex justify-end gap-2 pt-2">
                <button 
                  type="button" 
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-200 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  disabled={!formData.title || !formData.typeId}
                  className="px-4 py-2 rounded-lg bg-[#001a33] text-white text-xs font-bold uppercase tracking-wider hover:bg-blue-900 transition-colors shadow-lg disabled:opacity-50"
                >
                  Salvar
                </button>
              </div>
            </div>
          </form>
        ) : (
          <button 
            onClick={() => setShowForm(true)}
            className="w-full py-3 bg-[#001a33] text-white rounded-xl font-bold uppercase text-xs tracking-wider hover:bg-blue-900 transition-colors shadow-lg flex items-center justify-center gap-2"
          >
            <Plus size={16} /> Adicionar Observação
          </button>
        )}

      </div>
    </div>
  );
};

export default EventModal;
