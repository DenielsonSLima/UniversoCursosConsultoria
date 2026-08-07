import type { SecretariaFinanceiroController } from '../hooks/useSecretariaFinanceiroController';
import DebtWorkspace from './DebtWorkspace';

const BatchFinancePanel = ({
  controller,
}: {
  controller: SecretariaFinanceiroController;
}) => (
  <div className="space-y-5 animate-fadeIn">
    <div>
      <h4 className="text-lg font-black uppercase tracking-tight text-[#001a33]">Financeiro em lote</h4>
      <p className="mt-1 text-xs font-semibold text-slate-500">
        Escolha um curso ou confira todos. Dentro de cada curso, as cobranças são agrupadas por aluno.
      </p>
    </div>
    <label className="block">
      <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
        Curso / turma
      </span>
      <select
        value={controller.selectedCourseKey}
        onChange={(event) => controller.setSelectedCourseKey(event.target.value)}
        className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm font-black text-[#001a33] outline-none focus:border-cyan-400"
      >
        <option value="todos">Todos os cursos com valores em aberto</option>
        {controller.courseOptions.map((course) => (
          <option key={course.key} value={course.key}>
            {course.cursoNome} · {course.modalidade} · {course.rows.length} cobrança(s)
          </option>
        ))}
      </select>
    </label>
    <DebtWorkspace
      rows={controller.batchRows}
      loading={controller.allRowsLoading}
      error={controller.allRowsError}
      onReceive={controller.settlement.open}
    />
  </div>
);

export default BatchFinancePanel;
