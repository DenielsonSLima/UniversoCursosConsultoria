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

interface DependenciasTableProps {
  items: DependenciaAcademica[];
  mode: 'pendentes' | 'programadas' | 'encerradas';
  onEncaminhar: (item: DependenciaAcademica) => void;
  onBoleto: (item: DependenciaAcademica) => void;
  boletoPendingId: string | null;
}

const ResultSummary = ({ item }: { item: DependenciaAcademica }) => (
  <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-bold text-slate-500">
    <span>Nota: <strong className="text-slate-800">{formatGrade(item.notaOriginal)}</strong></span>
    <span>Frequência: <strong className="text-slate-800">{item.frequenciaOriginal ?? '—'}%</strong></span>
  </div>
);

const DestinationSummary = ({ item }: { item: DependenciaAcademica }) => (
  <div>
    <p className="font-black text-[#001a33]">{item.turmaDestinoNome || 'Oferta ainda não definida'}</p>
    <p className="mt-1 text-[10px] font-bold text-slate-400">
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
        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-cyan-200 bg-cyan-50 px-3 text-[9px] font-black uppercase tracking-wider text-cyan-800 hover:bg-cyan-100 disabled:opacity-50"
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
      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#001a33] px-3 text-[9px] font-black uppercase tracking-wider text-white transition hover:bg-blue-800"
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
}: DependenciasTableProps) => {
  if (!items.length) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-200 bg-white px-6 py-14 text-center">
        <BookOpen className="mx-auto text-slate-300" size={30} />
        <p className="mt-3 text-sm font-black uppercase tracking-tight text-[#001a33]">
          Nenhuma dependência nesta etapa
        </p>
        <p className="mt-1 text-xs font-medium text-slate-500">
          Os registros aparecerão aqui quando o serviço acadêmico consolidar os resultados.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3 lg:hidden">
        {items.map((item) => (
          <article key={item.id} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-[#001a33]">{item.alunoNome}</p>
                <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {item.cursoNome}
                </p>
              </div>
              <DependenciaStatusBadge status={item.status} />
            </div>
            <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-3">
              <p className="font-black text-slate-900">{item.disciplinaNome}</p>
              <p className="mt-1 text-[10px] font-bold text-slate-500">
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
              <div className="text-[10px] font-bold text-slate-500">
                {item.valor !== null ? formatCurrency(item.valor) : `${item.tentativaNumero}ª tentativa`}
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

      <div className="hidden overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm lg:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] text-left">
            <thead className="border-b border-slate-200 bg-slate-50/90">
              <tr className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">
                <th className="px-4 py-3">Aluno / matrícula</th>
                <th className="px-4 py-3">Disciplina</th>
                <th className="px-4 py-3">{mode === 'pendentes' ? 'Reprovação consolidada' : 'Oferta de destino'}</th>
                <th className="px-4 py-3">{mode === 'encerradas' ? 'Resultado final' : 'Financeiro / agenda'}</th>
                <th className="px-4 py-3">Situação</th>
                <th className="px-4 py-3 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item) => (
                <tr key={item.id} className="align-top text-xs text-slate-600 hover:bg-slate-50/60">
                  <td className="px-4 py-4">
                    <div className="flex gap-2">
                      <UserRound size={15} className="mt-0.5 shrink-0 text-blue-600" />
                      <div>
                        <p className="font-black text-[#001a33]">{item.alunoNome}</p>
                        <p className="mt-1 text-[10px] font-bold text-slate-400">
                          {item.cursoNome} · {item.turmaOrigemCodigo || item.turmaOrigemNome}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <p className="font-black text-slate-900">{item.disciplinaNome}</p>
                    <p className="mt-1 text-[10px] font-bold text-slate-400">
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
                      <div className="text-[10px] font-bold">
                        <p>Nota final: <strong>{formatGrade(item.notaFinal)}</strong></p>
                        <p className="mt-1">Frequência: <strong>{item.frequenciaFinal ?? '—'}%</strong></p>
                        <p className="mt-1 text-slate-400">Encerrada em {formatDate(item.dataEncerramento)}</p>
                      </div>
                    ) : (
                      <div className="text-[10px] font-bold">
                        <p>{item.valor !== null ? formatCurrency(item.valor) : 'Cobrança ainda não gerada'}</p>
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
    </>
  );
};

export default DependenciasTable;
