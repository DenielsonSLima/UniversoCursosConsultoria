import React from 'react';
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  CornerDownRight,
  Loader2,
  Save,
  Trash2,
  UserCheck,
  UserPlus,
} from 'lucide-react';
import { Disciplina } from '../../../../../cadastros/cadastros.types';
import {
  TurmaAtividadeExtraClasse,
  TurmaAulaPlanejada,
  TurmaDisciplinaConfig,
} from '../../turma-grade.types';
import { formatGradeHours, TurmaGradeTheme } from './turma-grade-ui';

interface TurmaGradeDisciplinaProps {
  disciplina: Disciplina;
  config: TurmaDisciplinaConfig;
  aulas: TurmaAulaPlanejada[];
  atividades: TurmaAtividadeExtraClasse[];
  metricas?: any;
  theme: TurmaGradeTheme;
  singleProfessor: boolean;
  isExpanded: boolean;
  isSaving: boolean;
  titulo: string;
  data: string;
  horas: string;
  isExtraClasse: boolean;
  onToggle: () => void;
  onToggleConcluida: () => void;
  onOpenProfessor: () => void;
  onDeleteAula: (aulaId: string) => void;
  onTituloChange: (value: string) => void;
  onDataChange: (value: string) => void;
  onHorasChange: (value: string) => void;
  onExtraClasseChange: (value: boolean) => void;
  onAddPlanejamento: () => void;
}

const TurmaGradeDisciplina: React.FC<TurmaGradeDisciplinaProps> = ({
  disciplina,
  config,
  aulas,
  atividades,
  metricas,
  theme,
  singleProfessor,
  isExpanded,
  isSaving,
  titulo,
  data,
  horas,
  isExtraClasse,
  onToggle,
  onToggleConcluida,
  onOpenProfessor,
  onDeleteAula,
  onTituloChange,
  onDataChange,
  onHorasChange,
  onExtraClasseChange,
  onAddPlanejamento,
}) => {
  const sumHorasAulas = aulas.reduce((total, aula) => total + Number(aula.cargaHoraria || 0), 0);
  const sumHorasAtividades = atividades.reduce(
    (total, atividade) => total + Number(atividade.cargaHoraria || 0),
    0,
  );
  const sumHoras = sumHorasAulas + sumHorasAtividades;
  const aulasCount = Number(metricas?.aulas_count || aulas.length);
  const progressoDisciplina = disciplina.cargaHoraria > 0
    ? Math.min(100, Math.round((sumHoras / disciplina.cargaHoraria) * 100))
    : 0;
  const horasStatus = sumHoras === disciplina.cargaHoraria
    ? 'EXATA'
    : sumHoras > disciplina.cargaHoraria
      ? 'EXCESSO'
      : 'PENDENTE';
  const horasDiferenca = Math.abs(disciplina.cargaHoraria - sumHoras);
  const isComplete = config.concluida;
  const progressColor = horasStatus === 'EXATA'
    ? theme.fill
    : horasStatus === 'EXCESSO'
      ? 'bg-red-500'
      : 'bg-blue-500';
  const progressTextClass = horasStatus === 'EXATA'
    ? theme.text
    : horasStatus === 'EXCESSO'
      ? 'text-red-600'
      : 'text-blue-600';

  return (
    <div className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/30 transition-colors">
      <div className="p-4 sm:px-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <button
            onClick={onToggleConcluida}
            title={isComplete ? 'Marcar como não concluída' : 'Marcar como concluída'}
            className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 cursor-pointer transition-colors ${isComplete ? `${theme.bg} ${theme.text} hover:bg-opacity-80` : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
          >
            {isComplete ? <CheckCircle2 size={16} /> : <BookOpen size={16} />}
          </button>

          <div onClick={onToggle} className="flex-1 min-w-0 cursor-pointer text-left">
            <div className="flex items-center gap-2">
              <p className={`text-sm font-bold truncate ${isComplete ? theme.textDark : 'text-[#001a33]'}`}>
                {disciplina.nome}
              </p>
              {isExpanded
                ? <ChevronDown size={14} className="text-slate-400 shrink-0" />
                : <ChevronRight size={14} className="text-slate-400 shrink-0" />}
            </div>
            <p className="text-[11px] text-slate-500 font-medium mt-0.5">
              {disciplina.cargaHoraria} horas oficiais • {aulasCount} aulas ({formatGradeHours(sumHorasAulas)}h)
              {atividades.length > 0
                ? ` + ${atividades.length} extra-classe (${formatGradeHours(sumHorasAtividades)}h)`
                : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <div onClick={onToggle} className="cursor-pointer flex flex-col items-end shrink-0">
            <span className={`text-[10px] font-black uppercase tracking-wider ${progressTextClass}`}>
              {formatGradeHours(sumHoras)}h de {formatGradeHours(disciplina.cargaHoraria)}h
            </span>
            <div className="w-20 h-1 bg-slate-200 rounded-full overflow-hidden mt-1">
              <div className={`h-full rounded-full ${progressColor}`} style={{ width: `${progressoDisciplina}%` }} />
            </div>
          </div>

          {singleProfessor ? (
            config.professor ? (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 rounded-lg border border-indigo-100">
                <UserCheck size={14} className="text-indigo-600" />
                <div className="flex flex-col">
                  <span className="text-[9px] text-indigo-400 uppercase font-black tracking-widest text-left">Docente</span>
                  <span className="text-xs font-bold text-indigo-900">{config.professor}</span>
                </div>
              </div>
            ) : <span className="text-xs text-slate-400 italic font-semibold">Sem docente</span>
          ) : config.professor ? (
            <div
              onClick={onOpenProfessor}
              className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 rounded-lg border border-indigo-100 cursor-pointer hover:bg-indigo-100 transition-colors"
              title="Alterar Docente"
            >
              <UserCheck size={14} className="text-indigo-600" />
              <div className="flex flex-col">
                <span className="text-[9px] text-indigo-400 uppercase font-black tracking-widest text-left">Docente</span>
                <span className="text-xs font-bold text-indigo-900">{config.professor}</span>
              </div>
              <ChevronDown size={14} className="text-indigo-300 ml-1" />
            </div>
          ) : (
            <button
              onClick={onOpenProfessor}
              className={`flex items-center gap-2 px-4 py-2 bg-slate-50 border border-dashed border-slate-300 rounded-lg text-slate-500 hover:${theme.text} hover:${theme.hoverBorder} hover:${theme.bg} transition-all text-xs font-bold uppercase tracking-wide`}
            >
              <UserPlus size={14} /> Atribuir Docente
            </button>
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="px-6 pb-6 pt-2 border-t border-slate-50 bg-slate-50/5 animate-slideDown">
          <div className="flex items-center justify-between gap-4 mb-4 bg-white p-3 rounded-2xl border border-slate-100 shadow-inner">
            <span className="text-xs font-bold text-slate-500">Planejamento das Aulas:</span>
            <div className="flex items-center gap-2">
              {horasStatus === 'EXATA' ? (
                <span className={`${theme.bg} ${theme.text} text-[10px] font-bold px-2.5 py-1 rounded-lg border ${theme.border} uppercase tracking-wider flex items-center gap-1`}>
                  <CheckCircle2 size={12} /> Grade Concluída e Exata
                </span>
              ) : horasStatus === 'EXCESSO' ? (
                <span className="bg-red-50 text-red-600 text-[10px] font-bold px-2.5 py-1 rounded-lg border border-red-100 uppercase tracking-wider flex items-center gap-1">
                  Excesso de {formatGradeHours(horasDiferenca)}h!
                </span>
              ) : (
                <span className="bg-amber-50 text-amber-600 text-[10px] font-bold px-2.5 py-1 rounded-lg border border-amber-100 uppercase tracking-wider flex items-center gap-1">
                  Faltam {formatGradeHours(horasDiferenca)}h para completar a grade
                </span>
              )}
            </div>
          </div>

          <div className="space-y-2 mb-4 pl-4">
            {aulas.length === 0 && atividades.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-2">
                Nenhuma aula ou atividade extra-classe cadastrada nesta turma ainda.
              </p>
            ) : (
              <>
                {aulas.map((aula, index) => (
                  <div key={aula.id} className={`flex items-center justify-between group pl-4 border-l-2 border-slate-200 ${theme.hoverBorderDark} transition-colors py-1.5 bg-white pr-3 rounded-r-xl border-y border-r border-slate-100 shadow-sm`}>
                    <div className="flex items-center gap-2 text-sm text-slate-700 min-w-0">
                      <CornerDownRight size={12} className="text-slate-400 shrink-0" />
                      <span className="font-semibold text-xs text-slate-500 shrink-0">
                        Aula {index + 1} {aula.dataAula ? `(${new Date(`${aula.dataAula}T00:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })})` : ''}:
                      </span>
                      <span className="truncate text-slate-600">{aula.titulo}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-[10px] font-mono font-bold text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                        {formatGradeHours(aula.cargaHoraria)}h
                      </span>
                      <button
                        onClick={() => onDeleteAula(aula.id)}
                        className="text-slate-300 hover:text-red-500 transition-colors cursor-pointer"
                        title="Excluir aula"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
                {atividades.map((atividade, index) => (
                  <div key={atividade.id} className="flex items-center justify-between group pl-4 border-l-2 border-emerald-300 transition-colors py-1.5 bg-emerald-50/60 pr-3 rounded-r-xl border-y border-r border-emerald-100 shadow-sm">
                    <div className="flex items-center gap-2 text-sm text-slate-700 min-w-0">
                      <ClipboardCheck size={12} className="text-emerald-600 shrink-0" />
                      <span className="font-semibold text-xs text-emerald-700 shrink-0">
                        Extra {index + 1} {atividade.prazoEntrega ? `(${new Date(`${atividade.prazoEntrega}T00:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })})` : ''}:
                      </span>
                      <span className="truncate text-slate-600">{atividade.titulo}</span>
                    </div>
                    <span className="text-[10px] font-mono font-bold text-emerald-700 bg-white px-2 py-0.5 rounded border border-emerald-100">
                      {formatGradeHours(atividade.cargaHoraria)}h
                    </span>
                  </div>
                ))}
              </>
            )}
          </div>

          <div className="mt-3 pl-4 flex gap-2 items-center flex-wrap sm:flex-nowrap">
            <CornerDownRight size={14} className={`${theme.text} shrink-0`} />
            <label
              className={`flex min-h-[38px] shrink-0 cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-widest transition-colors ${isExtraClasse ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-500 hover:border-emerald-200 hover:text-emerald-700'}`}
              title="Marcar como atividade extra-classe para os alunos responderem no portal"
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={isExtraClasse}
                onChange={(event) => onExtraClasseChange(event.target.checked)}
              />
              <ClipboardCheck size={14} /> {isExtraClasse ? 'Extra-classe ativa' : 'Marcar extra-classe'}
            </label>
            <input
              type="text"
              placeholder={isExtraClasse ? 'Tema da atividade extra-classe...' : 'Título da aula / conteúdo...'}
              className={`flex-1 text-xs bg-white border border-slate-200 rounded-xl outline-none ${theme.focusBorder} px-3 py-2.5 transition-colors font-medium text-slate-700 placeholder-slate-400 min-w-[150px]`}
              value={titulo}
              onChange={(event) => onTituloChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') document.getElementById(`turma-data-input-${disciplina.id}`)?.focus();
              }}
            />
            <input
              id={`turma-data-input-${disciplina.id}`}
              type="date"
              className={`w-36 text-xs bg-white border border-slate-200 rounded-xl outline-none ${theme.focusBorder} px-3 py-2.5 transition-colors font-medium text-slate-700`}
              value={data}
              onChange={(event) => onDataChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') document.getElementById(`turma-horas-input-${disciplina.id}`)?.focus();
              }}
            />
            <input
              id={`turma-horas-input-${disciplina.id}`}
              type="number"
              placeholder="Hrs"
              className={`w-16 text-xs bg-white border border-slate-200 rounded-xl outline-none ${theme.focusBorder} px-2 py-2.5 transition-colors text-center font-bold text-slate-700 placeholder-slate-400`}
              value={horas}
              onChange={(event) => onHorasChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') onAddPlanejamento();
              }}
            />
            <button
              type="button"
              onClick={onAddPlanejamento}
              className={`min-h-[38px] px-4 py-2.5 ${theme.bg} ${theme.text} rounded-xl ${theme.hoverBg} hover:text-white transition-colors border ${theme.border} flex items-center justify-center gap-2 shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-[10px] font-black uppercase tracking-widest`}
              disabled={isSaving || !titulo.trim() || !horas.trim() || !data.trim()}
              aria-label={isExtraClasse ? 'Criar atividade extra-classe' : 'Salvar aula'}
            >
              {isSaving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              {isExtraClasse ? 'Criar atividade' : 'Salvar aula'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TurmaGradeDisciplina;
