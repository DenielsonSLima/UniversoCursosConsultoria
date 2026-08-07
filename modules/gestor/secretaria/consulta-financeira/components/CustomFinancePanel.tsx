import { Plus, Search, Trash2, X } from 'lucide-react';
import type { SecretariaFinanceiroController } from '../hooks/useSecretariaFinanceiroController';
import DebtWorkspace from './DebtWorkspace';

const CustomFinancePanel = ({
  controller,
}: {
  controller: SecretariaFinanceiroController;
}) => (
  <div className="space-y-5 animate-fadeIn">
    <div>
      <h4 className="text-lg font-black uppercase tracking-tight text-[#001a33]">Seleção personalizada</h4>
      <p className="mt-1 text-xs font-semibold text-slate-500">
        Adicione alunos de cursos diferentes e confira tudo em um único agrupamento.
      </p>
    </div>
    <div className="relative">
      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={19} />
      <input
        value={controller.customSearch}
        onChange={(event) => controller.setCustomSearch(event.target.value)}
        placeholder="Buscar aluno, CPF ou curso"
        className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3.5 pl-12 pr-4 text-sm font-semibold text-slate-700 outline-none transition focus:border-cyan-400 focus:bg-white"
      />
    </div>

    {controller.customSearchNormalized.length >= 2 ? (
      <div className="max-h-72 space-y-2 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-2">
        {controller.customCandidates.map((student) => {
          const added = controller.customSelectedSet.has(student.id);
          return (
            <button
              key={student.id}
              type="button"
              disabled={added}
              onClick={() => controller.addCustomStudent(student.id)}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-100 bg-white p-3 text-left disabled:opacity-55"
            >
              <span>
                <span className="block text-xs font-black uppercase text-[#001a33]">
                  {student.nome}
                </span>
                <span className="mt-1 block text-[10px] font-semibold text-slate-500">
                  CPF: {student.cpf || 'não informado'} · {Array.from(student.courses).join(', ')}
                </span>
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase text-cyan-700">
                {added ? 'Adicionado' : <><Plus size={13} /> Adicionar</>}
              </span>
            </button>
          );
        })}
        {!controller.customCandidates.length && !controller.allRowsLoading ? (
          <p className="p-4 text-center text-xs font-bold text-slate-400">
            Nenhum aluno com valor em aberto encontrado.
          </p>
        ) : null}
      </div>
    ) : null}

    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
          Alunos selecionados ({controller.selectedCustomStudents.length})
        </p>
        {controller.selectedCustomStudents.length ? (
          <button
            type="button"
            onClick={controller.clearCustomStudents}
            className="inline-flex items-center gap-1 text-[10px] font-black uppercase text-rose-600"
          >
            <Trash2 size={13} /> Limpar
          </button>
        ) : null}
      </div>
      {controller.selectedCustomStudents.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {controller.selectedCustomStudents.map((student) => (
            <span
              key={student.id}
              className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-white px-3 py-2 text-[10px] font-black uppercase text-cyan-900"
            >
              {student.nome}
              <button
                type="button"
                onClick={() => controller.removeCustomStudent(student.id)}
                className="text-slate-400 hover:text-rose-600"
                aria-label={`Remover ${student.nome}`}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-xs font-semibold text-slate-400">Nenhum aluno adicionado.</p>
      )}
    </div>

    <DebtWorkspace
      rows={controller.customRows}
      loading={controller.allRowsLoading}
      error={controller.allRowsError}
      onReceive={controller.settlement.open}
    />
  </div>
);

export default CustomFinancePanel;
