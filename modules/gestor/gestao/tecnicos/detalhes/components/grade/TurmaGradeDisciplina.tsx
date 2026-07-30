import React, { useState } from 'react';
import {
  BookOpen,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  CornerDownRight,
  Loader2,
  Pencil,
  Save,
  Trash2,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react';
import { Disciplina } from '../../../../../cadastros/cadastros.types';
import {
  TurmaAtividadeExtraClasse,
  TurmaAulaPlanejada,
  TurmaAulaUpdateInput,
  TurmaDisciplinaConfig,
} from '../../turma-grade.types';
import { isAcademicClassContentPending } from '../../../../../../../lib/academicClassMeetings';
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
  updatingAulaId?: string;
  titulo: string;
  data: string;
  horas: string;
  isExtraClasse: boolean;
  onToggle: () => void;
  onToggleConcluida: () => void;
  onOpenProfessor: () => void;
  onDeleteAula: (aulaId: string) => void;
  onUpdateAula: (input: TurmaAulaUpdateInput) => Promise<void>;
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
  updatingAulaId,
  titulo,
  data,
  horas,
  isExtraClasse,
  onToggle,
  onToggleConcluida,
  onOpenProfessor,
  onDeleteAula,
  onUpdateAula,
  onTituloChange,
  onDataChange,
  onHorasChange,
  onExtraClasseChange,
  onAddPlanejamento,
}) => {
  const [editingAulaId, setEditingAulaId] = useState<string | null>(null);
  const [editingData, setEditingData] = useState('');
  const [editingHoras, setEditingHoras] = useState('');
  const cargaHoraria = Number(metricas?.carga_horaria ?? disciplina.cargaHoraria ?? 0);
  const horasRealizadas = Number(metricas?.horas_realizadas ?? 0);
  const aulasCount = Number(metricas?.aulas_count ?? 0);
  const progressoDisciplina = Number(metricas?.progresso_percent ?? 0);
  const horasStatus = String(metricas?.horas_status ?? 'PENDENTE');
  const horasDiferenca = Number(metricas?.horas_diferenca ?? cargaHoraria);
  const isComplete = Boolean(metricas?.concluida ?? config.concluida);
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

  const startEditingAula = (aula: TurmaAulaPlanejada) => {
    setEditingAulaId(aula.id);
    setEditingData(aula.dataAula || '');
    setEditingHoras(String(aula.cargaHoraria).replace('.', ','));
  };

  const resetEditingAula = () => {
    setEditingAulaId(null);
    setEditingData('');
    setEditingHoras('');
  };

  const cancelEditingAula = () => {
    if (updatingAulaId) return;
    resetEditingAula();
  };

  const saveEditingAula = async () => {
    if (!editingAulaId) return;
    const horasValue = Number(editingHoras.replace(',', '.'));
    if (!editingData.trim() || !Number.isFinite(horasValue) || horasValue <= 0) {
      return;
    }

    try {
      await onUpdateAula({
        aulaId: editingAulaId,
        disciplinaId: disciplina.id,
        dataAula: editingData,
        horas: horasValue,
      });
      resetEditingAula();
    } catch {
      // O toast da mutation mantém o contexto do erro e o formulário aberto para correção.
    }
  };

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
              {formatGradeHours(cargaHoraria)} horas oficiais • {aulasCount} aulas
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <div onClick={onToggle} className="cursor-pointer flex flex-col items-end shrink-0">
            <span className={`text-[10px] font-black uppercase tracking-wider ${progressTextClass}`}>
              {formatGradeHours(horasRealizadas)}h de {formatGradeHours(cargaHoraria)}h
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
          <div className="flex flex-col gap-3 mb-4 bg-white p-3 rounded-2xl border border-slate-100 shadow-inner lg:flex-row lg:items-center lg:justify-between">
            <div>
              <span className="text-xs font-bold text-slate-700">Planejamento das aulas</span>
              <p className="mt-0.5 text-[10px] font-semibold text-slate-400">
                A Gestão informa data e carga horária e pode adiantar o conteúdo. Se deixar em branco, o professor completa no diário.
              </p>
            </div>
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

          <div className="space-y-2.5 mb-4 pl-4">
            {aulas.length === 0 && atividades.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-2">
                Nenhuma aula ou atividade extra-classe cadastrada nesta turma ainda.
              </p>
            ) : (
              <>
                {aulas.map((aula, index) => {
                  const dataFormatada = aula.dataAula
                    ? new Date(`${aula.dataAula}T00:00:00`).toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                      })
                    : null;

                  if (editingAulaId === aula.id) {
                    const isUpdating = updatingAulaId === aula.id;
                    const canSave = editingData.trim()
                      && Number(editingHoras.replace(',', '.')) > 0;

                    return (
                      <div
                        key={aula.id}
                        className={`border-l-2 ${theme.border} bg-white rounded-r-xl border-y border-r border-slate-200 shadow-sm p-3`}
                      >
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                            <Pencil size={13} className={theme.text} />
                            Editando aula {index + 1}
                          </div>
                          <button
                            type="button"
                            onClick={cancelEditingAula}
                            disabled={isUpdating}
                            className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                            title="Cancelar edição"
                            aria-label="Cancelar edição da aula"
                          >
                            <X size={15} />
                          </button>
                        </div>
                        <div className="mb-2 flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50/70 px-3 py-2 text-[10px] font-semibold text-blue-700">
                          <CalendarClock size={13} className="shrink-0" />
                          Data e carga horária são ajustadas aqui. Gestão e professor podem editar o conteúdo no diário.
                        </div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[150px_90px_auto] sm:justify-end">
                          <input
                            type="date"
                            value={editingData}
                            onChange={(event) => setEditingData(event.target.value)}
                            disabled={isUpdating}
                            className={`rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 outline-none ${theme.focusBorder}`}
                            aria-label="Data da aula"
                          />
                          <input
                            type="number"
                            min="0.1"
                            step="0.1"
                            inputMode="decimal"
                            value={editingHoras.replace(',', '.')}
                            onChange={(event) => setEditingHoras(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' && canSave) void saveEditingAula();
                            }}
                            disabled={isUpdating}
                            className={`rounded-xl border border-slate-200 bg-white px-2 py-2 text-center text-xs font-bold text-slate-700 outline-none ${theme.focusBorder}`}
                            placeholder="Horas"
                            aria-label="Carga horária da aula"
                          />
                          <button
                            type="button"
                            onClick={() => void saveEditingAula()}
                            disabled={isUpdating || !canSave}
                            className={`flex min-h-[36px] items-center justify-center gap-2 rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-wider transition-colors ${theme.bg} ${theme.text} ${theme.border} ${theme.hoverBg} hover:text-white disabled:cursor-not-allowed disabled:opacity-50`}
                          >
                            {isUpdating ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                            Salvar
                          </button>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={aula.id}
                      className={`group pl-3.5 border-l-2 border-slate-300 ${theme.hoverBorderDark} transition-colors py-2 bg-white pr-3 rounded-r-xl border-y border-r border-slate-100 shadow-sm space-y-1`}
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          <CornerDownRight size={13} className="text-slate-400 shrink-0" />
                          <span className="font-bold text-slate-800">
                            Aula {index + 1}
                          </span>
                          {dataFormatada && (
                            <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200/70">
                              {dataFormatada}
                            </span>
                          )}
                          <span className="text-[11px] font-bold text-slate-700 bg-slate-50 px-2 py-0.5 rounded border border-slate-200 font-mono">
                            {formatGradeHours(aula.cargaHoraria)}h
                          </span>
                          {aula.sessoes.length > 1 && aula.sessoes.map((sessao) => (
                            <span
                              key={sessao.id}
                              className="rounded border border-blue-100 bg-blue-50 px-1.5 py-0.5 text-[10px] font-black text-blue-700"
                              title={`${sessao.periodo === 'M' ? 'Manhã' : sessao.periodo === 'T' ? 'Tarde' : 'Noite'} — ${formatGradeHours(sessao.cargaHoraria)}h`}
                            >
                              {sessao.periodo} {formatGradeHours(sessao.cargaHoraria)}h
                            </span>
                          ))}
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => startEditingAula(aula)}
                            disabled={Boolean(updatingAulaId)}
                            className={`cursor-pointer rounded p-1 transition-colors hover:bg-slate-100 ${theme.text} disabled:cursor-not-allowed disabled:opacity-50`}
                            title="Editar aula"
                            aria-label={`Editar aula ${index + 1}`}
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteAula(aula.id)}
                            disabled={Boolean(updatingAulaId)}
                            className="text-slate-300 hover:text-red-500 transition-colors cursor-pointer p-1 rounded hover:bg-red-50 shrink-0 disabled:cursor-not-allowed disabled:opacity-50"
                            title="Excluir aula"
                            aria-label={`Excluir aula ${index + 1}`}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                      <div className="pl-5 text-xs text-slate-600 font-normal leading-relaxed break-words">
                        {isAcademicClassContentPending(aula.titulo) ? (
                          <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-100 bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-700">
                            <Pencil size={11} />
                            Aguardando conteúdo do professor
                          </span>
                        ) : aula.titulo}
                      </div>
                    </div>
                  );
                })}
                {atividades.map((atividade, index) => {
                  const dataFormatada = atividade.prazoEntrega
                    ? new Date(`${atividade.prazoEntrega}T00:00:00`).toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                      })
                    : null;

                  return (
                    <div
                      key={atividade.id}
                      className="group pl-3.5 border-l-2 border-emerald-400 transition-colors py-2 bg-emerald-50/50 pr-3 rounded-r-xl border-y border-r border-emerald-100 shadow-sm space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          <ClipboardCheck size={13} className="text-emerald-600 shrink-0" />
                          <span className="font-bold text-emerald-900">
                            Extra {index + 1}
                          </span>
                          {dataFormatada && (
                            <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-100/80 px-2 py-0.5 rounded border border-emerald-200/70">
                              {dataFormatada}
                            </span>
                          )}
                          <span className="text-[11px] font-bold text-emerald-800 bg-white px-2 py-0.5 rounded border border-emerald-200 font-mono">
                            {formatGradeHours(atividade.cargaHoraria)}h
                          </span>
                        </div>
                      </div>
                      <div className="pl-5 text-xs text-slate-700 font-normal leading-relaxed break-words">
                        {atividade.titulo}
                      </div>
                    </div>
                  );
                })}
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
            {isExtraClasse ? (
              <input
                type="text"
                placeholder="Tema da atividade extra-classe..."
                className={`flex-1 text-xs bg-white border border-slate-200 rounded-xl outline-none ${theme.focusBorder} px-3 py-2.5 transition-colors font-medium text-slate-700 placeholder-slate-400 min-w-[150px]`}
                value={titulo}
                onChange={(event) => onTituloChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') document.getElementById(`turma-data-input-${disciplina.id}`)?.focus();
                }}
                aria-label="Tema da atividade extra-classe"
              />
            ) : (
              <input
                type="text"
                placeholder="Conteúdo da aula (opcional)"
                className={`flex-1 text-xs bg-white border border-slate-200 rounded-xl outline-none ${theme.focusBorder} px-3 py-2.5 transition-colors font-medium text-slate-700 placeholder-slate-400 min-w-[190px]`}
                value={titulo}
                onChange={(event) => onTituloChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') document.getElementById(`turma-data-input-${disciplina.id}`)?.focus();
                }}
                maxLength={1000}
                title="Opcional: deixe em branco para o professor preencher no diário"
                aria-label="Conteúdo programático opcional da aula"
              />
            )}
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
            {!isExtraClasse && Number(horas.replace(',', '.')) === 8 && (
              <span className="shrink-0 rounded-lg border border-blue-100 bg-blue-50 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-blue-700">
                M 4h + T 4h
              </span>
            )}
            <button
              type="button"
              onClick={onAddPlanejamento}
              className={`min-h-[38px] px-4 py-2.5 ${theme.bg} ${theme.text} rounded-xl ${theme.hoverBg} hover:text-white transition-colors border ${theme.border} flex items-center justify-center gap-2 shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-[10px] font-black uppercase tracking-widest`}
              disabled={isSaving || !horas.trim() || !data.trim() || (isExtraClasse && !titulo.trim())}
              aria-label={isExtraClasse ? 'Criar atividade extra-classe' : 'Planejar horário da aula'}
            >
              {isSaving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              {isExtraClasse ? 'Criar atividade' : 'Planejar horário'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TurmaGradeDisciplina;
