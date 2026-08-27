import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  FileSearch,
  Filter,
  Loader2,
  Search,
  SquareCheckBig,
  SquareMinus,
} from 'lucide-react';
import type { CarnesAlunosController } from '../hooks/useCarnesAlunosController';
import BaneseDocumentGroupCard from './BaneseDocumentGroupCard';
import CarnesSelectionSummary from './CarnesSelectionSummary';

const modeCopy = {
  individual: {
    title: 'Carnê individual',
    description: 'Busque o aluno por nome, CPF ou matrícula e escolha uma matrícula.',
    placeholder: 'Nome, CPF ou matrícula do aluno',
  },
  batch: {
    title: 'Carnês em lote',
    description: 'Refine por curso e turma, confira cada matrícula e monte o lote.',
    placeholder: 'Buscar aluno, matrícula, curso ou turma (opcional)',
  },
  custom: {
    title: 'Seleção personalizada',
    description: 'Pesquise e adicione matrículas de alunos e cursos diferentes.',
    placeholder: 'Nome, CPF, matrícula, curso ou turma',
  },
};

interface CarnesWorkspaceProps {
  controller: CarnesAlunosController;
}

const CarnesWorkspace = ({ controller }: CarnesWorkspaceProps) => {
  const copy = modeCopy[controller.mode];

  const renderResults = () => {
    if (!controller.hasPolo) {
      return (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
          <AlertCircle className="mx-auto text-amber-600" size={28} />
          <p className="mt-3 text-sm font-black text-amber-900">Selecione um polo para consultar os documentos.</p>
        </div>
      );
    }
    if (!controller.canQuery) {
      return (
        <div className="flex min-h-52 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
          <FileSearch className="text-slate-300" size={34} />
          <p className="mt-3 text-sm font-black text-slate-700">Digite pelo menos dois caracteres para buscar.</p>
          <p className="mt-1 text-xs font-semibold text-slate-400">A consulta retornará grupos por matrícula.</p>
        </div>
      );
    }
    if (controller.loading) {
      return (
        <div className="flex min-h-52 flex-col items-center justify-center gap-3 text-center text-slate-500" role="status">
          <Loader2 className="animate-spin text-emerald-700" size={30} />
          <p className="text-xs font-black uppercase tracking-wider">Consultando títulos Banese existentes...</p>
        </div>
      );
    }
    if (controller.error) {
      return (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center">
          <AlertCircle className="mx-auto text-rose-600" size={28} />
          <p className="mt-3 text-sm font-black text-rose-800">Não foi possível consultar os carnês.</p>
          <p className="mx-auto mt-1 max-w-lg text-xs font-semibold leading-relaxed text-rose-600">{controller.error}</p>
          <button
            type="button"
            onClick={() => { void controller.retry(); }}
            className="mt-4 rounded-xl bg-rose-700 px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-white hover:bg-rose-800"
          >
            Tentar novamente
          </button>
        </div>
      );
    }
    if (!controller.visibleGroups.length) {
      return (
        <div className="flex min-h-52 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
          <FileSearch className="text-slate-300" size={34} />
          <p className="mt-3 text-sm font-black text-slate-700">Nenhum grupo documental encontrado.</p>
          <p className="mt-1 max-w-lg text-xs font-semibold text-slate-400">
            Somente matrículas com títulos Banese existentes e documentos válidos aparecem aqui.
          </p>
        </div>
      );
    }

    return (
      <>
        {controller.mode === 'batch' ? (
          <div className="mb-3 flex flex-col gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-emerald-950">Ação coletiva desta página</p>
              <p className="mt-0.5 text-[10px] font-semibold text-emerald-800">
                A seleção é aplicada por inteiro; se ultrapassar o limite, nada será adicionado.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={controller.allVisibleSelected || controller.generating}
                onClick={controller.selectVisibleGroups}
                className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-emerald-700 px-3 text-[10px] font-black uppercase tracking-wider text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                <SquareCheckBig size={14} /> Selecionar matrículas desta página
              </button>
              <button
                type="button"
                disabled={!controller.someVisibleSelected || controller.generating}
                onClick={controller.removeVisibleGroupsFromSelection}
                className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-emerald-200 bg-white px-3 text-[10px] font-black uppercase tracking-wider text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300"
              >
                <SquareMinus size={14} /> Remover visíveis
              </button>
            </div>
          </div>
        ) : null}

        <div className="space-y-3">
          {controller.visibleGroups.map((group) => (
            <BaneseDocumentGroupCard
              key={group.id}
              group={group}
              mode={controller.mode}
              selected={controller.selectedIds.has(group.id)}
              disabled={controller.generating}
              onToggle={controller.toggleGroup}
            />
          ))}
        </div>

        <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">
            Página {controller.page} de {controller.totalPages} · {controller.totalGroups} grupo(s)
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={controller.page <= 1 || controller.generating}
              onClick={() => controller.setPage(Math.max(1, controller.page - 1))}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-wider text-slate-600 transition hover:border-emerald-300 hover:text-emerald-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ArrowLeft size={14} /> Anterior
            </button>
            <button
              type="button"
              disabled={controller.page >= controller.totalPages || controller.generating}
              onClick={() => controller.setPage(Math.min(controller.totalPages, controller.page + 1))}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-wider text-slate-600 transition hover:border-emerald-300 hover:text-emerald-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Próxima <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </>
    );
  };

  return (
    <div
      id="carnes-alunos-workspace"
      role="tabpanel"
      aria-labelledby={`carnes-mode-tab-${controller.mode}`}
      tabIndex={0}
      className="p-5 outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-emerald-100 md:p-7"
    >
      <div className="mb-5">
        <h3 className="text-lg font-black uppercase tracking-tight text-[#001a33]">{copy.title}</h3>
        <p className="mt-1 text-xs font-semibold text-slate-500">{copy.description}</p>
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
        <label className="relative block">
          <span className="sr-only">{copy.placeholder}</span>
          <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={19} />
          <input
            type="search"
            value={controller.search}
            disabled={controller.generating}
            onChange={(event) => controller.changeSearch(event.target.value)}
            placeholder={copy.placeholder}
            autoComplete="off"
            className="min-h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-12 pr-4 text-sm font-semibold text-[#001a33] outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-100 disabled:opacity-50"
          />
        </label>
        {controller.mode === 'batch' ? (
          <span className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-100 px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-600">
            <Filter size={16} /> Filtros do lote
          </span>
        ) : null}
      </div>

      {controller.mode === 'batch' ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label>
            <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-500">Curso</span>
            <select
              value={controller.courseId}
              disabled={controller.generating}
              onChange={(event) => controller.changeCourse(event.target.value)}
              className="min-h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 disabled:opacity-50"
            >
              <option value="">Todos os cursos</option>
              {controller.courseOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
            </select>
          </label>
          <label>
            <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-500">Turma</span>
            <select
              value={controller.classId}
              disabled={controller.generating}
              onChange={(event) => controller.changeClass(event.target.value)}
              className="min-h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 disabled:opacity-50"
            >
              <option value="">Todas as turmas</option>
              {controller.classOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
            </select>
          </label>
        </div>
      ) : null}

      <div className="mt-6 grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-label="Matrículas com documentos Banese">{renderResults()}</section>
        <div className="xl:sticky xl:top-4">
          <CarnesSelectionSummary controller={controller} />
        </div>
      </div>
    </div>
  );
};

export default CarnesWorkspace;
