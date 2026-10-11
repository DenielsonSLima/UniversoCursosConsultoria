import type { buildStudentAccessState } from './student-access-state';
import type { StudentAccessRefreshStatus } from './student-access-refresh';

interface StudentAccessSummaryProps {
  state: ReturnType<typeof buildStudentAccessState>;
  accessError?: string | null;
  refreshStatus: StudentAccessRefreshStatus;
  onRefresh?: () => void;
}

const StudentAccessSummary = ({ state, accessError, refreshStatus, onRefresh }: StudentAccessSummaryProps) => {
  const refreshing = refreshStatus === 'idle' || refreshStatus === 'loading';
  const current = refreshStatus === 'ready';
  const summary = refreshing
    ? 'Atualizando a situação do acesso…'
    : current ? state.summary : 'Não foi possível atualizar a situação do acesso.';

  return (
    <div className="mb-5 rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Situação do acesso</p>
          <p role="status" className="mt-1 text-sm font-bold text-slate-800">{summary}</p>
        </div>
        {onRefresh && (
          <button type="button" onClick={onRefresh} disabled={refreshing}
            className="shrink-0 rounded-lg border border-blue-200 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50">
            {refreshing ? 'Atualizando…' : current ? 'Atualizar acesso' : 'Tentar novamente'}
          </button>
        )}
      </div>
      <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-3">
        {[
          ['E-mail', state.emailLabel],
          ['Senha', state.passwordLabel],
          ['Termos de uso', state.termsLabel],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="font-bold text-slate-500">{label}</dt>
            <dd className="mt-1 font-medium text-slate-700">{current ? value : refreshing ? 'Verificando…' : 'Não verificado'}</dd>
          </div>
        ))}
      </dl>
      {!refreshing && !current && (
        <p className="mt-3 text-xs font-semibold text-red-600">Atualize o acesso antes de enviar links ou senhas.</p>
      )}
      {current && accessError && <p className="mt-1 text-xs font-semibold text-red-600">{accessError}</p>}
    </div>
  );
};

export default StudentAccessSummary;
