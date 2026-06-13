// File: modules/gestor/cadastros/components/CursoGradeCurricularDetails.tsx

import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, Clock, Save, 
  BookOpen, Layers, Plus, Trash2, CornerDownRight, Loader2, X
} from 'lucide-react';
import { Curso, Modulo, Disciplina, Aula } from '../cadastros.types';
import { cadastrosService } from '../cadastros.service';

interface CursoGradeCurricularDetailsProps {
  curso: Curso;
  onBack: () => void;
  onUpdate: () => void;
}

// Configurações dinâmicas de estilo e texto por modalidade
const getModalidadeConfig = (modalidade: Curso['modalidade']) => {
  switch (modalidade) {
    case 'TECNICO':
      return {
        themeColor: 'emerald',
        textColor: 'text-emerald-600',
        bgColor: 'bg-emerald-50/50',
        borderColor: 'border-emerald-200',
        hoverBorderColor: 'hover:border-emerald-400',
        hoverBgColor: 'hover:bg-emerald-50',
        labelDisciplina: 'Disciplina',
        labelAula: 'Aula/Conteúdo',
        labelSave: 'Salvar Grade'
      };
    case 'LIVRE':
      return {
        themeColor: 'amber',
        textColor: 'text-amber-600',
        bgColor: 'bg-amber-50/50',
        borderColor: 'border-amber-200',
        hoverBorderColor: 'hover:border-amber-400',
        hoverBgColor: 'hover:bg-amber-50',
        labelDisciplina: 'Tópico',
        labelAula: 'Aula/Atividade',
        labelSave: 'Salvar Conteúdo'
      };
    case 'ESPECIALIZACAO':
      return {
        themeColor: 'rose',
        textColor: 'text-rose-600',
        bgColor: 'bg-rose-50/50',
        borderColor: 'border-rose-200',
        hoverBorderColor: 'hover:border-rose-400',
        hoverBgColor: 'hover:bg-rose-50',
        labelDisciplina: 'Disciplina',
        labelAula: 'Aula/Conteúdo',
        labelSave: 'Salvar Especialização'
      };
    case 'EAD':
      return {
        themeColor: 'purple',
        textColor: 'text-purple-600',
        bgColor: 'bg-purple-50/50',
        borderColor: 'border-purple-200',
        hoverBorderColor: 'hover:border-purple-400',
        hoverBgColor: 'hover:bg-purple-50',
        labelDisciplina: 'Disciplina',
        labelAula: 'Aula/Módulo',
        labelSave: 'Salvar Grade EAD'
      };
    case 'SUPERIOR':
      return {
        themeColor: 'blue',
        textColor: 'text-blue-800',
        bgColor: 'bg-blue-50/50',
        borderColor: 'border-blue-200',
        hoverBorderColor: 'hover:border-blue-400',
        hoverBgColor: 'hover:bg-blue-50',
        labelDisciplina: 'Disciplina',
        labelAula: 'Aula/Conteúdo',
        labelSave: 'Salvar Grade'
      };
    default:
      return {
        themeColor: 'slate',
        textColor: 'text-slate-600',
        bgColor: 'bg-slate-50/50',
        borderColor: 'border-slate-200',
        hoverBorderColor: 'hover:border-slate-400',
        hoverBgColor: 'hover:bg-slate-50',
        labelDisciplina: 'Disciplina',
        labelAula: 'Aula',
        labelSave: 'Salvar'
      };
  }
};

const CursoGradeCurricularDetails: React.FC<CursoGradeCurricularDetailsProps> = ({ curso, onBack, onUpdate }) => {
  const [modulos, setModulos] = useState<Modulo[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  // Estados para inputs de novos itens
  const [newModuloName, setNewModuloName] = useState('');
  const [addingDiscToModId, setAddingDiscToModId] = useState<string | null>(null);
  const [newDiscName, setNewDiscName] = useState('');
  const [newDiscDesc, setNewDiscDesc] = useState('');
  const [addingAulaToDiscId, setAddingAulaToDiscId] = useState<string | null>(null);
  const [newAulaTitulo, setNewAulaTitulo] = useState('');
  const [newAulaHoras, setNewAulaHoras] = useState('');

  // Obter configurações visuais com base no tipo de curso
  const config = getModalidadeConfig(curso.modalidade);

  // Carregar a grade curricular do Supabase
  useEffect(() => {
    loadGrade();
  }, [curso.id]);

  const loadGrade = async () => {
    setLoading(true);
    try {
      const data = await cadastrosService.getGrade(curso.id);
      setModulos(data);
    } catch (err) {
      console.error(err);
      alert('Erro ao carregar grade do banco de dados.');
    } finally {
      setLoading(false);
    }
  };

  // Recalcula horas totais da grade com base na soma das aulas
  const totalHorasCalculada = modulos.reduce((accMod, mod) => {
    return accMod + mod.disciplinas.reduce((accDisc, disc) => {
      const horasDisciplina = disc.aulas ? disc.aulas.reduce((accAula, aula) => accAula + (aula.cargaHoraria || 0), 0) : 0;
      return accDisc + horasDisciplina;
    }, 0);
  }, 0);

  // --- MÓDULOS ---
  const handleAddModulo = () => {
    if (!newModuloName.trim()) return;
    const novoModulo: Modulo = {
      id: `temp-mod-${Math.random().toString(36).substr(2, 9)}`,
      nome: newModuloName,
      disciplinas: []
    };
    setModulos(prev => [...prev, novoModulo]);
    setNewModuloName('');
  };

  const handleRemoveModulo = (moduloId: string) => {
    if (confirm('Remover este módulo e todo seu conteúdo?')) {
      setModulos(prev => prev.filter(m => m.id !== moduloId));
    }
  };

  // --- DISCIPLINAS ---
  const handleAddDisciplina = (moduloId: string) => {
    if (!newDiscName.trim()) return;
    const novaDisciplina: Disciplina = {
      id: `temp-disc-${Math.random().toString(36).substr(2, 9)}`,
      nome: newDiscName,
      cargaHoraria: 0,
      descricao: newDiscDesc.trim() || undefined,
      aulas: []
    };

    setModulos(prev => prev.map(m => {
      if (m.id === moduloId) return { ...m, disciplinas: [...m.disciplinas, novaDisciplina] };
      return m;
    }));
    setNewDiscName('');
    setNewDiscDesc('');
    setAddingDiscToModId(null);
  };

  const handleRemoveDisciplina = (moduloId: string, disciplinaId: string) => {
    if (confirm(`Remover ${config.labelDisciplina.toLowerCase()} e suas aulas?`)) {
      setModulos(prev => prev.map(m => {
        if (m.id === moduloId) return { ...m, disciplinas: m.disciplinas.filter(d => d.id !== disciplinaId) };
        return m;
      }));
    }
  };

  // --- AULAS ---
  const handleAddAula = (moduloId: string, disciplinaId: string) => {
    if (!newAulaTitulo.trim() || !newAulaHoras.trim()) return;

    const horas = parseFloat(newAulaHoras);
    if (isNaN(horas) || horas <= 0) return;

    const novaAula: Aula = {
      id: `temp-aula-${Math.random().toString(36).substr(2, 9)}`,
      titulo: newAulaTitulo,
      cargaHoraria: horas
    };

    setModulos(prev => prev.map(m => {
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
    }));

    setNewAulaTitulo('');
    setNewAulaHoras('');
  };

  const handleRemoveAula = (moduloId: string, disciplinaId: string, aulaId: string) => {
    setModulos(prev => prev.map(m => {
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
    }));
  };

  // --- PERSISTÊNCIA ---
  const handleSave = async () => {
    setIsSaving(true);
    try {
      // 1. Salva a grade no Supabase
      await cadastrosService.saveGrade(curso.id, modulos);
      // 2. Atualiza a carga horária total calculada do curso no banco
      const cursoAtualizado = { ...curso, carga_horaria: totalHorasCalculada };
      await cadastrosService.updateCurso(cursoAtualizado);

      setIsSaving(false);
      onUpdate();
      alert('Grade curricular e carga horária salvas no Supabase com sucesso!');
    } catch (err) {
      console.error(err);
      alert('Erro ao salvar grade no banco de dados.');
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full animate-fadeIn">
      {/* Header Fixo */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 border-b border-slate-100 pb-6">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className={`p-2 rounded-xl border border-slate-200 text-slate-400 hover:text-${config.themeColor}-600 hover:border-${config.themeColor}-200 transition-colors`}>
            <ArrowLeft size={20} />
          </button>
          <div>
            <h3 className="text-2xl font-black text-[#001a33]">{curso.nome} <span className="text-sm bg-slate-100 text-slate-500 px-2.5 py-1 rounded-full font-bold ml-2">v{curso.versao}</span></h3>
            <div className="flex items-center gap-3 text-sm text-slate-500 mt-1">
              <span className="flex items-center gap-1"><Clock size={14} /> Carga Original: {curso.carga_horaria}h</span>
              <span className="text-slate-300">•</span>
              <span className={`font-bold ${totalHorasCalculada > curso.carga_horaria ? 'text-red-500' : 'text-emerald-600'}`}>
                Grade Atual: {totalHorasCalculada}h (Soma das Aulas)
              </span>
            </div>
          </div>
        </div>
        
        <button onClick={handleSave} disabled={isSaving || loading} className="flex items-center gap-2 bg-[#001a33] text-white px-6 py-3 rounded-xl font-bold uppercase text-xs tracking-wider hover:bg-blue-900 transition-colors shadow-lg shadow-blue-900/20 disabled:opacity-70">
          <Save size={16} /> {isSaving ? 'Salvando...' : config.labelSave}
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-20 flex-1">
          <Loader2 className="animate-spin text-blue-600" size={32} />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-8 pb-20">
          {/* Renderização dos Módulos */}
          {modulos.map((modulo) => (
            <div key={modulo.id} className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
              
              {/* Header do Módulo */}
              <div className={`${config.bgColor} px-6 py-4 border-b border-slate-100 flex justify-between items-center`}>
                <div className="flex items-center gap-3">
                  <div className={`p-2 bg-white rounded-lg ${config.textColor} border border-slate-100 shadow-sm`}>
                    <Layers size={18} />
                  </div>
                  <div>
                    <h4 className="font-bold text-[#001a33]">{modulo.nome}</h4>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                      {modulo.disciplinas.length} {modulo.disciplinas.length === 1 ? config.labelDisciplina : config.labelDisciplina + 's'} • {modulo.disciplinas.reduce((acc, d) => acc + d.cargaHoraria, 0)}h Totais
                    </p>
                  </div>
                </div>
                <button onClick={() => handleRemoveModulo(modulo.id)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                  <Trash2 size={16} />
                </button>
              </div>

              {/* Lista de Disciplinas/Tópicos do Módulo */}
              <div className="p-4 space-y-4">
                {modulo.disciplinas.length === 0 && (
                  <div className="text-center py-6 text-slate-400 text-xs uppercase">Nenhuma {config.labelDisciplina.toLowerCase()} neste módulo</div>
                )}

                {modulo.disciplinas.map((disc) => (
                  <div key={disc.id} className="border border-slate-100 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                    {/* Cabeçalho da Disciplina */}
                    <div className="bg-slate-50 px-5 py-3 flex justify-between items-center border-b border-slate-100">
                      <div className="flex flex-col text-slate-700">
                        <div className="flex items-center gap-2">
                          <BookOpen size={16} className={config.textColor} />
                          <span className="font-bold text-sm">{disc.nome}</span>
                        </div>
                        {disc.descricao && (
                          <p className="text-xs text-slate-400 font-medium pl-6 mt-1">
                            {disc.descricao}
                          </p>
                        )}
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
                          <div key={aula.id} className={`flex items-center justify-between group pl-4 border-l-2 border-slate-100 hover:border-${config.themeColor}-400 transition-colors py-1`}>
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
                          placeholder={`Nova ${config.labelAula.toLowerCase()}...`}
                          className="flex-1 text-sm bg-slate-50 border-b border-transparent focus:border-emerald-500 outline-none px-2 py-1 transition-colors"
                          value={addingAulaToDiscId === disc.id ? newAulaTitulo : ''}
                          onChange={(e) => {
                            setAddingAulaToDiscId(disc.id);
                            setNewAulaTitulo(e.target.value);
                          }}
                          onKeyDown={(e) => { if (e.key === 'Enter') document.getElementById(`horas-input-${disc.id}`)?.focus(); }}
                        />
                        <input 
                          id={`horas-input-${disc.id}`}
                          type="number" 
                          placeholder="Hrs"
                          className="w-16 text-sm bg-slate-50 border-b border-transparent focus:border-emerald-500 outline-none px-2 py-1 transition-colors text-center"
                          value={addingAulaToDiscId === disc.id ? newAulaHoras : ''}
                          onChange={(e) => setNewAulaHoras(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleAddAula(modulo.id, disc.id); }}
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

                {/* Adicionar Disciplina ao Módulo */}
                <div className="mt-4 pt-4 border-t border-slate-100 border-dashed">
                  {addingDiscToModId === modulo.id ? (
                    <div className="flex flex-col gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                      <input 
                        autoFocus
                        type="text" 
                        placeholder={`Nome da Nova ${config.labelDisciplina} *`}
                        className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-100 text-sm font-bold"
                        value={newDiscName}
                        onChange={(e) => setNewDiscName(e.target.value)}
                      />
                      <input 
                        type="text" 
                        placeholder={`Descrição da ${config.labelDisciplina} (Opcional)`}
                        className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-100 text-sm"
                        value={newDiscDesc}
                        onChange={(e) => setNewDiscDesc(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleAddDisciplina(modulo.id); }}
                      />
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => handleAddDisciplina(modulo.id)} className="px-4 py-2 bg-[#001a33] text-white rounded-xl text-xs font-bold uppercase hover:bg-blue-900">
                          Adicionar
                        </button>
                        <button onClick={() => setAddingDiscToModId(null)} className="px-3 py-2 bg-white border border-slate-200 text-slate-500 rounded-xl hover:bg-slate-200 text-xs font-bold uppercase">
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button 
                      onClick={() => setAddingDiscToModId(modulo.id)}
                      className={`w-full py-2 border border-dashed border-slate-300 rounded-xl text-slate-400 text-xs font-bold uppercase ${config.hoverBorderColor} ${config.textColor} ${config.hoverBgColor} transition-all flex items-center justify-center gap-2`}
                    >
                      <Plus size={14} /> Nova {config.labelDisciplina} neste Módulo
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
              placeholder="Nome do Novo Módulo (Ex: Módulo III)"
              className="w-64 px-4 py-2 rounded-xl border border-slate-200 outline-none focus:border-blue-500 text-sm bg-white"
              value={newModuloName}
              onChange={(e) => setNewModuloName(e.target.value)}
            />
            <button onClick={handleAddModulo} className="px-4 py-2 bg-[#001a33] text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-blue-900 transition-colors">
              <Plus size={14} /> Criar Módulo
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CursoGradeCurricularDetails;
