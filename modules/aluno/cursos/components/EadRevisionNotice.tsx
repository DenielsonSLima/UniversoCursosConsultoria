import React, { useState } from 'react';
import { EadLessonArticle } from './EadLessonArticle';

export const EadRevisionNotice: React.FC<{ view: any }> = ({ view }) => {
  const [confirming, setConfirming] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [reading, setReading] = useState(false);
  const { assessmentRevision: revision, revisionPending, revisionError, isUpdatingProgress } = view;
  if (!revision?.isHistorical) return null;
  const lessons = view.selectedCourse?.ead_config?.conteudos || [];
  return (
    <section aria-label="Revisão do curso" className="space-y-4 rounded-2xl border border-blue-200 bg-blue-50 p-5 text-sm text-slate-700">
      <h3 className="font-black text-[#001a33]">Conteúdo e avaliações revisados</h3>
      <p>As aulas, atividades e a prova deste curso foram revisadas. Seu progresso anterior permanece preservado.</p>
      {view.canStartRevision ? (
        confirming ? (
          <div className="space-y-4">
            <p>Ao iniciar a revisão, você estudará as novas aulas e responderá às novas atividades e prova. O progresso e as respostas anteriores ficarão arquivados e não serão reaproveitados automaticamente.</p>
            <label className="flex items-start gap-3">
              <input type="checkbox" checked={acknowledged} disabled={revisionPending} onChange={event => setAcknowledged(event.target.checked)} className="mt-1" />
              <span>Entendi e quero iniciar o conteúdo e a avaliação revisados.</span>
            </label>
            <div className="flex flex-wrap gap-3">
              <button type="button" disabled={!acknowledged || isUpdatingProgress} onClick={view.startRevision} className="rounded-xl bg-blue-600 px-4 py-3 font-bold text-white disabled:opacity-50">{revisionPending ? 'Iniciando revisão...' : 'Confirmar e iniciar revisão'}</button>
              <button type="button" disabled={revisionPending} onClick={() => { setConfirming(false); setAcknowledged(false); }} className="rounded-xl border border-slate-300 bg-white px-4 py-3 font-bold">Continuar no progresso anterior</button>
            </div>
          </div>
        ) : <button type="button" disabled={isUpdatingProgress} onClick={() => setConfirming(true)} className="rounded-xl bg-blue-600 px-4 py-3 font-bold text-white disabled:opacity-50">Iniciar conteúdo e avaliação revisados</button>
      ) : <p>Sua conclusão, nota e certificado permanecem vinculados à avaliação realizada. Você pode consultar as novas aulas abaixo.</p>}
      {revisionError && <p role="alert" className="font-bold text-red-700">{revisionError}</p>}
      <button type="button" aria-expanded={reading} onClick={() => setReading(value => !value)} className="font-bold text-blue-700 underline">{reading ? 'Fechar consulta às novas aulas' : 'Consultar novas aulas sem alterar o progresso'}</button>
      {reading && <div className="space-y-4">{lessons.map((lesson: any) => (
        <details key={lesson.id} className="rounded-2xl border border-slate-200 bg-white p-4">
          <summary className="cursor-pointer font-bold">{lesson.titulo}</summary>
          <div className="mt-4"><EadLessonArticle lesson={lesson} /></div>
        </details>
      ))}</div>}
    </section>
  );
};
