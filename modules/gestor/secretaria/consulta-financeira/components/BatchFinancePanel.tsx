import InstitutionalSelect from '../../../../shared/components/InstitutionalSelect';
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
      <InstitutionalSelect
        ariaLabel="Curso ou turma dos recebimentos"
        value={controller.selectedCourseKey}
        onValueChange={controller.setSelectedCourseKey}
        options={[{ value: 'todos', label: 'Todos os cursos com valores em aberto' }, ...controller.courseOptions.map((course) => ({
          value: course.key,
          label: `${course.cursoNome} · ${course.modalidade} · ${course.rows.length} cobrança(s)`,
        }))]}
        className="mt-2 w-full"
      />
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
