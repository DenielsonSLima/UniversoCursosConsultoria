import React, { useState } from 'react';
import { BookOpen, Layers, Loader2 } from 'lucide-react';
import { Turma } from '../../../../gestao.types';
import DiarioClasse from './DiarioClasse';
import TechnicalDataError from '../TechnicalDataError';
import TurmaDiarioCard from './TurmaDiarioCard';
import { useTurmaDiarios } from './hooks/useTurmaDiarios';
import {
  DiarioExportMode,
  TurmaDiarioDisciplina,
  TurmaDiarioSelection,
} from './turma-diarios.types';

interface TurmaDiariosProps {
  turma: Turma;
}

const TurmaDiarios: React.FC<TurmaDiariosProps> = ({ turma }) => {
  const [selection, setSelection] = useState<TurmaDiarioSelection | null>(null);
  const diariosQuery = useTurmaDiarios(turma.id);
  const modules = diariosQuery.data || [];

  const selectDiary = (
    disciplina: TurmaDiarioDisciplina,
    moduloNome: string,
    exportMode?: DiarioExportMode,
  ) => {
    setSelection({ disciplina, moduloNome, exportMode });
  };

  if (diariosQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-[#001a33]" size={32} />
        <span className="ml-3 font-bold text-slate-500">Carregando diários de classe...</span>
      </div>
    );
  }

  if (diariosQuery.isError) {
    return (
      <TechnicalDataError
        title="Diários não carregados"
        message="A grade foi ocultada para não exibir dados acadêmicos incompletos."
        retrying={diariosQuery.isFetching}
        onRetry={() => { void diariosQuery.refetch(); }}
      />
    );
  }

  if (selection) {
    return (
      <DiarioClasse
        disciplina={selection.disciplina}
        moduloNome={selection.moduloNome}
        turma={turma}
        onBack={() => setSelection(null)}
        initialExportMode={selection.exportMode}
        returnToListOnExportClose={Boolean(selection.exportMode)}
      />
    );
  }

  return (
    <section>
      <div className="mb-7">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-blue-600">Gestão acadêmica</p>
        <h3 className="mt-1 text-xl font-black text-[#001a33]">Diários de classe</h3>
        <p className="mt-1 text-xs font-medium text-slate-500">
          Acompanhe o período, a presença geral e abra a versão preenchida ou manual de cada diário.
        </p>
      </div>

      {modules.length === 0 ? (
        <div className="flex flex-col items-center rounded-[2rem] border border-slate-100 bg-white py-20 text-center text-slate-400 shadow-sm">
          <BookOpen size={48} className="mb-4 text-slate-300" />
          <p className="text-sm font-bold">Nenhuma disciplina cadastrada na grade deste curso.</p>
        </div>
      ) : (
        <div className="space-y-10">
          {modules.map((module) => (
            <section key={module.id}>
              <div className="mb-4 flex items-center gap-3 px-1">
                <div className="rounded-lg bg-slate-200/60 p-2 text-slate-500">
                  <Layers size={15} />
                </div>
                <h4 className="text-xs font-black uppercase tracking-[0.18em] text-slate-600">
                  {module.nome}
                </h4>
                <span className="rounded-full bg-white px-2 py-1 text-[9px] font-black text-slate-400 ring-1 ring-slate-200">
                  {module.disciplinas.length}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {module.disciplinas.map((disciplina) => (
                  <TurmaDiarioCard
                    key={disciplina.id}
                    disciplina={disciplina}
                    onOpen={() => selectDiary(disciplina, module.nome)}
                    onOpenPdf={(mode) => selectDiary(disciplina, module.nome, mode)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  );
};

export default TurmaDiarios;
