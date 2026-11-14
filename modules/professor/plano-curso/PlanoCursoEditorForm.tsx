import React from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Save } from 'lucide-react';
import PlanoCursoDayEditorRow from './PlanoCursoDayEditorRow';
import PlanoCursoTextArea from './PlanoCursoTextArea';
import { linesToPlanoItems, PlanoStatusBadge } from './plano-curso.presentation';
import type { PlanoCursoEditor } from './usePlanoCursoEditor';

const PlanoCursoEditorForm: React.FC<{ editor: PlanoCursoEditor }> = ({ editor }) => {
  const { workspace } = editor;
  if (!workspace) return null;
  const fields = [
    {
      id: 'objetivos',
      label: 'Objetivos da disciplina',
      value: editor.objetivosText,
      help: 'Um objetivo por linha.',
    },
    {
      id: 'criterios',
      label: 'Critérios de avaliação',
      value: editor.criteriosText,
      help: 'Um critério por linha.',
    },
    {
      id: 'insumos',
      label: 'Insumos e recursos',
      value: editor.insumosText,
      help: 'Um recurso por linha.',
    },
  ] as const;
  return (
    <form
      className='min-w-0 space-y-4'
      onSubmit={(event) => {
        event.preventDefault();
        void editor.handleSave();
      }}
    >
      <header className='flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between'>
        <div className='min-w-0'>
          <div className='flex flex-wrap items-center gap-2'>
            <PlanoStatusBadge status={workspace.status} />
            <span className='text-xs text-slate-500'>
              Revisão {editor.editorBaseRevision ?? workspace.revisao}
            </span>
          </div>
          <h2 className='mt-2 break-words text-lg font-semibold text-[#001a33]'>
            {workspace.disciplinaNome}
          </h2>
          <p className='mt-1 break-words text-xs text-slate-600'>
            {workspace.cursoNome} · {workspace.turmaNome}
          </p>
          <p className='mt-2 text-xs text-slate-500' aria-live='polite'>
            {editor.pendingAction === 'conclude'
              ? 'Concluindo o plano…'
              : editor.pendingAction === 'save'
              ? 'Salvando o rascunho…'
              : editor.isEditorDirty
              ? 'Há alterações não salvas.'
              : workspace.status === 'CONCLUIDO'
              ? 'Plano concluído e disponível para consulta.'
              : workspace.status === 'AUSENTE'
              ? 'Preencha os campos para iniciar o plano.'
              : 'Rascunho em dia.'}
          </p>
        </div>
        {workspace.canEdit && (
          <div className='grid grid-cols-1 gap-2 sm:flex sm:flex-wrap lg:shrink-0'>
            <button
              type='submit'
              disabled={editor.isMutating || editor.hasRemoteConflict}
              className='inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 text-[13px] font-medium text-blue-800 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50'
            >
              {editor.pendingAction === 'save'
                ? <Loader2 size={16} className='animate-spin' />
                : <Save size={16} />}
              Salvar rascunho
            </button>
            <button
              type='button'
              disabled={editor.isMutating || editor.hasRemoteConflict}
              onClick={() => {
                void editor.handleConclude();
              }}
              className='inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 text-[13px] font-medium text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50'
            >
              {editor.pendingAction === 'conclude'
                ? <Loader2 size={16} className='animate-spin' />
                : <CheckCircle2 size={16} />}
              Concluir plano
            </button>
          </div>
        )}
      </header>

      {editor.hasRemoteConflict && (
        <div
          className='space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900'
          role='alert'
        >
          <div className='flex items-start gap-2'>
            <AlertTriangle size={18} className='mt-0.5 shrink-0' />
            <div>
              <p className='text-[13px] font-semibold'>Este plano foi alterado em outra sessão</p>
              <p className='mt-1 text-xs leading-5'>
                Seu rascunho foi preservado. Salvar e concluir estão bloqueados para não
                sobrescrever a revisão{' '}
                {workspace.revisao}. Descartar as alterações locais mantém a versão recebida
                automaticamente.
              </p>
            </div>
          </div>
          <button
            type='button'
            onClick={editor.discardLocalChanges}
            disabled={editor.isMutating}
            className='min-h-11 rounded-lg border border-amber-300 bg-white px-4 text-[13px] font-medium hover:bg-amber-100 disabled:opacity-50'
          >
            Descartar minhas alterações
          </button>
        </div>
      )}

      <section className='rounded-xl border border-slate-200 bg-white p-4 sm:p-5'>
        <h3 className='text-sm font-semibold text-[#001a33]'>Planejamento da disciplina</h3>
        <div className='mt-3 grid gap-3 text-[13px] sm:grid-cols-3'>
          <div>
            <p className='text-xs text-slate-500'>Professor(a)</p>
            <p className='mt-1 break-words'>{workspace.professorNome}</p>
          </div>
          <div>
            <p className='text-xs text-slate-500'>Dias letivos</p>
            <p className='mt-1'>{workspace.totalDias}</p>
          </div>
          <div>
            <p className='text-xs text-slate-500'>Aulas planejadas</p>
            <p className='mt-1'>{workspace.totalAulas}</p>
          </div>
        </div>
        <div className='mt-5 space-y-5 border-t border-slate-100 pt-4'>
          {fields.map((field) => (
            <section key={field.id}>
              <label
                htmlFor={field.id}
                className='mb-1 block text-[13px] font-medium text-[#001a33]'
              >
                {field.label}
              </label>
              {workspace.canEdit
                ? (
                  <>
                    <p id={`${field.id}-help`} className='mb-2 text-xs text-slate-500'>
                      {field.help}
                    </p>
                    <PlanoCursoTextArea
                      id={field.id}
                      value={field.value}
                      disabled={editor.isMutating}
                      aria-describedby={`${field.id}-help`}
                      onChange={(event) => editor.changeText(field.id, event.target.value)}
                    />
                  </>
                )
                : (
                  <div className='rounded-lg bg-slate-50 p-3 text-[13px] leading-6 text-slate-700'>
                    {linesToPlanoItems(field.value).length
                      ? (
                        <ul className='list-disc space-y-1 pl-4'>
                          {linesToPlanoItems(field.value).map((item, index) => (
                            <li key={index} className='break-words'>{item}</li>
                          ))}
                        </ul>
                      )
                      : <p className='text-slate-500'>Não informado.</p>}
                  </div>
                )}
            </section>
          ))}
        </div>
      </section>

      <section className='space-y-3'>
        <header className='px-1 pt-2'>
          <h3 className='text-sm font-semibold text-[#001a33]'>Conteúdo por dia letivo</h3>
          <p className='mt-1 text-xs leading-5 text-slate-500'>
            As datas e os horários seguem a programação da turma. Você pode preparar os conteúdos
            antes das aulas.
          </p>
        </header>
        {editor.diasEditor.map((day, index) => (
          <PlanoCursoDayEditorRow
            key={day.dataAula}
            day={day}
            dayNumber={index + 1}
            aulas={workspace.aulas.filter((aula) => aula.dataAula === day.dataAula)}
            canEdit={workspace.canEdit}
            content={editor.conteudosPorDia[day.dataAula] || ''}
            isLegacyMerged={day.possuiConteudosDivergentes &&
              !editor.diasConteudoEditados.has(day.dataAula)}
            isMutating={editor.isMutating}
            onContentChange={editor.handleDayContentChange}
          />
        ))}
      </section>
    </form>
  );
};

export default PlanoCursoEditorForm;
