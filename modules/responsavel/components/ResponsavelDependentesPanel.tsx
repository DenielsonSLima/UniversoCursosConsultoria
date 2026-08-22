import React from 'react';
import { HeartHandshake, Loader2, RefreshCw } from 'lucide-react';
import type { ResponsavelDependente } from '../responsavel.contract';

const relationshipLabel: Record<ResponsavelDependente['parentesco'], string> = {
  MAE: 'Mãe',
  PAI: 'Pai',
  TUTOR: 'Tutor(a)',
  GUARDIAO_JUDICIAL: 'Guardião(ã) judicial',
  OUTRO: 'Outro vínculo',
};

interface ResponsavelDependentesPanelProps {
  dependentes: readonly ResponsavelDependente[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

const ResponsavelDependentesPanel: React.FC<ResponsavelDependentesPanelProps> = ({
  dependentes,
  isLoading,
  isError,
  onRetry,
}) => {
  if (isLoading) {
    return (
      <div className="flex min-h-52 items-center justify-center gap-3 rounded-3xl border border-slate-200 bg-white text-sm font-bold text-slate-500">
        <Loader2 size={20} className="animate-spin text-purple-600" /> Conferindo dependentes vinculados…
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-3xl border border-rose-100 bg-rose-50 p-6">
        <p className="text-sm font-black text-rose-800">Não foi possível conferir os dependentes deste perfil.</p>
        <p className="mt-1 text-xs font-medium leading-relaxed text-rose-700">Nenhuma informação acadêmica é exibida enquanto o serviço autorizado não responder.</p>
        <button type="button" onClick={onRetry} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-black text-rose-700 shadow-sm ring-1 ring-rose-100"><RefreshCw size={15} /> Tentar novamente</button>
      </div>
    );
  }

  if (dependentes.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center">
        <HeartHandshake className="mx-auto text-slate-400" size={27} />
        <p className="mt-3 text-sm font-black text-[#001a33]">Nenhum dependente disponível</p>
        <p className="mx-auto mt-1 max-w-lg text-xs font-medium leading-relaxed text-slate-500">A secretaria precisa concluir um vínculo verificado e vigente antes de ele aparecer neste portal.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {dependentes.map((dependente) => (
        <article key={dependente.vinculoId} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-base font-black text-[#001a33]">{dependente.nome}</p>
              <p className="mt-1 text-xs font-bold text-slate-500">{relationshipLabel[dependente.parentesco]}</p>
            </div>
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-emerald-700">Vínculo ativo</span>
          </div>
          <div className="mt-4 rounded-2xl bg-slate-50 p-3">
            <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Escopo informado pelo serviço</p>
            <p className="mt-1 text-xs font-bold text-slate-700">{dependente.poloIds.length === 1 ? '1 polo vinculado' : `${dependente.poloIds.length} polos vinculados`}</p>
          </div>
        </article>
      ))}
    </div>
  );
};

export default ResponsavelDependentesPanel;
