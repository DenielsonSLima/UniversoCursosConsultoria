
import React, { useEffect, useState } from 'react';
import { Layers, BookOpen, UserPlus, ChevronDown, ChevronRight, UserCheck, CheckCircle2, X } from 'lucide-react';
import { Turma } from '../../../gestao.types';
import { cursosTecnicosService } from '../../../../cadastros/cursos-tecnicos/cursos-tecnicos.service';
import { CursoTecnico } from '../../../../cadastros/cursos-tecnicos/cursos-tecnicos.types';

interface TurmaGradeProps {
  turma: Turma;
}

const TurmaGrade: React.FC<TurmaGradeProps> = ({ turma }) => {
  const [cursoBase, setCursoBase] = useState<CursoTecnico | null>(null);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  
  // State to hold extra info (professor, concluded status) for each discipline relative to this Class
  const [disciplinasConfig, setDisciplinasConfig] = useState<Record<string, { professor: string | null; concluida: boolean }>>({});
  
  // Modal states
  const [showDocenteModal, setShowDocenteModal] = useState<{ isOpen: boolean; disciplinaId: string }>({ isOpen: false, disciplinaId: '' });

  useEffect(() => {
    const fetchCurso = async () => {
      const cursos = await cursosTecnicosService.getAll();
      const cursoEncontrado = cursos.find(c => c.id === turma.cursoId) || cursos[0];
      setCursoBase(cursoEncontrado);
      
      if (cursoEncontrado && cursoEncontrado.modulos.length > 0) {
        setExpandedModules(new Set([cursoEncontrado.modulos[0].id]));
        
        // Initialize config
        const initialConfig: Record<string, { professor: string | null; concluida: boolean }> = {};
        cursoEncontrado.modulos.forEach(mod => {
           mod.disciplinas.forEach(disc => {
              initialConfig[disc.id] = { professor: null, concluida: false };
           });
        });
        setDisciplinasConfig(initialConfig);
      }
    };
    fetchCurso();
  }, [turma.cursoId]);

  const toggleModule = (id: string) => {
    const newSet = new Set(expandedModules);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setExpandedModules(newSet);
  };
  
  const handleAssignProfessor = (disciplinaId: string, professorName: string) => {
     setDisciplinasConfig(prev => ({
        ...prev,
        [disciplinaId]: { ...prev[disciplinaId], professor: professorName }
     }));
     setShowDocenteModal({ isOpen: false, disciplinaId: '' });
  };
  
  const toggleConcluida = (disciplinaId: string) => {
     setDisciplinasConfig(prev => ({
        ...prev,
        [disciplinaId]: { ...prev[disciplinaId], concluida: !prev[disciplinaId].concluida }
     }));
  };

  if (!cursoBase) return <div className="p-8 text-center text-slate-500">Carregando estrutura curricular...</div>;

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-lg font-bold text-[#001a33]">Grade Curricular & Corpo Docente</h3>
        <span className="text-xs bg-slate-100 px-3 py-1 rounded-full text-slate-600 font-medium">Baseado em: {cursoBase.nome}</span>
      </div>

      {cursoBase.modulos.length === 0 && (
        <div className="p-12 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-300">
          <p className="text-slate-500">A grade deste curso ainda não foi configurada no cadastro.</p>
        </div>
      )}

      {cursoBase.modulos.map((modulo, index) => {
        // Mock progress for demonstration
        const moduloProgress = index === 0 ? 100 : index === 1 ? 45 : 0;
        
        return (
          <div key={modulo.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <button 
              onClick={() => toggleModule(modulo.id)}
              className="w-full flex items-center justify-between p-5 bg-slate-50/50 hover:bg-slate-100/50 transition-colors"
            >
              <div className="flex items-center gap-4 flex-1">
                <div className="p-3 shadow-sm bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-xl flex shrink-0">
                  <Layers size={20} />
                </div>
                <div className="text-left flex-1">
                  <h4 className="font-black text-[#001a33] text-base mb-1">{modulo.nome}</h4>
                  <div className="flex items-center gap-4">
                    <p className="text-[10px] text-slate-500 uppercase flex items-center gap-1 font-bold tracking-wider">
                      <BookOpen size={12} /> {modulo.disciplinas.length} Disciplinas
                    </p>
                    {moduloProgress > 0 && (
                      <div className="flex items-center gap-2 flex-1 max-w-[200px]">
                        <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${moduloProgress === 100 ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${moduloProgress}%` }}></div>
                        </div>
                        <span className={`text-[10px] font-black ${moduloProgress === 100 ? 'text-emerald-600' : 'text-blue-600'}`}>{moduloProgress}%</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="pl-4">
                {expandedModules.has(modulo.id) ? <ChevronDown size={20} className="text-slate-400" /> : <ChevronRight size={20} className="text-slate-400" />}
              </div>
            </button>

            <div className={`grid transition-all duration-300 ease-in-out ${
              expandedModules.has(modulo.id) ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
            }`}>
              <div className="overflow-hidden">
                <div className="border-t border-slate-100 divide-y divide-slate-50 bg-white">
                  {modulo.disciplinas.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-400 font-medium">Sem disciplinas cadastradas neste módulo.</div>
                  ) : (
                    modulo.disciplinas.map((disc) => {
                      const discConfig = disciplinasConfig[disc.id] || { professor: null, concluida: false };
                      const isComplete = discConfig.concluida;
                      
                      return (
                        <div key={disc.id} className="p-4 sm:px-6 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50 transition-colors">
                          <div className="flex items-center gap-3">
                            <button 
                              onClick={() => toggleConcluida(disc.id)}
                              title={isComplete ? "Marcar como não concluída" : "Marcar como concluída"}
                              className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 cursor-pointer transition-colors ${isComplete ? 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
                            >
                              {isComplete ? <CheckCircle2 size={16} /> : <BookOpen size={16} />}
                            </button>
                            <div>
                              <p className={`text-sm font-bold ${isComplete ? 'text-emerald-700' : 'text-[#001a33]'}`}>{disc.nome}</p>
                              <p className="text-[11px] text-slate-500 font-medium mt-0.5">{disc.cargaHoraria} horas • {disc.aulas?.length || 0} aulas previstas</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            {discConfig.professor ? (
                              <div 
                                onClick={() => setShowDocenteModal({ isOpen: true, disciplinaId: disc.id })}
                                className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 rounded-lg border border-indigo-100 cursor-pointer hover:bg-indigo-100 transition-colors"
                                title="Alterar Docente"
                              >
                                <UserCheck size={14} className="text-indigo-600" />
                                <div className="flex flex-col">
                                  <span className="text-[9px] text-indigo-400 uppercase font-black tracking-widest">Docente</span>
                                  <span className="text-xs font-bold text-indigo-900">{discConfig.professor}</span>
                                </div>
                                <ChevronDown size={14} className="text-indigo-300 ml-1" />
                              </div>
                            ) : (
                              <button 
                                onClick={() => setShowDocenteModal({ isOpen: true, disciplinaId: disc.id })}
                                className="flex items-center gap-2 px-4 py-2 bg-slate-50 border border-dashed border-slate-300 rounded-lg text-slate-500 hover:text-emerald-600 hover:border-emerald-300 hover:bg-emerald-50 transition-all text-xs font-bold uppercase tracking-wide"
                              >
                                <UserPlus size={14} /> Atribuir Docente
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {/* Modal Selecionar Docente */}
      {showDocenteModal.isOpen && (
         <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fadeIn">
            <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl relative">
               <button 
                  type="button" 
                  onClick={() => setShowDocenteModal({ isOpen: false, disciplinaId: '' })}
                  className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:bg-slate-100 transition-colors"
               >
                  <X size={20} />
               </button>
               <h3 className="text-lg font-black text-[#001a33] mb-4">Selecionar Docente</h3>
               <div className="space-y-2 max-h-64 overflow-y-auto">
                  {['Dr. Ricardo Silva', 'Profa. Ana Costa', 'Me. Carlos Mendes', 'Dra. Júlia Soares'].map(prof => (
                     <button
                        key={prof}
                        onClick={() => handleAssignProfessor(showDocenteModal.disciplinaId, prof)}
                        className="w-full text-left px-4 py-3 rounded-xl border border-slate-100 hover:border-indigo-300 hover:bg-indigo-50 font-bold text-slate-700 transition-colors"
                     >
                        {prof}
                     </button>
                  ))}
               </div>
            </div>
         </div>
      )}
    </div>
  );
};

export default TurmaGrade;
