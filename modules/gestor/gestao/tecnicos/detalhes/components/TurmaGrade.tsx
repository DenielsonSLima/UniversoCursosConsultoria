// File: modules/gestor/gestao/tecnicos/detalhes/components/TurmaGrade.tsx

import React, { useEffect, useState } from 'react';
import { 
  Layers, BookOpen, UserPlus, ChevronDown, ChevronRight, 
  UserCheck, CheckCircle2, X, Plus, Trash2, CornerDownRight, Loader2
} from 'lucide-react';
import { Turma } from '../../../gestao.types';
import { cursosTecnicosService } from '../../../../cadastros/cursos-tecnicos/cursos-tecnicos.service';
import { CursoTecnico } from '../../../../cadastros/cursos-tecnicos/cursos-tecnicos.types';
import { supabase } from '../../../../../../lib/supabase';
import ToastNotification, { useToast } from '../../../../parceiros/components/shared/ToastNotification';


interface TurmaGradeProps {
  turma: Turma;
}

const TurmaGrade: React.FC<TurmaGradeProps> = ({ turma }) => {
  const { toasts, removeToast, toast } = useToast();
  const [cursoBase, setCursoBase] = useState<CursoTecnico | null>(null);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [expandedDisciplines, setExpandedDisciplines] = useState<Set<string>>(new Set());
  
  // State for database data
  const [disciplinasConfig, setDisciplinasConfig] = useState<Record<string, { professor: string | null; concluida: boolean }>>({});
  const [aulas, setAulas] = useState<Record<string, { id: string; titulo: string; cargaHoraria: number }[]>>({});
  const [professores, setProfessores] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Form inputs for adding lessons
  const [newAulaTitulo, setNewAulaTitulo] = useState<Record<string, string>>({});
  const [newAulaHoras, setNewAulaHoras] = useState<Record<string, string>>({});

  // Modal states
  const [showDocenteModal, setShowDocenteModal] = useState<{ isOpen: boolean; disciplinaId: string }>({ isOpen: false, disciplinaId: '' });

  useEffect(() => {
    const fetchDados = async () => {
      setLoading(true);
      try {
        // 1. Fetch Course Base
        const cursos = await cursosTecnicosService.getAll();
        const cursoEncontrado = cursos.find(c => c.id === turma.cursoId) || cursos[0];
        setCursoBase(cursoEncontrado);
        
        if (cursoEncontrado) {
          if (cursoEncontrado.modulos.length > 0) {
            setExpandedModules(new Set([cursoEncontrado.modulos[0].id]));
          }

          // Initialize defaults in local state for all disciplines
          const defaultConfigs: Record<string, { professor: string | null; concluida: boolean }> = {};
          cursoEncontrado.modulos.forEach(mod => {
            mod.disciplinas.forEach(disc => {
              defaultConfigs[disc.id] = { professor: null, concluida: false };
            });
          });
          setDisciplinasConfig(defaultConfigs);

          // 2. Fetch class discipline config from DB
          const { data: configsData, error: configError } = await supabase
            .from('turmas_disciplinas')
            .select('*')
            .eq('turma_id', turma.id);

          if (configError) throw configError;

          const dbConfigs: Record<string, { professor: string | null; concluida: boolean }> = {};
          configsData?.forEach(c => {
            dbConfigs[c.disciplina_id] = { 
              professor: c.professor_nome, 
              concluida: c.concluida 
            };
          });
          setDisciplinasConfig(prev => ({ ...prev, ...dbConfigs }));

          // 3. Fetch class lessons from DB
          const { data: aulasData, error: aulasError } = await supabase
            .from('aulas_turma')
            .select('*')
            .eq('turma_id', turma.id)
            .order('created_at', { ascending: true });

          if (aulasError) throw aulasError;

          const dbAulas: Record<string, { id: string; titulo: string; cargaHoraria: number }[]> = {};
          aulasData?.forEach(a => {
            if (!dbAulas[a.disciplina_id]) {
              dbAulas[a.disciplina_id] = [];
            }
            dbAulas[a.disciplina_id].push({
              id: a.id,
              titulo: a.titulo,
              cargaHoraria: parseFloat(a.carga_horaria)
            });
          });
          setAulas(dbAulas);
        }

        // 4. Fetch teachers
        const { data: profsData, error: profsError } = await supabase
          .from('parceiros')
          .select('nome')
          .eq('tipo', 'Professor')
          .eq('status', 'ativo')
          .order('nome', { ascending: true });

        if (profsError) throw profsError;
        if (profsData && profsData.length > 0) {
          setProfessores(profsData.map(p => p.nome));
        } else {
          setProfessores([]);
        }
      } catch (err) {
        console.error('Erro ao buscar dados operacionais da turma:', err);
        setProfessores([]);
      } finally {
        setLoading(false);
      }
    };
    fetchDados();
  }, [turma.id, turma.cursoId]);

  const toggleModule = (id: string) => {
    const newSet = new Set(expandedModules);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setExpandedModules(newSet);
  };

  const toggleDiscipline = (id: string) => {
    const newSet = new Set(expandedDisciplines);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setExpandedDisciplines(newSet);
  };
  
  const handleAssignProfessor = async (disciplinaId: string, professorName: string) => {
    try {
      const currentConfig = disciplinasConfig[disciplinaId] || { professor: null, concluida: false };
      const { error } = await supabase
        .from('turmas_disciplinas')
        .upsert({
          turma_id: turma.id,
          disciplina_id: disciplinaId,
          professor_nome: professorName,
          concluida: currentConfig.concluida
        }, { onConflict: 'turma_id,disciplina_id' });

      if (error) throw error;

      setDisciplinasConfig(prev => ({
        ...prev,
        [disciplinaId]: { ...prev[disciplinaId], professor: professorName }
      }));
    } catch (err) {
      console.error('Erro ao atribuir docente:', err);
      toast.error('Erro', 'Erro ao salvar docente no banco.');
    }
    setShowDocenteModal({ isOpen: false, disciplinaId: '' });
  };
  
  const toggleConcluida = async (disciplinaId: string) => {
    try {
      const currentConfig = disciplinasConfig[disciplinaId] || { professor: null, concluida: false };
      const nextConcluida = !currentConfig.concluida;
      const { error } = await supabase
        .from('turmas_disciplinas')
        .upsert({
          turma_id: turma.id,
          disciplina_id: disciplinaId,
          professor_nome: currentConfig.professor,
          concluida: nextConcluida
        }, { onConflict: 'turma_id,disciplina_id' });

      if (error) throw error;

      setDisciplinasConfig(prev => ({
        ...prev,
        [disciplinaId]: { ...prev[disciplinaId], concluida: nextConcluida }
      }));
    } catch (err) {
      console.error('Erro ao alternar status da disciplina:', err);
      toast.error('Erro', 'Erro ao salvar status da disciplina no banco.');
    }
  };

  const handleAddAula = async (disciplinaId: string) => {
    const titulo = newAulaTitulo[disciplinaId]?.trim();
    const horasStr = newAulaHoras[disciplinaId]?.trim();
    if (!titulo || !horasStr) return;

    const horas = parseFloat(horasStr);
    if (isNaN(horas) || horas <= 0) return;

    try {
      const { data, error } = await supabase
        .from('aulas_turma')
        .insert({
          turma_id: turma.id,
          disciplina_id: disciplinaId,
          titulo,
          carga_horaria: horas
        })
        .select()
        .single();

      if (error) throw error;

      const novaAula = {
        id: data.id,
        titulo: data.titulo,
        cargaHoraria: parseFloat(data.carga_horaria)
      };

      setAulas(prev => ({
        ...prev,
        [disciplinaId]: [...(prev[disciplinaId] || []), novaAula]
      }));

      // Reset locally
      setNewAulaTitulo(prev => ({ ...prev, [disciplinaId]: '' }));
      setNewAulaHoras(prev => ({ ...prev, [disciplinaId]: '' }));
    } catch (err) {
      console.error('Erro ao adicionar aula:', err);
      toast.error('Erro', 'Erro ao salvar aula no banco.');
    }
  };

  const handleRemoveAula = async (disciplinaId: string, aulaId: string) => {
    if (!confirm('Deseja realmente remover esta aula da turma?')) return;
    try {
      const { error } = await supabase
        .from('aulas_turma')
        .delete()
        .eq('id', aulaId);

      if (error) throw error;

      setAulas(prev => ({
        ...prev,
        [disciplinaId]: (prev[disciplinaId] || []).filter(a => a.id !== aulaId)
      }));
    } catch (err) {
      console.error('Erro ao remover aula:', err);
      toast.error('Erro', 'Erro ao excluir aula do banco.');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="animate-spin text-emerald-600" size={32} />
        <span className="text-slate-500 font-bold ml-3">Carregando estrutura e aulas...</span>
      </div>
    );
  }

  if (!cursoBase) return <div className="p-8 text-center text-slate-500">Erro ao carregar estrutura curricular.</div>;

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
        // progress for module calculated from completed disciplines
        const totalDiscs = modulo.disciplinas.length;
        const completedDiscs = modulo.disciplinas.filter(d => disciplinasConfig[d.id]?.concluida).length;
        const moduloProgress = totalDiscs > 0 ? Math.round((completedDiscs / totalDiscs) * 100) : 0;
        
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
                      <BookOpen size={12} /> {totalDiscs} Disciplinas
                    </p>
                    {totalDiscs > 0 && (
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
                <div className="border-t border-slate-100 divide-y divide-slate-100 bg-white">
                  {modulo.disciplinas.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-400 font-medium">Sem disciplinas cadastradas neste módulo.</div>
                  ) : (
                    modulo.disciplinas.map((disc) => {
                      const discConfig = disciplinasConfig[disc.id] || { professor: null, concluida: false };
                      const isComplete = discConfig.concluida;
                      const discAulas = aulas[disc.id] || [];
                      const sumHoras = discAulas.reduce((acc, a) => acc + a.cargaHoraria, 0);
                      const isExpanded = expandedDisciplines.has(disc.id);
                      
                      let progressColor = 'bg-blue-500';
                      let progressTextClass = 'text-blue-600';
                      if (sumHoras === disc.cargaHoraria) {
                        progressColor = 'bg-emerald-500';
                        progressTextClass = 'text-emerald-600';
                      } else if (sumHoras > disc.cargaHoraria) {
                        progressColor = 'bg-red-500';
                        progressTextClass = 'text-red-600';
                      }
                      
                      return (
                        <div key={disc.id} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/30 transition-colors">
                          {/* Cabeçalho da Disciplina */}
                          <div className="p-4 sm:px-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <button 
                                onClick={() => toggleConcluida(disc.id)}
                                title={isComplete ? "Marcar como não concluída" : "Marcar como concluída"}
                                className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 cursor-pointer transition-colors ${isComplete ? 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
                              >
                                {isComplete ? <CheckCircle2 size={16} /> : <BookOpen size={16} />}
                              </button>
                              
                              <div 
                                onClick={() => toggleDiscipline(disc.id)}
                                className="flex-1 min-w-0 cursor-pointer text-left"
                              >
                                <div className="flex items-center gap-2">
                                  <p className={`text-sm font-bold truncate ${isComplete ? 'text-emerald-700' : 'text-[#001a33]'}`}>{disc.nome}</p>
                                  {isExpanded ? <ChevronDown size={14} className="text-slate-400 shrink-0" /> : <ChevronRight size={14} className="text-slate-400 shrink-0" />}
                                </div>
                                <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                                  {disc.cargaHoraria} horas oficiais • {discAulas.length} aulas ({sumHoras}h) planejadas
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-4 shrink-0">
                              {/* Carga Horária Status Badge */}
                              <div 
                                onClick={() => toggleDiscipline(disc.id)}
                                className="cursor-pointer flex flex-col items-end shrink-0"
                              >
                                <span className={`text-[10px] font-black uppercase tracking-wider ${progressTextClass}`}>
                                  {sumHoras}h de {disc.cargaHoraria}h
                                </span>
                                <div className="w-20 h-1 bg-slate-200 rounded-full overflow-hidden mt-1">
                                  <div className={`h-full rounded-full ${progressColor}`} style={{ width: `${Math.min((sumHoras / disc.cargaHoraria) * 100, 100)}%` }}></div>
                                </div>
                              </div>

                              {discConfig.professor ? (
                                <div 
                                  onClick={() => setShowDocenteModal({ isOpen: true, disciplinaId: disc.id })}
                                  className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 rounded-lg border border-indigo-100 cursor-pointer hover:bg-indigo-100 transition-colors"
                                  title="Alterar Docente"
                                >
                                  <UserCheck size={14} className="text-indigo-600" />
                                  <div className="flex flex-col">
                                    <span className="text-[9px] text-indigo-400 uppercase font-black tracking-widest text-left">Docente</span>
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

                          {/* Seção Expandida: Planejamento de Aulas */}
                          {isExpanded && (
                            <div className="px-6 pb-6 pt-2 border-t border-slate-50 bg-slate-50/5 animate-slideDown">
                              {/* Barra de Status Detalhada */}
                              <div className="flex items-center justify-between gap-4 mb-4 bg-white p-3 rounded-2xl border border-slate-100 shadow-inner">
                                <span className="text-xs font-bold text-slate-500">Planejamento das Aulas:</span>
                                <div className="flex items-center gap-2">
                                  {sumHoras === disc.cargaHoraria ? (
                                    <span className="bg-emerald-50 text-emerald-600 text-[10px] font-bold px-2.5 py-1 rounded-lg border border-emerald-100 uppercase tracking-wider flex items-center gap-1">
                                      <CheckCircle2 size={12} /> Grade Concluída e Exata
                                    </span>
                                  ) : sumHoras > disc.cargaHoraria ? (
                                    <span className="bg-red-50 text-red-600 text-[10px] font-bold px-2.5 py-1 rounded-lg border border-red-100 uppercase tracking-wider flex items-center gap-1">
                                      Excesso de {sumHoras - disc.cargaHoraria}h!
                                    </span>
                                  ) : (
                                    <span className="bg-amber-50 text-amber-600 text-[10px] font-bold px-2.5 py-1 rounded-lg border border-amber-100 uppercase tracking-wider flex items-center gap-1">
                                      Faltam {disc.cargaHoraria - sumHoras}h para completar a grade
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Lista de Aulas Operacionais */}
                              <div className="space-y-2 mb-4 pl-4">
                                {discAulas.length === 0 ? (
                                  <p className="text-xs text-slate-400 italic py-2">Nenhuma aula cadastrada nesta turma ainda.</p>
                                ) : (
                                  discAulas.map((aula, idx) => (
                                    <div key={aula.id} className="flex items-center justify-between group pl-4 border-l-2 border-slate-200 hover:border-emerald-400 transition-colors py-1.5 bg-white pr-3 rounded-r-xl border-y border-r border-slate-100 shadow-sm">
                                      <div className="flex items-center gap-2 text-sm text-slate-700 min-w-0">
                                        <CornerDownRight size={12} className="text-slate-400 shrink-0" />
                                        <span className="font-semibold text-xs text-slate-500 shrink-0">Aula {idx + 1}:</span>
                                        <span className="truncate text-slate-600">{aula.titulo}</span>
                                      </div>
                                      <div className="flex items-center gap-3 shrink-0">
                                        <span className="text-[10px] font-mono font-bold text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">{aula.cargaHoraria}h</span>
                                        <button 
                                          onClick={() => handleRemoveAula(disc.id, aula.id)}
                                          className="text-slate-300 hover:text-red-500 transition-colors cursor-pointer"
                                          title="Excluir aula"
                                        >
                                          <Trash2 size={14} />
                                        </button>
                                      </div>
                                    </div>
                                  ))
                                )}
                              </div>

                              {/* Form para Adicionar Aula */}
                              <div className="mt-3 pl-4 flex gap-3 items-center">
                                <CornerDownRight size={14} className="text-emerald-500 shrink-0" />
                                <input 
                                  type="text" 
                                  placeholder="Título da aula / conteúdo..."
                                  className="flex-1 text-xs bg-white border border-slate-200 rounded-xl outline-none focus:border-emerald-500 px-3 py-2.5 transition-colors font-medium text-slate-700 placeholder-slate-400"
                                  value={newAulaTitulo[disc.id] || ''}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setNewAulaTitulo(prev => ({ ...prev, [disc.id]: val }));
                                  }}
                                  onKeyDown={(e) => { if (e.key === 'Enter') document.getElementById(`turma-horas-input-${disc.id}`)?.focus(); }}
                                />
                                <input 
                                  id={`turma-horas-input-${disc.id}`}
                                  type="number" 
                                  placeholder="Hrs"
                                  className="w-20 text-xs bg-white border border-slate-200 rounded-xl outline-none focus:border-emerald-500 px-2 py-2.5 transition-colors text-center font-bold text-slate-700 placeholder-slate-400"
                                  value={newAulaHoras[disc.id] || ''}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setNewAulaHoras(prev => ({ ...prev, [disc.id]: val }));
                                  }}
                                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddAula(disc.id); }}
                                />
                                <button 
                                  onClick={() => handleAddAula(disc.id)}
                                  className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-600 hover:text-white transition-colors border border-emerald-100 flex items-center justify-center shrink-0 cursor-pointer disabled:opacity-50"
                                  disabled={!newAulaTitulo[disc.id]?.trim() || !newAulaHoras[disc.id]?.trim()}
                                >
                                  <Plus size={16} />
                                </button>
                              </div>
                            </div>
                          )}
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
                  {professores.length === 0 ? (
                     <div className="text-center py-6 text-slate-400">
                        <p className="font-bold text-sm">Nenhum professor cadastrado.</p>
                        <p className="text-xs text-slate-500 mt-1">Cadastre professores ativos no módulo de Parceiros primeiro.</p>
                     </div>
                  ) : (
                     professores.map(prof => (
                        <button
                           key={prof}
                           onClick={() => handleAssignProfessor(showDocenteModal.disciplinaId, prof)}
                           className="w-full text-left px-4 py-3 rounded-xl border border-slate-100 hover:border-indigo-300 hover:bg-indigo-50 font-bold text-slate-700 transition-colors"
                        >
                           {prof}
                        </button>
                     ))
                  )}
               </div>
            </div>
         </div>
      )}
      <ToastNotification toasts={toasts} onRemove={removeToast} />
    </div>
  );
};

export default TurmaGrade;
