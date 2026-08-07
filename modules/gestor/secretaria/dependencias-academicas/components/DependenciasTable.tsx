import { ArrowRight, Banknote, BookOpen, CalendarDays, Loader2, UserRound } from 'lucide-react';
import type { DependenciaAcademica } from '../dependencias-academicas.types';
import { hasCompleteDependencyBoleto } from '../dependencias-academicas.finance';
import {
  formatCurrency,
  formatDate,
  formatGrade,
  normalizeStatus,
} from '../dependencias-academicas.utils';
import DependenciaStatusBadge from './DependenciaStatusBadge';
import type { DependenciasViewMode } from './DependenciasFilters';

interface DependenciasTableProps {
  items: DependenciaAcademica[];
  mode: 'pendentes' | 'programadas' | 'encerradas';
  onEncaminhar: (item: DependenciaAcademica) => void;
  onBoleto: (item: DependenciaAcademica) => void;
  boletoPendingId: string | null;
  viewMode: DependenciasViewMode;
}

const ResultSummary = ({ item }: { item: DependenciaAcademica }) => (
  <div>
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-semibold text-slate-500">
      <span>Nota: <strong className="text-slate-800">{formatGrade(item.notaOriginal)}</strong></span>
      <span>Frequência: <strong className="text-slate-800">{item.frequenciaOriginal ?? '—'}%</strong></span>
    </div>
    {!item.resultadoConsolidado ? (
      <p className="mt-1.5 text-[11px] font-bold leading-relaxed text-amber-800">
        Diário em aberto · resultado provisório, sujeito a alteração.
      </p>
    ) : null}
  </div>
);

const DestinationSummary = ({ item }: { item: DependenciaAcademica }) => (
  <div>
    <p className="font-black text-[#001a33]">{item.turmaDestinoNome || 'Oferta ainda não definida'}</p>
    <p className="mt-1 text-[11px] font-semibold text-slate-500">
      {[item.turmaDestinoCodigo, item.professorNome].filter(Boolean).join(' · ') || 'Aguardando encaminhamento'}
    </p>
  </div>
);

const ActionButton = ({
  item,
  onEncaminhar,
  onBoleto,
  boletoPendingId,
}: {
  item: DependenciaAcademica;
  onEncaminhar: (item: DependenciaAcademica) => void;
  onBoleto: (item: DependenciaAcademica) => void;
  boletoPendingId: string | null;
}) => {
  const status = normalizeStatus(item.status);
  if (
    !item.acionavel
    || !item.resultadoConsolidado
    || status === 'DIARIO_EM_ABERTO'
  ) {
    return (
      <span className="inline-flex min-h-10 items-center justify-center rounded-xl border border-amber-200 bg-amber-50 px-3 text-[10px] font-extrabold uppercase tracking-[0.08em] text-amber-800">
        Aguardar fechamento
      </span>
    );
  }
  const hasBoleto = hasCompleteDependencyBoleto(item.boleto);
  const receivableId = item.boleto.recebivelId || item.cobrancaId;
  const boletoPending = Boolean(
    receivableId && boletoPendingId === receivableId,
  );
  const canEmitExisting = status === 'AGUARDANDO_PAGAMENTO'
    && Boolean(item.boleto.recebivelId || item.cobrancaId);
  if (hasBoleto || canEmitExisting) {
    return (
      <button
        type="button"
        onClick={() => onBoleto(item)}
        disabled={boletoPending}
        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-cyan-200 bg-cyan-50 px-3 text-[10px] font-extrabold uppercase tracking-[0.08em] text-cyan-800 hover:bg-cyan-100 disabled:opacity-50"
      >
        {boletoPending
          ? <Loader2 size={13} className="animate-spin" />
          : <Banknote size={13} />}
        {hasBoleto ? 'Ver boleto' : 'Emitir boleto'}
      </button>
    );
  }
  const canSchedule = [
    'PENDENTE_ENCAMINHAMENTO',
    'AGUARDANDO_OFERTA',
    'CONCLUIDA_REPROVADA',
  ].includes(status);
  if (!canSchedule) return null;
  return (
    <button
      type="button"
      onClick={() => onEncaminhar(item)}
      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#001a33] px-3 text-[10px] font-extrabold uppercase tracking-[0.08em] text-white transition hover:bg-blue-800"
    >
      {status === 'CONCLUIDA_REPROVADA' ? 'Nova tentativa' : 'Encaminhar'}
      <ArrowRight size={13} />
    </button>
  );
};

const DependenciasTable = ({
  items,
  mode,
  onEncaminhar,
  onBoleto,
  boletoPendingId,
  viewMode,
}: DependenciasTableProps) => {
  if (!items.length) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-200 bg-white px-6 py-14 text-center">
        <BookOpen className="mx-auto text-slate-300" size={30} />
        <p className="mt-3 text-sm font-black uppercase tracking-tight text-[#001a33]">
          Nenhuma dependência nesta etapa
        </p>
        <p className="mt-1 text-xs font-medium text-slate-500">
          Os resultados calculados aparecerão aqui, inclusive enquanto o diário estiver aberto.
        </p>
      </div>
    );
  }

  const studentBandByKey = new Map<string, number>();
  items.forEach((item) => {
    const key = item.alunoId || item.matriculaId || item.alunoNome;
    if (!studentBandByKey.has(key)) {
      studentBandByKey.set(key, studentBandByKey.size);
    }
  });
  const studentBand = (item: DependenciaAcademica) => (
    studentBandByKey.get(item.alunoId || item.matriculaId || item.alunoNome) || 0
  );

  if (viewMode === 'cards') {
    return (
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => (
          <article
            key={item.id}
            className={`flex h-full flex-col rounded-3xl border p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md ${
              studentBand(item) % 2 === 0
                ? 'border-slate-200 bg-white'
                : 'border-blue-100 bg-blue-50/45'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-[#001a33]">{item.alunoNome}</p>
                <p className="mt-0.5 text-[11px] font-semibold text-slate-500">
                  {item.cursoNome}
                </p>
              </div>
              <DependenciaStatusBadge status={item.status} />
            </div>
            <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-3">
              <p className="font-black text-slate-900">{item.disciplinaNome}</p>
              <p className="mt-1 text-[11px] font-semibold leading-relaxed text-slate-500">
                {item.cargaHoraria}h · {item.motivoReprovacao}
              </p>
              {mode === 'pendentes' ? <div className="mt-2"><ResultSummary item={item} /></div> : null}
            </div>
            {mode !== 'pendentes' ? (
              <div className="mt-3 flex items-start gap-2 text-xs">
                <CalendarDays size={14} className="mt-0.5 shrink-0 text-blue-600" />
                <DestinationSummary item={item} />
              </div>
            ) : null}
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
              <div className="text-[11px] font-semibold leading-relaxed text-slate-500">
                {!item.resultadoConsolidado
                  ? 'Encaminhamento bloqueado até o fechamento'
                  : item.valor !== null
                    ? formatCurrency(item.valor)
                    : `${item.tentativaNumero}ª tentativa`}
                {item.dataVencimento ? ` · vence ${formatDate(item.dataVencimento)}` : ''}
              </div>
              <ActionButton
                item={item}
                onEncaminhar={onEncaminhar}
                onBoleto={onBoleto}
                boletoPendingId={boletoPendingId}
              />
            </div>
          </article>
        ))}
      </div>
    );
  }

  return (
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] text-left">
            <thead className="border-b border-slate-200 bg-slate-50/90">
              <tr className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-slate-500">
                <th className="px-4 py-3">Aluno / matrícula</th>
                <th className="px-4 py-3">Disciplina</th>
                <th className="px-4 py-3">{mode === 'pendentes' ? 'Resultado acadêmico' : 'Oferta de destino'}</th>
                <th className="px-4 py-3">{mode === 'encerradas' ? 'Resultado final' : 'Financeiro / agenda'}</th>
                <th className="px-4 py-3">Situação</th>
                <th className="px-4 py-3 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item) => (
                <tr
                  key={item.id}
                  data-student-band={studentBand(item) % 2}
                  className={`align-top text-xs text-slate-600 transition-colors ${
                    studentBand(item) % 2 === 0
                      ? 'bg-white hover:bg-slate-50'
                      : 'bg-blue-50/45 hover:bg-blue-50/75'
                  }`}
                >
                  <td className="px-4 py-4">
                    <div className="flex gap-2">
                      <UserRound size={15} className="mt-0.5 shrink-0 text-blue-600" />
                      <div>
                        <p className="font-black text-[#001a33]">{item.alunoNome}</p>
                        <p className="mt-1 text-[11px] font-semibold text-slate-500">
                          {item.cursoNome} · {item.turmaOrigemCodigo || item.turmaOrigemNome}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <p className="font-black text-slate-900">{item.disciplinaNome}</p>
                    <p className="mt-1 text-[11px] font-semibold text-slate-500">
                      {item.cargaHoraria}h · tentativa {item.tentativaNumero}
                    </p>
                  </td>
                  <td className="px-4 py-4">
                    {mode === 'pendentes' ? (
                      <div>
                        <p className="font-black text-rose-700">{item.motivoReprovacao}</p>
                        <div className="mt-1"><ResultSummary item={item} /></div>
                      </div>
                    ) : <DestinationSummary item={item} />}
                  </td>
                  <td className="px-4 py-4">
                    {mode === 'encerradas' ? (
                      <div className="text-[11px] font-semibold">
                        <p>Nota final: <strong>{formatGrade(item.notaFinal)}</strong></p>
                        <p className="mt-1">Frequência: <strong>{item.frequenciaFinal ?? '—'}%</strong></p>
                        <p className="mt-1 text-slate-400">Encerrada em {formatDate(item.dataEncerramento)}</p>
                      </div>
                    ) : (
                      <div className="text-[11px] font-semibold">
                        <p>
                          {!item.resultadoConsolidado
                            ? 'Bloqueado até o fechamento do diário'
                            : item.valor !== null
                              ? formatCurrency(item.valor)
                              : 'Cobrança ainda não gerada'}
                        </p>
                        <p className="mt-1 text-slate-400">
                          {item.proximaAula
                            ? `Próxima aula ${formatDate(item.proximaAula)}`
                            : item.dataVencimento
                              ? `Vence ${formatDate(item.dataVencimento)}`
                              : 'Sem data definida'}
                        </p>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-4"><DependenciaStatusBadge status={item.status} /></td>
                  <td className="px-4 py-4 text-right">
                    <ActionButton
                      item={item}
                      onEncaminhar={onEncaminhar}
                      onBoleto={onBoleto}
                      boletoPendingId={boletoPendingId}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
  );
};

export default DependenciasTable;
