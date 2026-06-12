
import React, { useMemo } from 'react';
import { Settings, Calendar as CalendarIcon, ListPlus, Clock } from 'lucide-react';
import { EventType, CalendarEvent } from '../calendario.types';

interface CalendarSidebarProps {
  types: EventType[];
  events: CalendarEvent[];
  onManageTypes: () => void;
  currentYear: number;
}

const CalendarSidebar: React.FC<CalendarSidebarProps> = ({ types, events, onManageTypes, currentYear }) => {
  
  // Ordenar eventos por data
  const sortedEvents = useMemo(() => {
    return [...events]
      .filter(e => e.date.startsWith(currentYear.toString()))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [events, currentYear]);

  // Helper para pegar info do tipo
  const getTypeInfo = (typeId: string) => {
    return types.find(t => t.id === typeId) || { color: '#cbd5e1', label: 'Outro' };
  };

  // Formatador de data simples (DD/MM)
  const formatDate = (dateStr: string) => {
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}`;
  };

  return (
    <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm p-6 h-full flex flex-col max-h-[calc(100vh-100px)] overflow-hidden">
      
      {/* Cabeçalho Sidebar */}
      <div className="mb-6 shrink-0">
        <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-4">
            <CalendarIcon size={24} />
        </div>
        <h3 className="text-2xl font-black text-[#001a33] uppercase tracking-tight leading-none">
            Agenda {currentYear}
        </h3>
        <p className="text-xs text-slate-500 font-medium mt-2">
            Gestão visual de eventos e compromissos.
        </p>
      </div>

      {/* Lista de Eventos (Scrollável) */}
      <div className="flex-1 overflow-y-auto custom-scrollbar mb-6 pr-2">
        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 sticky top-0 bg-white py-1 z-10">
            Todos os Eventos
        </h4>
        
        {sortedEvents.length === 0 ? (
            <div className="text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <Clock size={24} className="mx-auto text-slate-300 mb-2" />
                <p className="text-[10px] text-slate-400 font-medium">Nenhum evento este ano.</p>
            </div>
        ) : (
            <div className="space-y-3">
                {sortedEvents.map(event => {
                    const type = getTypeInfo(event.typeId);
                    return (
                        <div key={event.id} className="flex gap-3 items-start p-3 rounded-xl bg-slate-50 hover:bg-blue-50 transition-colors border border-transparent hover:border-blue-100 group">
                            <div className="flex flex-col items-center min-w-[36px]">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider group-hover:text-blue-400">
                                    {formatDate(event.date)}
                                </span>
                                <div className="w-1.5 h-1.5 rounded-full mt-1" style={{ backgroundColor: type.color }}></div>
                            </div>
                            <div className="flex-1 overflow-hidden">
                                <p className="text-xs font-bold text-[#001a33] truncate" title={event.title}>
                                    {event.title}
                                </p>
                                <p className="text-[10px] text-slate-500 truncate mt-0.5">
                                    {type.label}
                                </p>
                            </div>
                        </div>
                    );
                })}
            </div>
        )}
      </div>

      {/* Legenda Dinâmica (Fixa na parte inferior da área scrollável ou separada) */}
      <div className="shrink-0 pt-4 border-t border-slate-100">
        <div className="flex items-center justify-between mb-4">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Legenda</h4>
            <button 
                onClick={onManageTypes}
                className="p-2 hover:bg-slate-50 rounded-lg text-blue-600 transition-colors"
                title="Gerenciar Categorias"
            >
                <Settings size={14} />
            </button>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
            {types.map(type => (
                <div key={type.id} className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-lg border border-slate-100">
                    <div 
                        className="w-2 h-2 rounded-full shrink-0" 
                        style={{ backgroundColor: type.color }}
                    ></div>
                    <span className="text-[10px] font-bold text-slate-600 truncate max-w-[80px]">{type.label}</span>
                </div>
            ))}
        </div>

        <button 
            onClick={onManageTypes}
            className="w-full py-3 border border-dashed border-slate-300 rounded-xl text-slate-400 text-xs font-bold uppercase hover:text-blue-600 hover:border-blue-300 hover:bg-blue-50 transition-all flex items-center justify-center gap-2"
        >
            <ListPlus size={16} /> Nova Categoria
        </button>
      </div>

    </div>
  );
};

export default CalendarSidebar;
