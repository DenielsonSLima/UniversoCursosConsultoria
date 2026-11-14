import React, { useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeft, BookOpenCheck, Loader2 } from 'lucide-react';
import ToastNotification, {
  useToast,
} from '../../gestor/parceiros/components/shared/ToastNotification';
import type { ProfessorPolo } from '../components/ProfessorShell';
import { useProfessorPlanosCurso } from '../../shared/plano-curso/plano-curso.hooks';
import { usePlanoCursoRealtime } from '../../shared/plano-curso/plano-curso.realtime';
import PlanoCursoAssignmentList from './PlanoCursoAssignmentList';
import PlanoCursoEditorForm from './PlanoCursoEditorForm';
import PlanoCursoInstitutionalPreview from './PlanoCursoInstitutionalPreview';
import { type PlanoCursoAssignment, usePlanoCursoEditor } from './usePlanoCursoEditor';

interface PlanoCursoPageProps {
  professorId: string;
  poloId: string;
  polo: ProfessorPolo | null;
}

const PlanoCursoPage: React.FC<PlanoCursoPageProps> = ({ professorId, poloId, polo }) => {
  const { toasts, removeToast, toast } = useToast();
  const [selected, setSelected] = useState<PlanoCursoAssignment | null>(null);
  const listQuery = useProfessorPlanosCurso(professorId, poloId);
  const editor = usePlanoCursoEditor({ professorId, poloId, selected, toast });
  usePlanoCursoRealtime({ professorId, poloId });
  useEffect(() => {
    setSelected(null);
  }, [poloId, professorId]);

  return (
    <div className='min-w-0 space-y-4'>
      <header>
        <h1 className='flex items-center gap-2 text-xl font-semibold text-[#001a33]'>
          <BookOpenCheck size={22} className='text-blue-600' />Plano de Curso
        </h1>
        <p className='mt-1 text-xs leading-6 text-slate-500'>
          Prepare os conteúdos das disciplinas atribuídas a você, conforme as aulas programadas pela
          Gestão.
        </p>
      </header>
      {!selected
        ? (
          listQuery.isLoading
            ? (
              <p
                className='flex min-h-32 items-center justify-center gap-2 text-[13px] text-slate-500'
                role='status'
              >
                <Loader2 size={18} className='animate-spin' />Carregando planos…
              </p>
            )
            : listQuery.isError
            ? (
              <div
                className='flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800'
                role='alert'
              >
                <AlertTriangle size={18} className='shrink-0' />
                <div>
                  <p className='text-[13px] font-medium'>
                    Não foi possível carregar os planos autorizados.
                  </p>
                  <p className='mt-1 text-xs leading-5'>
                    A consulta será retomada automaticamente ao restabelecer a conexão ou retornar a
                    esta página.
                  </p>
                </div>
              </div>
            )
            : <PlanoCursoAssignmentList plans={listQuery.data || []} onOpen={setSelected} />
        )
        : (
          <>
            <button
              type='button'
              onClick={() => setSelected(null)}
              disabled={editor.isMutating}
              className='inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50'
            >
              <ArrowLeft size={16} />Voltar aos planos
            </button>
            {editor.workspaceQuery.isLoading
              ? (
                <p
                  className='flex min-h-32 items-center justify-center gap-2 text-[13px] text-slate-500'
                  role='status'
                >
                  <Loader2 size={18} className='animate-spin' />Abrindo plano…
                </p>
              )
              : editor.workspaceQuery.isError || !editor.workspace
              ? (
                <div
                  className='rounded-xl border border-red-200 bg-red-50 p-4 text-red-800'
                  role='alert'
                >
                  <p className='text-[13px] font-medium'>
                    Não foi possível abrir o Plano de Curso autorizado.
                  </p>
                  <p className='mt-1 text-xs leading-5'>
                    A consulta será retomada automaticamente ao restabelecer a conexão ou retornar a
                    esta página.
                  </p>
                </div>
              )
              : (
                <div className='min-w-0 space-y-4'>
                  <PlanoCursoEditorForm editor={editor} />
                  <PlanoCursoInstitutionalPreview editor={editor} polo={polo} />
                </div>
              )}
          </>
        )}
      <ToastNotification toasts={toasts} onRemove={removeToast} />
    </div>
  );
};

export default PlanoCursoPage;
