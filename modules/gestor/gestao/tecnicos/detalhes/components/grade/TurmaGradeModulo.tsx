import React from 'react';
import { BookOpen, ChevronDown, ChevronRight, Layers } from 'lucide-react';
import { Modulo } from '../../../../../cadastros/cadastros.types';
import {
  TurmaAtividadeExtraClasse,
  TurmaAulaPlanejada,
  TurmaAulaUpdateInput,
  TurmaDisciplinaConfig,
} from '../../turma-grade.types';
import TurmaGradeDisciplina from './TurmaGradeDisciplina';
import { TurmaGradeTheme } from './turma-grade-ui';

interface TurmaGradeModuloProps {
  modulo: Modulo;
  metricasGrade: any[];
  disciplinasConfig: Record<string, TurmaDisciplinaConfig>;
  aulas: Record<string, TurmaAulaPlanejada[]>;
  atividades: Record<string, TurmaAtividadeExtraClasse[]>;
  expanded: boolean;
  expandedDisciplines: Set<string>;
  singleProfessor: boolean;
  theme: TurmaGradeTheme;
  savingAulaDisciplinaId?: string;
  savingAtividadeDisciplinaId?: string;
  updatingAulaId?: string;
  titulos: Record<string, string>;
  datas: Record<string, string>;
  horas: Record<string, string>;
  horasInicio: Record<string, string>;
  horasFim: Record<string, string>;
  extrasClasse: Record<string, boolean>;
  onToggleModulo: () => void;
  onToggleDisciplina: (disciplinaId: string) => void;
  onToggleConcluida: (disciplinaId: string) => void;
  onOpenProfessor: (disciplinaId: string) => void;
  onDeleteAula: (disciplinaId: string, aulaId: string) => void;
  onUpdateAula: (input: TurmaAulaUpdateInput) => Promise<void>;
  onTituloChange: (disciplinaId: string, value: string) => void;
  onDataChange: (disciplinaId: string, value: string) => void;
  onHorasChange: (disciplinaId: string, value: string) => void;
  onHoraInicioChange: (disciplinaId: string, value: string) => void;
  onHoraFimChange: (disciplinaId: string, value: string) => void;
  onExtraClasseChange: (disciplinaId: string, value: boolean) => void;
  onAddPlanejamento: (disciplinaId: string) => void;
}

const TurmaGradeModulo: React.FC<TurmaGradeModuloProps> = ({
  modulo,
  metricasGrade,
  disciplinasConfig,
  aulas,
  atividades,
  expanded,
  expandedDisciplines,
  singleProfessor,
  theme,
  savingAulaDisciplinaId,
  savingAtividadeDisciplinaId,
  updatingAulaId,
  titulos,
  datas,
  horas,
  horasInicio,
  horasFim,
  extrasClasse,
  onToggleModulo,
  onToggleDisciplina,
  onToggleConcluida,
  onOpenProfessor,
  onDeleteAula,
  onUpdateAula,
  onTituloChange,
  onDataChange,
  onHorasChange,
  onHoraInicioChange,
  onHoraFimChange,
  onExtraClasseChange,
  onAddPlanejamento,
}) => {
  const moduloMetricas = metricasGrade.find((item) => item.modulo_id === modulo.id);
  const totalDiscs = Number(moduloMetricas?.modulo_total_disciplinas || modulo.disciplinas.length);
  const moduloProgress = Number(moduloMetricas?.modulo_progresso_percent || 0);

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
      <button
        onClick={onToggleModulo}
        className="w-full flex items-center justify-between p-5 bg-slate-50/50 hover:bg-slate-100/50 transition-colors"
      >
        <div className="flex items-center gap-4 flex-1">
          <div className={`p-3 shadow-sm ${theme.bg} ${theme.text} border ${theme.border} rounded-xl flex shrink-0`}>
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
                    <div
                      className={`h-full rounded-full ${moduloProgress === 100 ? theme.fill : 'bg-blue-500'}`}
                      style={{ width: `${moduloProgress}%` }}
                    />
                  </div>
                  <span className={`text-[10px] font-black ${moduloProgress === 100 ? theme.text : 'text-blue-600'}`}>
                    {moduloProgress}%
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="pl-4">
          {expanded
            ? <ChevronDown size={20} className="text-slate-400" />
            : <ChevronRight size={20} className="text-slate-400" />}
        </div>
      </button>

      <div className={`grid transition-all duration-300 ease-in-out ${expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="overflow-hidden">
          <div className="border-t border-slate-100 divide-y divide-slate-100 bg-white">
            {modulo.disciplinas.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400 font-medium">
                Sem disciplinas cadastradas neste módulo.
              </div>
            ) : modulo.disciplinas.map((disciplina) => (
              <TurmaGradeDisciplina
                key={disciplina.id}
                disciplina={disciplina}
                config={disciplinasConfig[disciplina.id] || { professor: null, concluida: false }}
                aulas={aulas[disciplina.id] || []}
                atividades={atividades[disciplina.id] || []}
                metricas={metricasGrade.find((item) => item.disciplina_id === disciplina.id)}
                theme={theme}
                singleProfessor={singleProfessor}
                isExpanded={expandedDisciplines.has(disciplina.id)}
                isSaving={savingAulaDisciplinaId === disciplina.id || savingAtividadeDisciplinaId === disciplina.id}
                updatingAulaId={updatingAulaId}
                titulo={titulos[disciplina.id] || ''}
                data={datas[disciplina.id] || ''}
                horas={horas[disciplina.id] || ''}
                horaInicio={horasInicio[disciplina.id] || ''}
                horaFim={horasFim[disciplina.id] || ''}
                isExtraClasse={Boolean(extrasClasse[disciplina.id])}
                onToggle={() => onToggleDisciplina(disciplina.id)}
                onToggleConcluida={() => onToggleConcluida(disciplina.id)}
                onOpenProfessor={() => onOpenProfessor(disciplina.id)}
                onDeleteAula={(aulaId) => onDeleteAula(disciplina.id, aulaId)}
                onUpdateAula={onUpdateAula}
                onTituloChange={(value) => onTituloChange(disciplina.id, value)}
                onDataChange={(value) => onDataChange(disciplina.id, value)}
                onHorasChange={(value) => onHorasChange(disciplina.id, value)}
                onHoraInicioChange={(value) => onHoraInicioChange(disciplina.id, value)}
                onHoraFimChange={(value) => onHoraFimChange(disciplina.id, value)}
                onExtraClasseChange={(value) => onExtraClasseChange(disciplina.id, value)}
                onAddPlanejamento={() => onAddPlanejamento(disciplina.id)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TurmaGradeModulo;
