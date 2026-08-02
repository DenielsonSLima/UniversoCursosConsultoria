
import React, { useState } from 'react';
import { X, Trash2, Plus } from 'lucide-react';
import { CalendarEvent, EventType } from '../calendario.types';
import { toDateKey } from '../calendario.official';

interface EventModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDate: Date;
  eventsOnDate: CalendarEvent[];
  eventTypes: EventType[];
  eventTypeOptions?: EventType[];
  teachers: any[];
  turmas: any[];
  variant?: 'manager' | 'professor' | 'student';
  professorId?: string;
  canDeleteEvent?: (event: CalendarEvent) => boolean;
  onAddEvent?: (event: Omit<CalendarEvent, 'id'>) => void | Promise<void>;
  onDeleteEvent?: (id: string) => void | Promise<void>;
}

const EventModal: React.FC<EventModalProps> = ({ 
  isOpen,
  onClose,
  selectedDate,
  eventsOnDate,
  eventTypes,
  eventTypeOptions,
  teachers,
  turmas,
  variant = 'manager',
  professorId,
  canDeleteEvent,
  onAddEvent,
  onDeleteEvent,
}) => {
  const [showForm, setShowForm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    typeId: '',
    professorId: '',
    turmaId: ''
  });

  if (!isOpen) return null;

  const isProfessor = variant === 'professor';
  const isStudent = variant === 'student';
  const selectableEventTypes = eventTypeOptions || eventTypes;
  const dateStr = toDateKey(selectedDate);
  const displayDate = selectedDate.toLocaleDateString('pt-BR', { 
    weekday: 'long', day: 'numeric', month: 'long' 
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.typeId) return;

    setIsSaving(true);
    setFormError('');
    try {
      if (!onAddEvent) return;
      await onAddEvent({
        ...formData,
        date: dateStr,
        professorId: isProfessor ? professorId || null : formData.professorId || null,
        turmaId: isProfessor ? null : formData.turmaId || null,
        visibility: isProfessor ? 'PERSONAL' : undefined,
      });
      setFormData({ title: '', description: '', typeId: '', professorId: '', turmaId: '' });
      setShowForm(false);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Não foi possível salvar o evento.');
    } finally {
      setIsSaving(false);
    }
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
             <p className="text-xs text-slate-500 font-medium">
               {isProfessor ? 'Sua agenda pessoal e os compromissos deste dia.' : isStudent ? 'Aulas, comunicados e datas oficiais.' : 'Observações e eventos.'}
             </p>
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
            const teacherObj = teachers.find(t => t.id === event.professorId);
            const turmaObj = turmas.find(t => t.id === event.turmaId);
            const teacherName = event.professorName || teacherObj?.nome;
            const turmaName = event.turmaName || turmaObj?.nome;

            return (
                <div key={event.id} className="p-4 rounded-xl border border-slate-100 bg-white shadow-sm flex items-start gap-3 group hover:border-slate-300 transition-all">
                <div 
                    className="w-3 h-3 rounded-full mt-1.5 shrink-0" 
                    style={{ backgroundColor: typeInfo.color }} 
                />
                <div className="flex-1">
                    <h4 className="text-sm font-bold text-[#001a33]">{event.title}</h4>
                    <p className="text-xs mt-1 text-slate-500">{event.description || 'Sem descrição'}</p>
                    
                    <div className="flex flex-wrap gap-1 mt-2">
                        <span className="inline-block text-[9px] font-bold uppercase tracking-wider text-slate-550 bg-slate-50 px-2 py-0.5 rounded border border-slate-100">
                            {typeInfo.label}
                        </span>
                        {teacherName && (
                            <span className="inline-block text-[9px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                                Prof: {teacherName}
                            </span>
                        )}
                        {turmaName && (
                            <span className="inline-block text-[9px] font-bold uppercase tracking-wider text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                                Turma: {turmaName}
                            </span>
                        )}
                        {event.cargaHoraria ? (
                            <span className="inline-block text-[9px] font-bold uppercase tracking-wider text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-100">
                                {event.cargaHoraria}H
                            </span>
                        ) : null}
                        {event.turno && (
                            <span className="inline-block text-[9px] font-bold uppercase tracking-wider text-purple-600 bg-purple-50 px-2 py-0.5 rounded border border-purple-100">
                                {event.turno}
                            </span>
                        )}
                    </div>
                </div>
                {!isStudent && onDeleteEvent && (canDeleteEvent
                  ? canDeleteEvent(event)
                  : !event.id.startsWith('class-') && !event.id.startsWith('official-')) && (
                  <button 
                      onClick={() => void onDeleteEvent(event.id)}
                      className="opacity-0 group-hover:opacity-100 p-2 text-slate-350 hover:text-red-500 transition-all"
                      title="Excluir evento"
                      aria-label={`Excluir ${event.title}`}
                  >
                      <Trash2 size={16} />
                  </button>
                )}
                </div>
            );
          })}
        </div>

        {/* Formulário */}
        {showForm ? (
          <form onSubmit={handleSubmit} className="bg-slate-50 p-4 rounded-2xl border border-slate-200 animate-fadeIn overflow-y-auto max-h-[50vh] custom-scrollbar">
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Título</label>
                <input 
                  type="text" 
                  placeholder="Título da Observação"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-bold text-[#001a33] outline-none focus:border-blue-500 bg-white"
                  value={formData.title}
                  onChange={(e) => setFormData({...formData, title: e.target.value})}
                  autoFocus
                  required
                />
              </div>
              
              {/* Seleção de Tipo Dinâmico */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Categoria</label>
                <div className="flex flex-wrap gap-2">
                    {selectableEventTypes.map(type => (
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

              {!isProfessor ? <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Turma (Opcional)</label>
                <select
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 outline-none focus:border-blue-500 bg-white cursor-pointer"
                  value={formData.turmaId}
                  onChange={(e) => setFormData({...formData, turmaId: e.target.value})}
                >
                  <option value="">-- Nenhuma (Geral) --</option>
                  {turmas.map(t => (
                    <option key={t.id} value={t.id}>{t.nome} ({t.codigo})</option>
                  ))}
                </select>
              </div> : null}

              {!isProfessor ? <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Professor (Opcional)</label>
                <select
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 outline-none focus:border-blue-500 bg-white cursor-pointer"
                  value={formData.professorId}
                  onChange={(e) => setFormData({...formData, professorId: e.target.value})}
                >
                  <option value="">-- Nenhum (Geral) --</option>
                  {teachers.map(t => (
                    <option key={t.id} value={t.id}>{t.nome}</option>
                  ))}
                </select>
              </div> : null}

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Detalhes</label>
                <textarea 
                  placeholder="Detalhes adicionais..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-600 outline-none focus:border-blue-500 resize-none h-16 bg-white"
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                />
              </div>

              {formError ? (
                <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs font-medium text-red-600">
                  {formError}
                </p>
              ) : null}

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button 
                  type="button" 
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-200 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  disabled={!formData.title || !formData.typeId || isSaving}
                  className="px-4 py-2 rounded-lg bg-[#001a33] text-white text-xs font-bold uppercase tracking-wider hover:bg-blue-900 transition-colors shadow-lg disabled:opacity-50"
                >
                  {isSaving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </div>
          </form>
        ) : (
          !isStudent ? <button 
            onClick={() => setShowForm(true)}
            className="w-full py-3 bg-[#001a33] text-white rounded-xl font-bold uppercase text-xs tracking-wider hover:bg-blue-900 transition-colors shadow-lg flex items-center justify-center gap-2"
          >
            <Plus size={16} /> {isProfessor ? 'Adicionar evento pessoal' : 'Adicionar observação'}
          </button> : null
        )}
      </div>
    </div>
  );
};

export default EventModal;
