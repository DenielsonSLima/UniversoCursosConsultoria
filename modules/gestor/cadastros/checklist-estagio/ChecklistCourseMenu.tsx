import React from 'react';
import { ChevronRight } from 'lucide-react';
import { Curso } from '../cadastros.types';

interface ChecklistCourseMenuProps {
  cursos: Curso[];
  selectedCursoId: string | null;
  setSelectedCursoId: (id: string) => void;
}

const ChecklistCourseMenu: React.FC<ChecklistCourseMenuProps> = ({ cursos, selectedCursoId, setSelectedCursoId }) => (
          <div className="formacao-recursos-course-menu col-span-1 border-r border-slate-100 pr-4">
            <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Cursos Técnicos</h4>
            <div className="space-y-2 mb-6">
              {cursos.map(curso => (
                <button 
                  key={curso.id}
                  onClick={() => setSelectedCursoId(curso.id)}
                  className={`w-full text-left px-4 py-3 rounded-xl flex items-center justify-between transition-colors ${
                    selectedCursoId === curso.id 
                      ? 'bg-teal-50 border border-teal-100 text-teal-700 font-bold' 
                      : 'bg-white border border-transparent text-slate-600 hover:bg-slate-50 hover:border-slate-100 font-medium'
                  }`}
                >
                  <span className="text-sm">{curso.nome}</span>
                  {selectedCursoId === curso.id && <ChevronRight size={16} className="text-teal-400" />}
                </button>
              ))}
            </div>
          </div>


);

export default ChecklistCourseMenu;
