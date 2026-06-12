
import React, { useState } from 'react';
import { 
  ArrowLeft, Clock, Save, 
  BookOpen, Layers, Plus, Trash2, CornerDownRight 
} from 'lucide-react';
import { CursoLivre, Modulo, Disciplina, Aula } from '../cursos-livres.types';
import { cursosLivresService } from '../cursos-livres.service';

interface CursoLivreDetailsProps {
  curso: CursoLivre;
  onBack: () => void;
  onUpdate: () => void;
}

const CursoLivreDetails: React.FC<CursoLivreDetailsProps> = ({ curso, onBack, onUpdate }) => {
  const [currentCurso, setCurrentCurso] = useState<CursoLivre>(JSON.parse(JSON.stringify(curso)));
  const [isSaving, setIsSaving] = useState(false);
  
  // Estados para inputs
  const [newModuloName, setNewModuloName] = useState('');
  
  // Estado para nova disciplina
  const [addingDiscToModId, setAddingDiscToModId] = useState<string | null>(null);
  const [newDiscName, setNewDiscName] = useState('');

  // Estado para nova aula
  const [addingAulaToDiscId, setAddingAulaToDiscId] = useState<string | null>(null);
  const [newAulaTitulo, setNewAulaTitulo] = useState('');
  const [newAulaHoras, setNewAulaHoras] = useState('');

  // Recalcula horas totais
  const totalHorasCalculada = currentCurso.modulos.reduce((accMod, mod) => {
    return accMod + mod.disciplinas.reduce((accDisc, disc) => {
        const horasDisciplina = disc.aulas ? disc.aulas.reduce((accAula, aula) => accAula + (aula.cargaHoraria || 0), 0) : 0;
        return accDisc + horasDisciplina;
    }, 0);
  }, 0);

  // --- MÓDULOS ---
  const handleAddModulo = () => {
    if (!newModuloName.trim()) return;
    const novoModulo: Modulo = {
      id: Math.random().toString(36).substr(2, 9),
      nome: newModuloName,
      disciplinas: []
    };
    setCurrentCurso(prev => ({ ...prev, modulos: [...prev.modulos, novoModulo] }));
    setNewModuloName('');
  };

  const handleRemoveModulo = (moduloId: string) => {
    if(confirm('Remover este módulo e todo seu conteúdo?')) {
        setCurrentCurso(prev => ({ ...prev, modulos: prev.modulos.filter(m => m.id !== moduloId) }));
    }
  };

  // --- DISCIPLINAS ---
  const handleAddDisciplina = (moduloId: string) => {
    if (!newDiscName.trim()) return;
    const novaDisciplina: Disciplina = {
      id: Math.random().toString(36).substr(2, 9),
      nome: newDiscName,
      cargaHoraria: 0, 
      aulas: []
    };

    setCurrentCurso(prev => ({
      ...prev,
      modulos: prev.modulos.map(m => {
        if (m.id === moduloId) return { ...m, disciplinas: [...m.disciplinas, novaDisciplina] };
        return m;
      })
    }));
    setNewDiscName('');
    setAddingDiscToModId(null);
  };

  const handleRemoveDisciplina = (moduloId: string, disciplinaId: string) => {
    if(confirm('Remover disciplina/tópico e suas aulas?')) {
      setCurrentCurso(prev => ({
        ...prev,
        modulos: prev.modulos.map(m => {
          if (m.id === moduloId) return { ...m, disciplinas: m.disciplinas.filter(d => d.id !== disciplinaId) };
          return m;
        })
      }));
    }
  };

  // --- AULAS / CONTEÚDO ---
  const handleAddAula = (moduloId: string, disciplinaId: string) => {
    if (!newAulaTitulo.trim() || !newAulaHoras.trim()) return;

    const horas = parseFloat(newAulaHoras);
    if (isNaN(horas) || horas <= 0) return;

    const novaAula: Aula = {
      id: Math.random().toString(36).substr(2, 9),
      titulo: newAulaTitulo,
      cargaHoraria: horas
    };

    setCurrentCurso(prev => {
        const novosModulos = prev.modulos.map(m => {
            if (m.id === moduloId) {
                return {
                    ...m,
                    disciplinas: m.disciplinas.map(d => {
                        if (d.id === disciplinaId) {
                            const novasAulas = [...(d.aulas || []), novaAula];
                            const novaCarga = novasAulas.reduce((acc, a) => acc + a.cargaHoraria, 0);
                            return { ...d, aulas: novasAulas, cargaHoraria: novaCarga };
                        }
                        return d;
                    })
                };
            }
            return m;
        });
        return { ...prev, modulos: novosModulos };
    });

    setNewAulaTitulo('');
    setNewAulaHoras('');
  };

  const handleRemoveAula = (moduloId: string, disciplinaId: string, aulaId: string) => {
    setCurrentCurso(prev => ({
      ...prev,
      modulos: prev.modulos.map(m => {
        if (m.id === moduloId) {
          return {
            ...m,
            disciplinas: m.disciplinas.map(d => {
              if (d.id === disciplinaId) {
                const novasAulas = d.aulas.filter(a => a.id !== aulaId);
                const novaCarga = novasAulas.reduce((acc, a) => acc + a.cargaHoraria, 0);
                return { ...d, aulas: novasAulas, cargaHoraria: novaCarga };
              }
              return d;
            })
          };
        }
        return m;
      })
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    await cursosLivresService.update(currentCurso);
    setIsSaving(false);
    onUpdate();
    alert('Grade curricular salva com sucesso!');
  };

  return (
    <div className="flex flex-col h-full animate-fadeIn">
      {/* Header Fixo */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 border-b border-slate-100 pb-6">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 rounded-xl border border-slate-200 text-slate-400 hover:text-amber-600 hover:border-amber-200 transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h3 className="text-2xl font-black text-[#001a33]">{currentCurso.nome}</h3>
            <div className="flex items-center gap-3 text-sm text-slate-500 mt-1">
              <span className="flex items-center gap-1"><Clock size={14} /> Meta: {currentCurso.cargaHorariaTotal}h</span>
              <span className="text-slate-300">•</span>
              <span className={`font-bold ${totalHorasCalculada > currentCurso.cargaHorariaTotal ? 'text-red-500' : 'text-emerald-600'}`}>
                Carga Atual: {totalHorasCalculada}h
              </span>
            </div>
          </div>
        </div>
        
        <button onClick={handleSave} disabled={isSaving} className="flex items-center gap-2 bg-[#001a33] text-white px-6 py-3 rounded-xl font-bold uppercase text-xs tracking-wider hover:bg-amber-600 transition-colors shadow-lg shadow-amber-900/20 disabled:opacity-70">
          <Save size={16} /> {isSaving ? 'Salvando...' : 'Salvar Conteúdo'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-8 pb-20">
        
        {/* Renderização dos Módulos */}
        {currentCurso.modulos.map((modulo) => (
          <div key={modulo.id} className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
            
            {/* Header do Módulo */}
            <div className="bg-amber-50/50 px-6 py-4 border-b border-slate-100 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white rounded-lg text-amber-600 border border-slate-100 shadow-sm">
                  <Layers size={18} />
                </div>
                <div>
                  <h4 className="font-bold text-[#001a33]">{modulo.nome}</h4>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                    {modulo.disciplinas.length} Tópicos • {modulo.disciplinas.reduce((acc, d) => acc + d.cargaHoraria, 0)}h
                  </p>
                </div>
              </div>
              <button onClick={() => handleRemoveModulo(modulo.id)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                <Trash2 size={16} />
              </button>
            </div>

            {/* Lista de Disciplinas/Tópicos */}
            <div className="p-4 space-y-4">
              {modulo.disciplinas.length === 0 && (
                <div className="text-center py-6 text-slate-400 text-xs uppercase">Nenhum tópico neste módulo</div>
              )}

              {modulo.disciplinas.map((disc) => (
                <div key={disc.id} className="border border-slate-100 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                  {/* Cabeçalho do Tópico */}
                  <div className="bg-slate-50 px-5 py-3 flex justify-between items-center border-b border-slate-100">
                    <div className="flex items-center gap-2 text-slate-700">
                      <BookOpen size={16} className="text-amber-500" />
                      <span className="font-bold text-sm">{disc.nome}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-xs font-bold text-slate-500 bg-white px-3 py-1 rounded-full border border-slate-100">
                        {disc.cargaHoraria}h
                      </div>
                      <button onClick={() => handleRemoveDisciplina(modulo.id, disc.id)} className="text-slate-300 hover:text-red-500 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Lista de Aulas */}
                  <div className="bg-white p-4">
                    <div className="space-y-2">
                      {disc.aulas?.map((aula) => (
                        <div key={aula.id} className="flex items-center justify-between group pl-4 border-l-2 border-slate-100 hover:border-amber-400 transition-colors py-1">
                          <div className="flex items-center gap-2 text-sm text-slate-600">
                            <CornerDownRight size={12} className="text-slate-300" />
                            <span>{aula.titulo}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-mono font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded">{aula.cargaHoraria}h</span>
                            <button 
                              onClick={() => handleRemoveAula(modulo.id, disc.id, aula.id)}
                              className="text-slate-200 hover:text-red-500 transition-colors"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Adicionar Aula Input */}
                    <div className="mt-3 pl-4 flex gap-2 items-center">
                        <CornerDownRight size={12} className="text-emerald-500" />
                        <input 
                          type="text" 
                          placeholder="Nova aula/atividade..."
                          className="flex-1 text-sm bg-slate-50 border-b border-transparent focus:border-emerald-500 outline-none px-2 py-1 transition-colors"
                          value={addingAulaToDiscId === disc.id ? newAulaTitulo : ''}
                          onChange={(e) => {
                            setAddingAulaToDiscId(disc.id);
                            setNewAulaTitulo(e.target.value);
                          }}
                          onKeyDown={(e) => { if(e.key === 'Enter') document.getElementById(`horas-livre-${disc.id}`)?.focus(); }}
                        />
                        <input 
                          id={`horas-livre-${disc.id}`}
                          type="number" 
                          placeholder="Hrs"
                          className="w-16 text-sm bg-slate-50 border-b border-transparent focus:border-emerald-500 outline-none px-2 py-1 transition-colors text-center"
                          value={addingAulaToDiscId === disc.id ? newAulaHoras : ''}
                          onChange={(e) => setNewAulaHoras(e.target.value)}
                          onKeyDown={(e) => { if(e.key === 'Enter') handleAddAula(modulo.id, disc.id); }}
                        />
                        <button 
                          onClick={() => handleAddAula(modulo.id, disc.id)}
                          className="p-1 bg-emerald-100 text-emerald-600 rounded hover:bg-emerald-600 hover:text-white transition-colors"
                          disabled={addingAulaToDiscId !== disc.id || !newAulaTitulo || !newAulaHoras}
                        >
                          <Plus size={14} />
                        </button>
                    </div>
                  </div>
                </div>
              ))}

              {/* Adicionar Tópico ao Módulo */}
              <div className="mt-4 pt-4 border-t border-slate-100 border-dashed">
                {addingDiscToModId === modulo.id ? (
                  <div className="flex gap-2">
                    <input 
                      autoFocus
                      type="text" 
                      placeholder="Nome do Novo Tópico/Disciplina"
                      className="flex-1 px-4 py-2 bg-white border border-blue-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-100 text-sm"
                      value={newDiscName}
                      onChange={(e) => setNewDiscName(e.target.value)}
                      onKeyDown={(e) => { if(e.key === 'Enter') handleAddDisciplina(modulo.id); }}
                    />
                    <button onClick={() => handleAddDisciplina(modulo.id)} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold uppercase hover:bg-blue-700">
                      Adicionar
                    </button>
                    <button onClick={() => setAddingDiscToModId(null)} className="px-3 py-2 bg-slate-100 text-slate-500 rounded-xl hover:bg-slate-200">
                      <ArrowLeft size={16} />
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={() => setAddingDiscToModId(modulo.id)}
                    className="w-full py-2 border border-dashed border-slate-300 rounded-xl text-slate-400 text-xs font-bold uppercase hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-all flex items-center justify-center gap-2"
                  >
                    <Plus size={14} /> Novo Tópico
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}

        {/* Criar Novo Módulo */}
        <div className="bg-slate-50 rounded-[2rem] border-2 border-dashed border-slate-200 p-6 flex items-center justify-center gap-3">
           <input 
             type="text" 
             placeholder="Nome do Novo Módulo"
             className="w-64 px-4 py-2 rounded-xl border border-slate-200 outline-none focus:border-blue-500 text-sm bg-white"
             value={newModuloName}
             onChange={(e) => setNewModuloName(e.target.value)}
           />
           <button onClick={handleAddModulo} className="px-4 py-2 bg-[#001a33] text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-blue-900 transition-colors">
             <Plus size={14} /> Criar Módulo
           </button>
        </div>

      </div>
    </div>
  );
};

export default CursoLivreDetails;
