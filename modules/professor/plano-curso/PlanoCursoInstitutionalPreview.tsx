import React from 'react';
import DocumentHeader from '../../gestor/components/DocumentHeader';
import ReportWatermark from '../../gestor/relatorios/components/ReportWatermark';
import type { ProfessorPolo } from '../components/ProfessorShell';
import type { PlanoCursoWorkspace } from '../../shared/plano-curso/plano-curso.types';
import { paginatePlanoCursoDays, PLANO_CURSO_DAYS_PER_PAGE } from './plano-curso-day-editor';
import type { PlanoCursoEditor } from './usePlanoCursoEditor';
import { linesToPlanoItems } from './plano-curso.presentation';

export const PlanoCursoPaper: React.FC<{
  children: React.ReactNode;
  pageNumber: number;
  polo: ProfessorPolo | null;
  totalPages: number;
  workspace: PlanoCursoWorkspace;
}> = ({ children, pageNumber, polo, totalPages, workspace }) => {
  const institutionalPolo = polo || { nome: workspace.poloNome };
  return (
    <article
      data-plano-curso-page={pageNumber}
      aria-label={`Página ${pageNumber} de ${totalPages} do Plano de Curso`}
      className='relative mx-auto flex min-h-[1123px] w-[794px] shrink-0 flex-col border border-slate-200 bg-white shadow-sm'
    >
      <ReportWatermark polo={institutionalPolo} orientation='portrait' />
      <div className='relative z-10 flex-1'>
        <div className='h-2 bg-[#001a33]' />
        <div className='px-12 pb-8 pt-9'>
          <DocumentHeader polo={institutionalPolo} orientation='portrait' />
          <div className='mb-6 border-b border-slate-200 pb-6 text-center'>
            <h2 className='text-2xl font-black uppercase tracking-[0.08em] text-[#001a33]'>
              Plano de Curso
            </h2>
            <p className='mt-1 text-xs font-bold uppercase tracking-wider text-slate-400'>
              {workspace.cursoNome} · {workspace.turmaNome}
            </p>
          </div>
          {children}
        </div>
      </div>
      <footer className='relative z-20 mx-12 mb-5 flex items-center justify-between border-t border-slate-200/80 pt-2 text-[9px] font-bold uppercase tracking-widest text-slate-400'>
        <span>Plano de Curso</span>
        <span>Página {pageNumber} de {totalPages}</span>
      </footer>
    </article>
  );
};

const PlanoCursoInstitutionalPreview: React.FC<{
  editor: PlanoCursoEditor;
  polo: ProfessorPolo | null;
}> = ({ editor, polo }) => {
  const { workspace } = editor;
  if (!workspace) return null;
  const diasPaginas = paginatePlanoCursoDays(editor.diasEditor);
  const totalPages = diasPaginas.length + 1;
  return (
    <details className='min-w-0 rounded-xl border border-slate-200 bg-white'>
      <summary className='flex min-h-11 cursor-pointer items-center px-4 py-3 text-[13px] font-medium text-blue-800'>
        Prévia institucional do plano
      </summary>
      <div className='border-t border-slate-200 p-3'>
        <p className='mb-3 text-xs leading-5 text-slate-600'>
          {workspace.status === 'CONCLUIDO'
            ? 'Plano concluído. A revisão e os conteúdos permanecem preservados.'
            : 'Prévia do rascunho em edição. O rascunho ainda não é um documento oficial.'}
        </p>
        <div
          className='max-w-full overflow-x-auto bg-slate-100 p-3'
          tabIndex={0}
          aria-label='Prévia A4 com rolagem horizontal'
        >
          <div className='w-max space-y-6'>
            <PlanoCursoPaper
              pageNumber={1}
              totalPages={totalPages}
              polo={polo}
              workspace={workspace}
            >
              <div className='rounded-lg border border-slate-300 bg-white/75'>
                {[
                  ['Componente curricular', workspace.disciplinaNome],
                  ['Professor(a)', workspace.professorNome],
                  ['Dias das aulas', `${workspace.totalDias} dias letivos`],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className='grid grid-cols-[190px_1fr] gap-4 border-b border-slate-200 px-4 py-3 last:border-b-0'
                  >
                    <p className='text-[11px] font-black uppercase tracking-wide text-[#001a33]'>
                      {label}
                    </p>
                    <p className='break-words text-sm font-semibold text-slate-700'>{value}</p>
                  </div>
                ))}
              </div>
              <div className='mt-5 rounded-lg border border-slate-300 bg-white/75'>
                {[
                  ['Objetivos da disciplina', editor.objetivosText],
                  ['Critérios de avaliação utilizados', editor.criteriosText],
                  ['Insumos utilizados', editor.insumosText],
                ].map(([label, value]) => (
                  <section key={label} className='border-b border-slate-200 last:border-b-0'>
                    <h3 className='bg-slate-50/90 px-4 py-3 text-xs font-black uppercase tracking-wide text-[#001a33]'>
                      {label}
                    </h3>
                    <div className='min-h-24 px-4 py-3 text-sm font-medium leading-6 text-slate-700'>
                      {linesToPlanoItems(value).length
                        ? linesToPlanoItems(value).map((item, index) => (
                          <p key={index} className='break-words'>• {item}</p>
                        ))
                        : <p className='italic text-slate-400'>Não informado.</p>}
                    </div>
                  </section>
                ))}
              </div>
            </PlanoCursoPaper>
            {diasPaginas.map((diasPagina, pageIndex) => {
              const firstDayNumber = pageIndex * PLANO_CURSO_DAYS_PER_PAGE + 1;
              const pageNumber = pageIndex + 2;
              return (
                <PlanoCursoPaper
                  key={pageNumber}
                  pageNumber={pageNumber}
                  totalPages={totalPages}
                  polo={polo}
                  workspace={workspace}
                >
                  <section className='rounded-lg border border-slate-300 bg-white/75'>
                    <div className='flex items-center justify-between gap-3 border-b border-slate-200 bg-[#001a33] px-4 py-4 text-white'>
                      <div>
                        <h3 className='text-xs font-black uppercase tracking-wide'>
                          Datas de atividades / conteúdo programático
                        </h3>
                        <p className='mt-1 text-[11px] text-slate-300'>
                          Uma entrada por dia letivo. Aulas do mesmo dia aparecem reunidas.
                        </p>
                      </div>
                      <span className='shrink-0 text-[10px] font-bold'>
                        Dias {firstDayNumber}–{firstDayNumber + diasPagina.length - 1} de{' '}
                        {workspace.totalDias}
                      </span>
                    </div>
                    <div className='divide-y divide-slate-200'>
                      {diasPagina.map((day, index) => (
                        <div
                          key={day.dataAula}
                          className='grid min-h-[205px] grid-cols-[210px_1fr] gap-4 px-4 py-5'
                        >
                          <div>
                            <p className='text-[10px] font-black uppercase tracking-[0.16em] text-purple-700'>
                              Dia letivo {String(firstDayNumber + index).padStart(2, '0')}
                            </p>
                            <p className='mt-1 text-base font-black text-[#001a33]'>
                              {day.dataExibicao}
                            </p>
                            <div className='mt-3 space-y-1.5'>
                              {day.titulos.map((titulo) => (
                                <p
                                  key={titulo}
                                  className='text-xs font-semibold leading-5 text-slate-600'
                                >
                                  {titulo}
                                </p>
                              ))}
                            </div>
                          </div>
                          <div>
                            <p className='mb-2 text-[11px] font-black uppercase tracking-wide text-slate-500'>
                              Conteúdo programático do dia
                            </p>
                            <p className='min-h-24 whitespace-pre-wrap break-words rounded-lg bg-slate-50/90 px-4 py-3 text-sm leading-6 text-slate-700'>
                              {editor.conteudosPorDia[day.dataAula] || 'Não informado.'}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                </PlanoCursoPaper>
              );
            })}
          </div>
        </div>
      </div>
    </details>
  );
};

export default PlanoCursoInstitutionalPreview;
