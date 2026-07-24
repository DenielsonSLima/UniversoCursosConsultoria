import { Loader2, Search } from 'lucide-react';
import SecretariaAlunoSearchCard from '../../shared/SecretariaAlunoSearchCard';
import type { SecretariaFinanceiroController } from '../hooks/useSecretariaFinanceiroController';
import DebtWorkspace from './DebtWorkspace';

const IndividualFinancePanel = ({
  controller,
}: {
  controller: SecretariaFinanceiroController;
}) => (
  <div className="space-y-5 animate-fadeIn">
    <div>
      <h4 className="text-lg font-black uppercase tracking-tight text-[#001a33]">Financeiro individual</h4>
      <p className="mt-1 text-xs font-semibold text-slate-500">
        Busque por nome ou CPF e visualize as cobranças separadas por curso.
      </p>
    </div>
    <div className="relative">
      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={19} />
      <input
        value={controller.searchTerm}
        onChange={(event) => controller.changeSearchTerm(event.target.value)}
        placeholder="Nome ou CPF do aluno"
        className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3.5 pl-12 pr-4 text-sm font-semibold text-slate-700 outline-none transition focus:border-cyan-400 focus:bg-white"
      />
    </div>
    {controller.alunosFetching ? (
      <div className="flex justify-center py-5">
        <Loader2 className="animate-spin text-cyan-700" />
      </div>
    ) : null}
    {!controller.selectedAluno
      && controller.normalizedTerm.length >= 2
      && !controller.alunosFetching ? (
        <div className="space-y-2">
          {controller.alunos.map((aluno) => (
            <SecretariaAlunoSearchCard
              key={aluno.id}
              {...aluno}
              tone="cyan"
              actionLabel="Abrir financeiro"
              onClick={() => controller.setSelectedAluno(aluno)}
            />
          ))}
          {controller.alunos.length === 0 ? (
            <p className="py-4 text-center text-sm font-semibold text-slate-400">
              Nenhum aluno encontrado.
            </p>
          ) : null}
        </div>
      ) : null}
    {controller.selectedAluno ? (
      <>
        <SecretariaAlunoSearchCard
          {...controller.selectedAluno}
          tone="cyan"
          selected
          actionLabel="Trocar aluno"
          onClick={() => controller.setSelectedAluno(null)}
        />
        <DebtWorkspace
          rows={controller.individualRows}
          loading={controller.individualRowsLoading}
          error={controller.individualRowsError}
          onReceive={controller.settlement.open}
        />
      </>
    ) : (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-8 text-center text-xs font-bold uppercase tracking-wide text-slate-400">
        Selecione um aluno para abrir o financeiro.
      </div>
    )}
  </div>
);

export default IndividualFinancePanel;
