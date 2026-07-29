import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Turma } from '../../../gestao.types';
import ToastNotification, { useToast } from '../../../../parceiros/components/shared/ToastNotification';
import {
  useAddTurmaAtividadeExtraClasseMutation,
  useAddTurmaAulaMutation,
  useAssignProfessorMutation,
  useAssignProfessorToAllMutation,
  useRemoveTurmaAulaMutation,
  useToggleDisciplinaConcluidaMutation,
  useTurmaGradeData,
  useUpdateTurmaAulaMutation,
} from '../hooks/useTurmaGrade';
import {
  TurmaGradeDeleteAulaDialog,
  TurmaGradeDocenteDialog,
} from './grade/TurmaGradeDialogs';
import TurmaGradeModulo from './grade/TurmaGradeModulo';
import {
  getTurmaGradeTheme,
  TurmaGradeColorTheme,
} from './grade/turma-grade-ui';
import { TurmaAulaUpdateInput } from '../turma-grade.types';
import { ACADEMIC_CLASS_CONTENT_PENDING } from '../../../../../../lib/academicClassMeetings';

interface TurmaGradeProps {
  turma: Turma;
  singleProfessor?: boolean;
  colorTheme?: TurmaGradeColorTheme;
}

interface DocenteModalState {
  isOpen: boolean;
  disciplinaId: string;
}

interface AulaDeleteState {
  disciplinaId: string;
  aulaId: string;
}

const CLOSED_DOCENTE_MODAL: DocenteModalState = { isOpen: false, disciplinaId: '' };

const TurmaGrade = ({
  turma,
  singleProfessor = false,
  colorTheme = 'emerald',
}: TurmaGradeProps) => {
  const { toasts, removeToast, toast } = useToast();
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [expandedDisciplines, setExpandedDisciplines] = useState<Set<string>>(new Set());
  const [newAulaTitulo, setNewAulaTitulo] = useState<Record<string, string>>({});
  const [newAulaHoras, setNewAulaHoras] = useState<Record<string, string>>({});
  const [newAulaData, setNewAulaData] = useState<Record<string, string>>({});
  const [newAulaExtraClasse, setNewAulaExtraClasse] = useState<Record<string, boolean>>({});
  const [showDocenteModal, setShowDocenteModal] = useState<DocenteModalState>(CLOSED_DOCENTE_MODAL);
  const [aulaParaExcluir, setAulaParaExcluir] = useState<AulaDeleteState | null>(null);
  const { data: gradeData, isLoading: loading } = useTurmaGradeData(turma.id, turma.cursoId);
  const cursoBase = gradeData?.cursoBase || null;
  const disciplinasConfig = gradeData?.disciplinasConfig || {};
  const aulas = gradeData?.aulas || {};
  const atividadesExtraClasse = gradeData?.atividadesExtraClasse || {};
  const professores = gradeData?.professores || [];
  const metricasGrade = gradeData?.metricasGrade || [];
  const theme = getTurmaGradeTheme(colorTheme);

  const closeDocenteModal = () => setShowDocenteModal(CLOSED_DOCENTE_MODAL);

  const assignProfessorMutation = useAssignProfessorMutation(
    turma.id,
    closeDocenteModal,
    (error) => {
      console.error('Erro ao atribuir docente:', error);
      toast.error('Docente não salvo', 'Não consegui atualizar o docente desta disciplina. Tente novamente.');
      closeDocenteModal();
    },
  );
  const assignProfessorToAllMutation = useAssignProfessorToAllMutation(
    turma.id,
    () => toast.success('Sucesso', 'Docente atribuído com sucesso a todas as disciplinas.'),
    (error) => {
      console.error('Erro ao atribuir docente para a turma:', error);
      toast.error('Docente não salvo', 'Não consegui atualizar o docente da turma. Tente novamente.');
    },
  );
  const toggleConcluidaMutation = useToggleDisciplinaConcluidaMutation(turma.id, (error) => {
    console.error('Erro ao alternar status da disciplina:', error);
    toast.error('Status não salvo', 'Não consegui atualizar o status desta disciplina. Tente novamente.');
  });
  const addAulaMutation = useAddTurmaAulaMutation(
    turma.id,
    (input) => {
      setNewAulaHoras((current) => ({ ...current, [input.disciplinaId]: '' }));
      setNewAulaData((current) => ({ ...current, [input.disciplinaId]: '' }));
      toast.success(
        'Horário planejado',
        'Data e carga horária foram registradas. O professor já pode preencher o título/conteúdo no diário.',
      );
    },
    (error) => {
      console.error('Erro ao adicionar aula:', error);
      const message = String(error?.message || '');
      if (message.includes('Carga horaria excedida')) {
        toast.info('Carga horária excedida', message.replace('Carga horaria', 'Carga horária'), {
          contextLabel: 'Planejamento da grade',
        });
        return;
      }
      toast.error('Aula não salva', 'Não consegui registrar esta aula no planejamento. Tente novamente.');
    },
  );
  const addAtividadeExtraClasseMutation = useAddTurmaAtividadeExtraClasseMutation(
    turma.id,
    (input) => {
      setNewAulaTitulo((current) => ({ ...current, [input.disciplinaId]: '' }));
      setNewAulaHoras((current) => ({ ...current, [input.disciplinaId]: '' }));
      setNewAulaData((current) => ({ ...current, [input.disciplinaId]: '' }));
      setNewAulaExtraClasse((current) => ({ ...current, [input.disciplinaId]: false }));
      if (input.status === 'RASCUNHO') {
        toast.success('Rascunho salvo', 'A atividade extra-classe poderá ser publicada quando a turma estiver em andamento.');
      } else {
        toast.success('Atividade criada', 'A atividade extra-classe foi liberada para os alunos na aba Atividades.');
      }
    },
    (error) => {
      console.error('Erro ao adicionar atividade extra-classe:', error);
      const message = String(error?.message || '');
      if (message.includes('Carga horaria excedida')) {
        toast.info('Carga horária excedida', message.replace('Carga horaria', 'Carga horária'), {
          contextLabel: 'Atividade extra-classe',
        });
        return;
      }
      toast.error('Atividade não salva', 'Não consegui liberar esta atividade extra-classe. Tente novamente.');
    },
  );
  const removeAulaMutation = useRemoveTurmaAulaMutation(
    turma.id,
    () => {
      setAulaParaExcluir(null);
      toast.success('Aula excluída', 'A aula e seus lançamentos associados foram removidos.');
    },
    (error) => {
      console.error('Erro ao remover aula:', error);
      toast.error('Aula não excluída', 'Não consegui remover esta aula do planejamento. Tente novamente.');
    },
  );
  const updateAulaMutation = useUpdateTurmaAulaMutation(
    turma.id,
    () => {
      toast.success('Horário atualizado', 'Data e carga horária foram atualizadas no diário.');
    },
    (error) => {
      console.error('Erro ao atualizar aula:', error);
      const message = String(error?.message || '');
      if (message.includes('Carga horaria excedida')) {
        toast.info('Carga horária excedida', message.replace('Carga horaria', 'Carga horária'), {
          contextLabel: 'Planejamento da grade',
        });
        return;
      }
      toast.error('Aula não atualizada', 'Não consegui salvar as alterações desta aula. Tente novamente.');
    },
  );

  useEffect(() => {
    const firstModuleId = cursoBase?.modulos?.[0]?.id;
    if (!firstModuleId || expandedModules.size > 0) return;
    setExpandedModules(new Set([firstModuleId]));
  }, [cursoBase, expandedModules.size]);

  const toggleSetItem = (
    setter: React.Dispatch<React.SetStateAction<Set<string>>>,
    id: string,
  ) => setter((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const handleAssignProfessor = async (disciplinaId: string, professorId: string) => {
    const currentConfig = disciplinasConfig[disciplinaId] || { professor: null, concluida: false };
    const professor = professores.find((item) => item.id === professorId) || null;
    await assignProfessorMutation.mutateAsync({ disciplinaId, professor, currentConfig });
  };

  const handleAssignProfessorToAll = async (professorId: string) => {
    if (!cursoBase) return;
    const disciplineIds = (cursoBase.modulos || []).flatMap((modulo) => (
      modulo.disciplinas.map((disciplina) => disciplina.id)
    ));
    if (disciplineIds.length === 0) return;
    const professor = professores.find((item) => item.id === professorId) || null;
    await assignProfessorToAllMutation.mutateAsync({ disciplineIds, professor, configs: disciplinasConfig });
  };

  const handleToggleConcluida = async (disciplinaId: string) => {
    const currentConfig = disciplinasConfig[disciplinaId] || { professor: null, concluida: false };
    await toggleConcluidaMutation.mutateAsync({ disciplinaId, currentConfig });
  };

  const handleAddAula = async (disciplinaId: string) => {
    const horasStr = newAulaHoras[disciplinaId]?.trim();
    const dataStr = newAulaData[disciplinaId]?.trim();
    const isExtraClasse = Boolean(newAulaExtraClasse[disciplinaId]);
    const tituloExtraClasse = newAulaTitulo[disciplinaId]?.trim();
    if (!horasStr || !dataStr || (isExtraClasse && !tituloExtraClasse)) {
      toast.info(
        'Complete os dados',
        isExtraClasse
          ? 'Informe tema, prazo e carga horária antes de criar a atividade.'
          : 'Informe data da aula e carga horária antes de salvar.',
      );
      return;
    }

    const horas = Number(horasStr.replace(',', '.'));
    if (!Number.isFinite(horas) || horas <= 0) {
      toast.info('Carga horária inválida', 'Use uma carga horária maior que zero.');
      return;
    }

    if (isExtraClasse) {
      const turmaStatus = String(turma.status || '').toUpperCase();
      const isPreparacao = turmaStatus === 'PLANEJADA' || turmaStatus === 'INSCRICOES_ABERTAS';
      await addAtividadeExtraClasseMutation.mutateAsync({
        disciplinaId,
        titulo: tituloExtraClasse!,
        horas,
        prazoEntrega: dataStr,
        texto: `Desenvolva uma resposta sobre o tema "${tituloExtraClasse}". Registre sua entrega no portal do aluno.`,
        criadoPorTipo: 'GESTOR',
        status: isPreparacao ? 'RASCUNHO' : 'PUBLICADA',
      });
      return;
    }

    await addAulaMutation.mutateAsync({
      disciplinaId,
      titulo: ACADEMIC_CLASS_CONTENT_PENDING,
      horas,
      dataAula: dataStr,
    });
  };

  const handleUpdateAula = async (input: TurmaAulaUpdateInput) => {
    const dataAula = input.dataAula.trim();
    const horas = Number(input.horas);

    if (!dataAula) {
      toast.info('Complete os dados', 'Informe data da aula e carga horária antes de salvar.');
      return;
    }
    if (!Number.isFinite(horas) || horas <= 0) {
      toast.info('Carga horária inválida', 'Use uma carga horária maior que zero.');
      return;
    }

    await updateAulaMutation.mutateAsync({
      ...input,
      dataAula,
      horas,
    });
  };

  const updateDraft = <T,>(
    setter: React.Dispatch<React.SetStateAction<Record<string, T>>>,
    disciplinaId: string,
    value: T,
  ) => setter((current) => ({ ...current, [disciplinaId]: value }));

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className={`animate-spin ${theme.loader}`} size={32} />
        <span className="text-slate-500 font-bold ml-3">Carregando estrutura e aulas...</span>
      </div>
    );
  }

  if (!cursoBase) {
    return (
      <div className="p-8 text-center text-slate-500">
        Não consegui carregar a estrutura curricular desta turma. Atualize a página ou tente novamente.
      </div>
    );
  }

  return (
    <div className="space-y-6 ">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-lg font-bold text-[#001a33]">Grade Curricular & Corpo Docente</h3>
        <span className="text-xs bg-slate-100 px-3 py-1 rounded-full text-slate-600 font-medium">
          Baseado em: {cursoBase.nome}
        </span>
      </div>

      {singleProfessor && (
        <div className="bg-indigo-50/70 border border-indigo-100 p-6 rounded-[2rem] flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 shadow-sm">
          <div>
            <h4 className="text-sm font-black text-indigo-900 uppercase tracking-tight">Docente Responsável pela Turma</h4>
            <p className="text-[11px] text-indigo-700 font-semibold mt-0.5">
              Estes cursos possuem apenas um docente para toda a grade curricular.
            </p>
          </div>
          <div className="w-full md:w-64">
            <select
              value={Object.values(disciplinasConfig).find((config) => config.professorId)?.professorId || ''}
              onChange={(event) => handleAssignProfessorToAll(event.target.value)}
              className="w-full text-xs font-bold bg-white border border-slate-200 rounded-xl outline-none focus:border-indigo-500 px-3.5 py-3 transition-colors text-slate-700 shadow-sm"
            >
              <option value="">Selecione um professor...</option>
              {professores.map((professor) => (
                <option key={professor.id} value={professor.id}>{professor.nome}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {(cursoBase.modulos || []).length === 0 && (
        <div className="p-12 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-300">
          <p className="text-slate-500">A grade deste curso ainda não foi configurada no cadastro.</p>
        </div>
      )}

      {(cursoBase.modulos || []).map((modulo) => (
        <TurmaGradeModulo
          key={modulo.id}
          modulo={modulo}
          metricasGrade={metricasGrade}
          disciplinasConfig={disciplinasConfig}
          aulas={aulas}
          atividades={atividadesExtraClasse}
          expanded={expandedModules.has(modulo.id)}
          expandedDisciplines={expandedDisciplines}
          singleProfessor={singleProfessor}
          theme={theme}
          savingAulaDisciplinaId={addAulaMutation.isPending ? addAulaMutation.variables?.disciplinaId : undefined}
          savingAtividadeDisciplinaId={addAtividadeExtraClasseMutation.isPending ? addAtividadeExtraClasseMutation.variables?.disciplinaId : undefined}
          updatingAulaId={updateAulaMutation.isPending ? updateAulaMutation.variables?.aulaId : undefined}
          titulos={newAulaTitulo}
          datas={newAulaData}
          horas={newAulaHoras}
          extrasClasse={newAulaExtraClasse}
          onToggleModulo={() => toggleSetItem(setExpandedModules, modulo.id)}
          onToggleDisciplina={(id) => toggleSetItem(setExpandedDisciplines, id)}
          onToggleConcluida={handleToggleConcluida}
          onOpenProfessor={(disciplinaId) => setShowDocenteModal({ isOpen: true, disciplinaId })}
          onDeleteAula={(disciplinaId, aulaId) => setAulaParaExcluir({ disciplinaId, aulaId })}
          onUpdateAula={handleUpdateAula}
          onTituloChange={(id, value) => updateDraft(setNewAulaTitulo, id, value)}
          onDataChange={(id, value) => updateDraft(setNewAulaData, id, value)}
          onHorasChange={(id, value) => updateDraft(setNewAulaHoras, id, value)}
          onExtraClasseChange={(id, value) => updateDraft(setNewAulaExtraClasse, id, value)}
          onAddPlanejamento={handleAddAula}
        />
      ))}

      {showDocenteModal.isOpen && (
        <TurmaGradeDocenteDialog
          disciplinaId={showDocenteModal.disciplinaId}
          professores={professores}
          onAssign={handleAssignProfessor}
          onClose={closeDocenteModal}
        />
      )}
      {aulaParaExcluir && (
        <TurmaGradeDeleteAulaDialog
          onCancel={() => setAulaParaExcluir(null)}
          onConfirm={() => removeAulaMutation.mutate(aulaParaExcluir.aulaId)}
          isDeleting={removeAulaMutation.isPending}
        />
      )}
      <ToastNotification toasts={toasts} onRemove={removeToast} />
    </div>
  );
};

export default TurmaGrade;
