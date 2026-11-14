import React from 'react';
import { BookOpenCheck, CalendarDays, ChevronRight, FilePenLine } from 'lucide-react';
import InstitutionalSelect from '../../shared/components/InstitutionalSelect';
import type {
  PlanoCursoProfessorResumo,
  PlanoCursoStatus,
} from '../../shared/plano-curso/plano-curso.types';
import type { PlanoCursoAssignment } from './usePlanoCursoEditor';
import { PLANO_STATUS_VIEW, planoAssignmentId, PlanoStatusBadge } from './plano-curso.presentation';

interface Props {
  plans: PlanoCursoProfessorResumo[];
  onOpen: (assignment: PlanoCursoAssignment) => void;
}

const PlanoCursoAssignmentList: React.FC<Props> = ({ plans, onOpen }) => {
  const counts = plans.reduce((result, item) => {
    result[item.status] += 1;
    return result;
  }, { AUSENTE: 0, RASCUNHO: 0, CONCLUIDO: 0 });
  return (
    <div className='min-w-0 space-y-4'>
      <div className='grid grid-cols-3 gap-2'>
        {(Object.keys(PLANO_STATUS_VIEW) as PlanoCursoStatus[]).map((status) => (
          <div key={status} className='rounded-lg border border-slate-200 bg-white px-3 py-2'>
            <p className='text-xs leading-5 text-slate-500'>{PLANO_STATUS_VIEW[status].label}</p>
            <p className='mt-1 text-lg font-semibold text-[#001a33]'>{counts[status]}</p>
          </div>
        ))}
      </div>
      {plans.length > 0
        ? (
          <>
            <div className='rounded-xl border border-slate-200 bg-white p-4'>
              <label
                htmlFor='plano-curso-assignment'
                className='mb-2 block text-[13px] font-medium text-[#001a33]'
              >
                Disciplina e turma
              </label>
              <InstitutionalSelect
                id='plano-curso-assignment'
                value=''
                ariaLabel='Buscar disciplina e turma'
                placeholder='Busque pela disciplina, turma ou curso…'
                options={plans.map((item) => ({
                  value: planoAssignmentId(item),
                  label: `${item.disciplinaNome} · ${item.turmaNome}`,
                  description: `${item.cursoNome} · ${item.turmaCodigo}`,
                  keywords: `${item.cursoNome} ${item.turmaCodigo} ${
                    PLANO_STATUS_VIEW[item.status].label
                  }`,
                }))}
                showOptionDescriptions
                onValueChange={(value) => {
                  const assignment = plans.find((item) => planoAssignmentId(item) === value);
                  if (assignment) {
                    onOpen({
                      turmaId: assignment.turmaId,
                      disciplinaId: assignment.disciplinaId,
                    });
                  }
                }}
              />
            </div>
            <div className='grid gap-3 md:grid-cols-2 xl:grid-cols-3'>
              {plans.map((plano) => (
                <article
                  key={planoAssignmentId(plano)}
                  className='flex min-w-0 flex-col rounded-xl border border-slate-200 bg-white p-4'
                >
                  <div className='mb-3 flex items-center justify-between gap-2'>
                    <BookOpenCheck size={19} className='shrink-0 text-blue-600' />
                    <PlanoStatusBadge status={plano.status} />
                  </div>
                  <h3 className='break-words text-sm font-semibold leading-6 text-[#001a33]'>
                    {plano.disciplinaNome}
                  </h3>
                  <p className='mt-1 break-words text-xs leading-5 text-slate-600'>
                    {plano.cursoNome}
                  </p>
                  <p className='mt-1 break-words text-xs leading-5 text-slate-500'>
                    {plano.turmaNome} · {plano.turmaCodigo}
                  </p>
                  <p className='my-3 text-xs text-slate-500'>
                    {plano.totalDias} dias letivos · {plano.totalAulas} aulas
                  </p>
                  <button
                    type='button'
                    onClick={() =>
                      onOpen({ turmaId: plano.turmaId, disciplinaId: plano.disciplinaId })}
                    className='mt-auto inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#001a33] px-3 text-[13px] font-medium text-white hover:bg-blue-950'
                  >
                    {plano.status === 'CONCLUIDO'
                      ? <BookOpenCheck size={16} />
                      : <FilePenLine size={16} />}
                    {plano.status === 'CONCLUIDO' ? 'Consultar plano' : 'Preparar plano'}
                    <ChevronRight size={16} />
                  </button>
                </article>
              ))}
            </div>
          </>
        )
        : (
          <div className='rounded-xl border border-slate-200 bg-white px-4 py-8 text-center'>
            <CalendarDays size={25} className='mx-auto text-blue-600' />
            <h3 className='mt-3 text-sm font-semibold text-[#001a33]'>Nenhum plano disponível</h3>
            <p className='mx-auto mt-2 max-w-lg text-xs leading-6 text-slate-500'>
              A disciplina aparecerá aqui depois que a Gestão atribuir você como docente e planejar
              os encontros da grade.
            </p>
          </div>
        )}
    </div>
  );
};

export default PlanoCursoAssignmentList;
