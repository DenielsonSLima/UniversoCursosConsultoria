import React from 'react';
import { BookOpen, Layers, Loader2, Plus, Trash2 } from 'lucide-react';
import { Curso, Modulo } from '../cadastros.types';
import { getModalidadeConfig } from './cursoGradeCurricular.helpers';

interface CursoGradeTabProps {
  curso: Curso;
  config: ReturnType<typeof getModalidadeConfig>;
  modulos: Modulo[];
  loading: boolean;
  newModuloName: string;
  addingDiscToModId: string | null;
  newDiscName: string;
  newDiscHoras: string;
  newDiscTeoria: string;
  newDiscPratica: string;
  newDiscEstagio: string;
  newDiscDesc: string;
  setModulos: React.Dispatch<React.SetStateAction<Modulo[]>>;
  setNewModuloName: React.Dispatch<React.SetStateAction<string>>;
  setAddingDiscToModId: React.Dispatch<React.SetStateAction<string | null>>;
  setNewDiscName: React.Dispatch<React.SetStateAction<string>>;
  setNewDiscHoras: React.Dispatch<React.SetStateAction<string>>;
  setNewDiscTeoria: React.Dispatch<React.SetStateAction<string>>;
  setNewDiscPratica: React.Dispatch<React.SetStateAction<string>>;
  setNewDiscEstagio: React.Dispatch<React.SetStateAction<string>>;
  setNewDiscDesc: React.Dispatch<React.SetStateAction<string>>;
  onAddModulo: () => void;
  onRemoveModulo: (moduloId: string) => void;
  onAddDisciplina: (moduloId: string) => void;
  onRemoveDisciplina: (moduloId: string, disciplinaId: string) => void;
}

const CursoGradeTab: React.FC<CursoGradeTabProps> = ({
  curso,
  config,
  modulos,
  loading,
  newModuloName,
  addingDiscToModId,
  newDiscName,
  newDiscHoras,
  newDiscTeoria,
  newDiscPratica,
  newDiscEstagio,
  newDiscDesc,
  setModulos,
  setNewModuloName,
  setAddingDiscToModId,
  setNewDiscName,
  setNewDiscHoras,
  setNewDiscTeoria,
  setNewDiscPratica,
  setNewDiscEstagio,
  setNewDiscDesc,
  onAddModulo,
  onRemoveModulo,
  onAddDisciplina,
  onRemoveDisciplina
}) => {
  if (loading) {
    return (
      <div className="flex justify-center items-center py-20 flex-1">
        <Loader2 className="animate-spin text-blue-600" size={32} />
      </div>
    );
  }

  const updateTechnicalHours = (
    moduloId: string,
    disciplinaId: string,
    field: 'cargaHorariaTeoria' | 'cargaHorariaPratica' | 'cargaHorariaEstagio',
    value: number
  ) => {
    setModulos(prev => prev.map(modulo => {
      if (modulo.id !== moduloId) return modulo;
      return {
        ...modulo,
        disciplinas: modulo.disciplinas.map(disciplina => {
          if (disciplina.id !== disciplinaId) return disciplina;
          const next = { ...disciplina, [field]: value };
          return {
            ...next,
            cargaHoraria: (next.cargaHorariaTeoria || 0) + (next.cargaHorariaPratica || 0) + (next.cargaHorariaEstagio || 0)
          };
        })
      };
    }));
  };

  const updateHours = (moduloId: string, disciplinaId: string, value: number) => {
    setModulos(prev => prev.map(modulo => modulo.id === moduloId
      ? {
          ...modulo,
          disciplinas: modulo.disciplinas.map(disciplina => disciplina.id === disciplinaId
            ? { ...disciplina, cargaHoraria: value }
            : disciplina)
        }
      : modulo));
  };

  return (
    <div className="flex-grow overflow-y-auto pr-2 custom-scrollbar space-y-8 pb-20">
      {modulos.map(modulo => (
        <div key={modulo.id} className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden animate-fadeIn">
          <div className={`${config.bgColor} px-6 py-4 border-b border-slate-100 flex justify-between items-center`}>
            <div className="flex items-center gap-3">
              <div className={`p-2 bg-white rounded-lg ${config.textColor} border border-slate-100 shadow-sm`}><Layers size={18} /></div>
              <div>
                <h4 className="font-bold text-[#001a33]">{modulo.nome}</h4>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                  {modulo.disciplinas.length} {modulo.disciplinas.length === 1 ? config.labelDisciplina : config.labelDisciplina + 's'} • {modulo.disciplinas.reduce((acc, disciplina) => acc + disciplina.cargaHoraria, 0)}h Totais
                </p>
              </div>
            </div>
            <button onClick={() => onRemoveModulo(modulo.id)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={16} /></button>
          </div>

          <div className="p-4 space-y-4">
            {modulo.disciplinas.length === 0 && (
              <div className="text-center py-6 text-slate-400 text-xs uppercase">Nenhuma {config.labelDisciplina.toLowerCase()} neste módulo</div>
            )}

            {modulo.disciplinas.map(disciplina => (
              <div key={disciplina.id} className="border border-slate-100 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow bg-slate-50/30">
                <div className="px-5 py-4 flex justify-between items-center">
                  <div className="flex flex-col text-slate-700">
                    <div className="flex items-center gap-2"><BookOpen size={16} className={config.textColor} /><span className="font-bold text-sm">{disciplina.nome}</span></div>
                    {curso.modalidade === 'TECNICO' && (
                      <div className="flex items-center gap-3 text-[10px] text-slate-500 font-bold uppercase tracking-wider pl-6 mt-1.5">
                        <span>Teoria: <strong className="text-slate-700">{disciplina.cargaHorariaTeoria || 0}h</strong></span><span>•</span>
                        <span>Prática: <strong className="text-slate-700">{disciplina.cargaHorariaPratica || 0}h</strong></span><span>•</span>
                        <span>Estágio: <strong className="text-slate-700">{disciplina.cargaHorariaEstagio || 0}h</strong></span>
                      </div>
                    )}
                    {disciplina.descricao && <p className="text-xs text-slate-400 font-medium pl-6 mt-1">{disciplina.descricao}</p>}
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5">
                      {curso.modalidade === 'TECNICO' ? (
                        <div className="flex items-center gap-3 bg-white px-3 py-1.5 rounded-2xl border border-slate-200 shadow-sm">
                          {([
                            ['T', 'Teoria', 'cargaHorariaTeoria'],
                            ['P', 'Prática', 'cargaHorariaPratica'],
                            ['E', 'Estágio', 'cargaHorariaEstagio']
                          ] as const).map(([shortLabel, title, field]) => (
                            <React.Fragment key={field}>
                              <div className="flex flex-col items-center">
                                <span className="text-[9px] font-black text-slate-400 select-none">{shortLabel}</span>
                                <input type="number" title={title} className="w-10 text-center text-xs font-black text-[#001a33] outline-none" value={disciplina[field] || 0} onChange={(event) => updateTechnicalHours(modulo.id, disciplina.id, field, parseInt(event.target.value) || 0)} />
                              </div>
                              <span className="text-slate-300 font-bold select-none">|</span>
                            </React.Fragment>
                          ))}
                          <div className="flex flex-col items-center bg-[#001a33] text-white px-2 py-0.5 rounded-lg select-none">
                            <span className="text-[7px] font-black uppercase tracking-widest text-slate-300">Total</span>
                            <span className="text-xs font-black">{disciplina.cargaHoraria || 0}h</span>
                          </div>
                        </div>
                      ) : (
                        <>
                          <input type="number" title="Carga Horária" className="w-16 text-center text-xs font-bold text-[#001a33] bg-white px-2.5 py-1.5 rounded-xl border border-slate-200 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" value={disciplina.cargaHoraria || 0} onChange={(event) => updateHours(modulo.id, disciplina.id, parseInt(event.target.value) || 0)} />
                          <span className="text-xs font-bold text-slate-400">h</span>
                        </>
                      )}
                    </div>
                    <button onClick={() => onRemoveDisciplina(modulo.id, disciplina.id)} className="text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={14} /></button>
                  </div>
                </div>
              </div>
            ))}

            <div className="mt-4 pt-4 border-t border-slate-100 border-dashed">
              {addingDiscToModId === modulo.id ? (
                <div className="flex flex-col gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                  <div className="flex flex-col sm:flex-row gap-3">
                    <input autoFocus type="text" placeholder={`Nome da Nova ${config.labelDisciplina} *`} className="flex-grow px-4 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-100 text-sm font-bold animate-fadeIn" value={newDiscName} onChange={(event) => setNewDiscName(event.target.value)} />
                    {curso.modalidade === 'TECNICO' ? (
                      <div className="flex gap-2">
                        <input type="number" placeholder="Teoria (T) *" className="w-24 px-3 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-100 text-xs font-bold text-center" value={newDiscTeoria} onChange={(event) => setNewDiscTeoria(event.target.value)} />
                        <input type="number" placeholder="Prática (P) *" className="w-24 px-3 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-100 text-xs font-bold text-center" value={newDiscPratica} onChange={(event) => setNewDiscPratica(event.target.value)} />
                        <input type="number" placeholder="Estágio (E) *" className="w-24 px-3 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-100 text-xs font-bold text-center" value={newDiscEstagio} onChange={(event) => setNewDiscEstagio(event.target.value)} />
                      </div>
                    ) : (
                      <input type="number" placeholder="Horas *" className="w-24 px-4 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-100 text-sm font-bold text-center" value={newDiscHoras} onChange={(event) => setNewDiscHoras(event.target.value)} />
                    )}
                  </div>
                  <input type="text" placeholder={`Descrição da ${config.labelDisciplina} (Opcional)`} className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-100 text-sm" value={newDiscDesc} onChange={(event) => setNewDiscDesc(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') onAddDisciplina(modulo.id); }} />
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => onAddDisciplina(modulo.id)} className="px-4 py-2 bg-[#001a33] text-white rounded-xl text-xs font-bold uppercase hover:bg-blue-900">Adicionar</button>
                    <button onClick={() => setAddingDiscToModId(null)} className="px-3 py-2 bg-white border border-slate-200 text-slate-500 rounded-xl hover:bg-slate-200 text-xs font-bold uppercase">Cancelar</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setAddingDiscToModId(modulo.id)} className={`w-full py-2 border border-dashed border-slate-300 rounded-xl text-slate-400 text-xs font-bold uppercase ${config.hoverBorderColor} ${config.textColor} ${config.hoverBgColor} transition-all flex items-center justify-center gap-2`}>
                  <Plus size={14} /> Nova {config.labelDisciplina} neste Módulo
                </button>
              )}
            </div>
          </div>
        </div>
      ))}

      <div className="bg-slate-50 rounded-[2rem] border-2 border-dashed border-slate-200 p-6 flex items-center justify-center gap-3">
        <input type="text" placeholder="Nome do Novo Módulo (Ex: Módulo III)" className="w-64 px-4 py-2 rounded-xl border border-slate-200 outline-none focus:border-blue-500 text-sm bg-white" value={newModuloName} onChange={(event) => setNewModuloName(event.target.value)} />
        <button onClick={onAddModulo} className="px-4 py-2 bg-[#001a33] text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-blue-900 transition-colors"><Plus size={14} /> Criar Módulo</button>
      </div>
    </div>
  );
};

export default CursoGradeTab;
