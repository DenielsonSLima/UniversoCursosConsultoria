import React, { useRef, useState } from 'react';
import { Loader2, PlusCircle } from 'lucide-react';
import type { ConvenioParceiroOption, CriarConvenioInput } from '../convenios.types';
import {
  createConvenioRequestId,
  formatConvenioMonthInput,
  parseConvenioMonthInput,
} from '../convenios.presentation';
import ConvenioModalShell from './ConvenioModalShell';

interface ConvenioFormModalProps {
  poloId: string;
  parceiros: ConvenioParceiroOption[];
  parceirosLoading: boolean;
  parceirosError: boolean;
  isPending: boolean;
  error?: Error | null;
  onClose: () => void;
  onConfirm: (input: CriarConvenioInput) => void;
}

const currentMonthInMaceio = () => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Maceio',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  return `${year}-${month}`;
};

const ConvenioFormModal: React.FC<ConvenioFormModalProps> = ({
  poloId,
  parceiros,
  parceirosLoading,
  parceirosError,
  isPending,
  error,
  onClose,
  onConfirm,
}) => {
  const [parceiroId, setParceiroId] = useState('');
  const [competencia, setCompetencia] = useState(() => formatConvenioMonthInput(currentMonthInMaceio()));
  const [observacao, setObservacao] = useState('');
  const requestIdRef = useRef(createConvenioRequestId());
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const competenciaCanonica = parseConvenioMonthInput(competencia);
    const parceiro = parceiros.find((item) => item.id === parceiroId);
    if (!parceiro || !competenciaCanonica) return;
    onConfirm({
      requestId: requestIdRef.current,
      poloId,
      parceiroId: parceiro.id,
      nome: parceiro.nome,
      competencia: `${competenciaCanonica}-01`,
      observacao: observacao.trim() || undefined,
    });
  };

  return (
    <ConvenioModalShell
      title="Novo convênio"
      subtitle="Cadastre o convênio e abra sua primeira competência com saldo inicial zero."
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-5 p-6">
        <label className="block">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Faculdade parceira *</span>
          <select
            value={parceiroId}
            onChange={(event) => setParceiroId(event.target.value)}
            disabled={parceirosLoading || parceirosError}
            required
            className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-[#001a33] outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 disabled:opacity-60"
          >
            <option value="">
              {parceirosLoading
                ? 'Carregando faculdades parceiras...'
                : parceirosError
                  ? 'Não foi possível carregar as faculdades'
                  : 'Selecione uma faculdade parceira'}
            </option>
            {parceiros.map((item) => (
              <option key={item.id} value={item.id}>{item.nome}</option>
            ))}
          </select>
          {!parceirosLoading && !parceirosError && parceiros.length === 0 ? (
            <span className="mt-2 block text-xs font-bold text-amber-700">
              Nenhuma PJ classificada como Faculdade parceira / afiliado está disponível neste polo.
            </span>
          ) : null}
        </label>

        <div className="grid grid-cols-1 gap-4">
          <label className="block">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Primeiro mês *</span>
            <input
              type="text"
              inputMode="numeric"
              value={competencia}
              onChange={(event) => setCompetencia(formatConvenioMonthInput(event.target.value))}
              placeholder="MM/AAAA"
              pattern="(0[1-9]|1[0-2])/[0-9]{4}"
              title="Informe o mês no formato MM/AAAA"
              maxLength={7}
              required
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:border-cyan-500"
            />
          </label>
        </div>

        <label className="block">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Observação</span>
          <textarea
            value={observacao}
            onChange={(event) => setObservacao(event.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Condições ou finalidade deste recurso."
            className="mt-1 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 outline-none focus:border-cyan-500"
          />
        </label>

        {error ? <p role="alert" className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">{error.message}</p> : null}

        <div className="flex justify-end gap-3 border-t border-slate-100 pt-5">
          <button type="button" onClick={onClose} disabled={isPending} className="rounded-xl border border-slate-200 px-5 py-3 text-xs font-black uppercase tracking-wide text-slate-600 disabled:opacity-50">Cancelar</button>
          <button type="submit" disabled={isPending || !parceiroId || parceirosLoading || parceirosError} className="inline-flex items-center gap-2 rounded-xl bg-cyan-700 px-5 py-3 text-xs font-black uppercase tracking-wide text-white shadow-lg shadow-cyan-950/15 hover:bg-cyan-800 disabled:opacity-50">
            {isPending ? <Loader2 size={15} className="animate-spin" /> : <PlusCircle size={15} />}
            Criar convênio
          </button>
        </div>
      </form>
    </ConvenioModalShell>
  );
};

export default ConvenioFormModal;
