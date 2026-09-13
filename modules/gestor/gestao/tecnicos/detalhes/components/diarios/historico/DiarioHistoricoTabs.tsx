import type { DiarioActiveTab } from '../diario-classe.types';
import type { DiarioHistorico } from './diario-historico.types';
import HistoricalField, { HistoricalSources, ReviewBadge } from './HistoricalField';
import { historicalDate, historicalNumber } from './diario-historico.presentation';
import { historicalIssueLabels } from './diario-historico.issues';
import DiarioHistoricoFrequencia from './DiarioHistoricoFrequencia';
import DiarioHistoricoResultados from './DiarioHistoricoResultados';

const DiarioHistoricoTabs = ({ history, activeTab }: { history: DiarioHistorico; activeTab: DiarioActiveTab }) => (
  <>
    <section aria-label="Resumo do histórico importado" className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-blue-600">Documento de origem</p>
      <p className="mt-1 break-words text-sm font-semibold text-[#001a33]">{history.sourceName}</p>
      <dl className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SummaryItem label="Carga horária curricular" value={`${historicalNumber(history.officialHours)} h`} />
        <SummaryItem label="Carga curricular de aulas" value={`${historicalNumber(history.officialClassHours)} h`} />
        <SummaryItem label="Horas registradas no documento" value={`${historicalNumber(history.reportedClassHours)} h`} state={history.hoursState} />
        <SummaryItem label="Aulas no documento" value={historicalNumber(history.lessonsCount)} />
        <SummaryItem label="Alunos vinculados" value={historicalNumber(history.studentsCount)} />
        <SummaryItem label="Vínculos em conferência" value={historicalNumber(history.unresolvedCount)} />
        <SummaryItem label="Marcações conferidas" value={historicalNumber(history.attendanceCount)} />
        <SummaryItem label="Notas finais conferidas" value={historicalNumber(history.gradesConfirmed)} />
      </dl>
    </section>

    {history.unresolvedCount > 0 && (
      <section className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <h4 className="text-sm font-bold text-amber-900">Alunos com vínculo em conferência</h4>
        <p className="mt-1 text-xs text-amber-800">Os registros originais foram preservados e aguardam a identificação da matrícula ou da dependência.</p>
        <ul className="mt-3 space-y-3 text-sm text-amber-900">
          {history.unresolvedStudents.map((student) => (
            <li key={student.sourcePersonKey}>
              {student.sourceNames.map((name, index) => <HistoricalField key={index} field={name} />)}
            </li>
          ))}
        </ul>
      </section>
    )}

    <section className="mb-8 min-h-[360px] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      {activeTab === 'frequencia' && <DiarioHistoricoFrequencia history={history} />}
      {activeTab === 'resultado' && <DiarioHistoricoResultados history={history} />}
      {activeTab === 'conteudo' && (
        <div className="divide-y divide-slate-100">
          {history.lessons.map((lesson) => (
            <article key={lesson.id} className="grid gap-4 p-5 md:grid-cols-[180px_1fr]">
              <div>
                <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">Data no documento</p>
                <div className="text-sm font-bold text-[#001a33]"><HistoricalField field={lesson.dateField} fallback={historicalDate(lesson.date)} /></div>
                <p className="mb-1 mt-4 text-[10px] font-bold uppercase tracking-wide text-slate-400">Horas no documento</p>
                <div className="text-sm text-slate-700"><HistoricalField field={lesson.hoursField} state={lesson.hoursState} fallback={`${historicalNumber(lesson.hours)} h`} /></div>
              </div>
              <div className="space-y-4">
                <div>
                  <h4 className="mb-1 text-xs font-bold text-[#001a33]">Conteúdo da aula</h4>
                  <div className="text-sm leading-relaxed text-slate-700"><HistoricalField field={lesson.contentField} fallback={lesson.content || '—'} /></div>
                </div>
                <div>
                  <h4 className="mb-1 text-xs font-bold text-[#001a33]">Prática pedagógica</h4>
                  <div className="text-sm leading-relaxed text-slate-700"><HistoricalField field={lesson.practiceField} fallback={lesson.practice || '—'} /></div>
                </div>
              </div>
            </article>
          ))}
          {history.lessonsCount === 0 && <p className="p-6 text-sm text-slate-500">Nenhuma aula registrada neste documento.</p>}
        </div>
      )}
      {activeTab === 'observacoes' && (
        <div className="space-y-6 p-5">
          <div>
            <h4 className="mb-3 font-bold text-[#001a33]">Observações do documento</h4>
            {history.metadata?.observations?.length
              ? history.metadata.observations.map((field, index) => <HistoricalField key={index} field={field} />)
              : <p className="text-sm text-slate-500">—</p>}
          </div>
          <div>
            <h4 className="mb-3 font-bold text-[#001a33]">Legenda dos instrumentos avaliativos</h4>
            {history.metadata?.assessmentLegend?.map((field, index) => <HistoricalField key={index} field={field} />)}
          </div>
          <div>
            <h4 className="mb-3 font-bold text-[#001a33]">Conferência dos registros</h4>
            <ul className="space-y-3">
              {history.issues.map((issue, index) => (
                <li key={issue.issueKey || index} className="rounded-xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-900">
                  {issue.message || historicalIssueLabels[issue.code || ''] || 'Este registro exige conferência com o documento original.'}
                  <HistoricalSources refs={issue.sourceRefs} />
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {activeTab === 'fechamento' && (
        <div className="space-y-6 p-6">
          <div>
            <h4 className="font-bold text-[#001a33]">Encerramento declarado no documento</h4>
            <p className="mt-2 text-sm text-slate-500">A data abaixo pertence ao diário original. A importação mantém a conferência acadêmica pendente e não encerra o período nem promove alunos.</p>
          </div>
          {history.metadata?.closure?.length ? history.metadata.closure.map((field, index) => (
            <div key={index} className="rounded-xl border border-slate-200 p-4">
              <p className="mb-2 text-sm font-bold text-[#001a33]">Data declarada: {historicalDate(field?.declaredDate || field?.value)}</p>
              <HistoricalField field={field} />
            </div>
          )) : <p className="text-sm text-slate-500">Data de encerramento não informada no documento.</p>}
          <div>
            <h4 className="mb-3 text-sm font-bold text-[#001a33]">Entrega à secretaria declarada no documento</h4>
            {history.metadata?.submission?.length ? history.metadata.submission.map((field, index) => <HistoricalField key={index} field={field} />)
              : <p className="text-sm text-slate-500">—</p>}
          </div>
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">O fechamento e o PDF preenchido aguardam a conferência dos registros importados.</p>
        </div>
      )}
    </section>
  </>
);

const SummaryItem = ({ label, value, state }: { label: string; value: string; state?: string }) => (
  <div>
    <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</dt>
    <dd className="mt-1 text-lg font-bold text-[#001a33]">{value}</dd>
    <ReviewBadge state={state} />
  </div>
);

export default DiarioHistoricoTabs;
