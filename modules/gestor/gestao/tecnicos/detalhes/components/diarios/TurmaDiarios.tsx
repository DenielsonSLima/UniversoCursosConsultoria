import React, { useState } from 'react';
import { Layers, BookOpen, Loader2 } from 'lucide-react';
import DiarioClasse from './DiarioClasse';
import { Turma } from '../../../../gestao.types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { academicLifecycleService } from '../../academic-lifecycle.service';
import { academicLifecycleKeys } from '../../academic-lifecycle.keys';

interface Disciplina {
  id: string;
  nome: string;
  professor: string;
  horasRealizadas: number;
  cargaHoraria: number;
  progressoPercent: number;
  periodoStatus: string;
  concluida: boolean;
}

interface Modulo {
  id: string;
  nome: string;
  disciplinas: Disciplina[];
}

interface TurmaDiariosProps {
  turma: Turma;
}

const TurmaDiarios: React.FC<TurmaDiariosProps> = ({ turma }) => {
  const [activeModuloNome, setActiveModuloNome] = useState('');
  const [activeDisciplina, setActiveDisciplina] = useState<Disciplina | null>(null);
  const queryClient = useQueryClient();

  const { data: modulosData = [], isLoading: loading } = useQuery<Modulo[]>({
    queryKey: [...academicLifecycleKeys.diarios(turma.id), 'normalized-v2'],
    queryFn: async () => {
      const rows = await academicLifecycleService.getDiarios(turma.id);
      const grouped = new Map<string, Modulo>();
      rows.forEach((row: any) => {
        if (!grouped.has(row.modulo_id)) {
          grouped.set(row.modulo_id, {
            id: row.modulo_id,
            nome: row.modulo_nome,
            disciplinas: [],
          });
        }
        grouped.get(row.modulo_id)!.disciplinas.push({
          id: row.disciplina_id,
          nome: row.disciplina_nome,
          professor: row.professor_nome,
          horasRealizadas: Number(row.horas_realizadas),
          cargaHoraria: Number(row.carga_horaria),
          progressoPercent: Number(row.progresso_percent),
          periodoStatus: row.periodo_status,
          concluida: row.concluida,
        });
      });
      return Array.from(grouped.values());
    }
  });
  const modulos = (Array.isArray(modulosData) ? modulosData : []).map((modulo) => ({
    ...modulo,
    disciplinas: Array.isArray(modulo?.disciplinas) ? modulo.disciplinas : [],
  }));

  const handleOpenDiario = (disciplina: Disciplina, moduloNome: string) => {
    setActiveModuloNome(moduloNome);
    setActiveDisciplina(disciplina);
  };

  const handleBack = () => {
    setActiveDisciplina(null);
    queryClient.invalidateQueries({ queryKey: academicLifecycleKeys.diarios(turma.id) });
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="animate-spin text-[#001a33]" size={32} />
        <span className="text-slate-500 font-bold ml-3">Carregando diários de classe...</span>
      </div>
    );
  }

  if (activeDisciplina) {
    return <DiarioClasse disciplina={activeDisciplina} moduloNome={activeModuloNome} turma={turma} onBack={handleBack} />;
  }

  return (
    <div className="animate-fadeIn">
      <div className="mb-6">
        <h3 className="text-lg font-bold text-[#001a33] mb-1">Diários de Classe</h3>
        <p className="text-slate-500 text-xs">Gerencie a frequência, notas e conteúdos programáticos das disciplinas.</p>
      </div>

      {modulos.length === 0 || !modulos.some(m => m.disciplinas.length > 0) ? (
        <div className="py-20 text-center text-slate-400 bg-white border border-slate-100 rounded-[2rem] shadow-sm flex flex-col items-center">
          <BookOpen size={48} className="mb-4 opacity-50 text-slate-300" />
          <p className="font-bold text-sm">Nenhuma disciplina cadastrada na grade deste curso.</p>
          <p className="text-xs text-slate-500 mt-1 max-w-sm">Configure a grade curricular do curso na aba de Cadastros para listar os diários aqui.</p>
        </div>
      ) : (
        <div className="space-y-10">
          {modulos.map((modulo) => {
            if (modulo.disciplinas.length === 0) return null;
            return (
              <div key={modulo.id} className="animate-fadeIn">
                <div className="flex items-center gap-3 mb-5 px-2">
                  <div className="p-2 bg-slate-200/50 text-slate-500 rounded-lg">
                    <Layers size={16} />
                  </div>
                  <h4 className="font-bold text-slate-700 text-sm uppercase tracking-widest">{modulo.nome}</h4>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {modulo.disciplinas.map(disc => {
                    return (
                      <div key={disc.id} className="bg-white rounded-[2rem] p-6 border border-slate-100 shadow-sm hover:shadow-xl hover:shadow-indigo-500/5 transition-all flex flex-col group">
                        <div className="flex justify-between items-start mb-4">
                          <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-500 flex items-center justify-center shrink-0 group-hover:scale-110 group-hover:bg-indigo-500 group-hover:text-white transition-all duration-300">
                            <BookOpen size={24} />
                          </div>
                          <span className="px-3 py-1 bg-slate-50 text-slate-500 rounded-lg text-[10px] font-bold uppercase tracking-wider border border-slate-100">
                            {disc.horasRealizadas}H / {disc.cargaHoraria}H Realizadas
                          </span>
                        </div>

                        <h5 className="font-black text-[#001a33] text-lg mb-1 leading-tight">{disc.nome}</h5>
                        <p className="text-sm font-medium text-slate-500 mb-6">
                          Docente: <span className={`font-bold ${disc.professor === 'Não atribuído' ? 'text-rose-500' : 'text-slate-700'}`}>{disc.professor}</span>
                        </p>

                        <div className="mt-auto space-y-3">
                          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-1000 ${disc.horasRealizadas > disc.cargaHoraria ? 'bg-rose-500' : 'bg-indigo-500'}`}
                              style={{ width: `${disc.progressoPercent}%` }}
                            ></div>
                          </div>

                          <div className="flex pt-4">
                            <button
                              onClick={() => handleOpenDiario(disc, modulo.nome)}
                              className={`w-full py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-2 shadow-lg ${
                                disc.periodoStatus === 'FECHADO'
                                  ? 'bg-slate-100 text-slate-600 hover:bg-slate-200 shadow-none'
                                  : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-600/20'
                              }`}
                            >
                              <BookOpen size={14} /> {disc.periodoStatus === 'FECHADO' ? 'Ver diário fechado' : 'Acessar Diário'}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TurmaDiarios;
