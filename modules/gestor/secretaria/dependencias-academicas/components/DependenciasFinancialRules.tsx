import { BadgePercent, CalendarClock, Landmark, Loader2, Save, Scale } from 'lucide-react';
import { useRef, useState } from 'react';
import type { UseMutationResult } from '@tanstack/react-query';
import type {
  DependenciaDisciplinaConfiguravel,
  DependenciaPoliticaInput,
  DependenciaRegraFinanceira,
} from '../dependencias-academicas.types';
import {
  resolveDependencyPolicyAttempt,
  type DependencyPolicyAttempt,
} from '../dependencias-academicas.finance';
import {
  formatCurrency,
  formatDate,
} from '../dependencias-academicas.utils';

interface DependenciasFinancialRulesProps {
  poloId: string;
  rules: DependenciaRegraFinanceira[];
  disciplines: DependenciaDisciplinaConfiguravel[];
  mutation: UseMutationResult<void, Error, DependenciaPoliticaInput>;
}

const createIdempotencyKey = () => (
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `dependencia-politica-${Date.now()}-${Math.random().toString(36).slice(2)}`
);

const DependenciasFinancialRules = ({
  poloId,
  rules,
  disciplines,
  mutation,
}: DependenciasFinancialRulesProps) => {
  const [disciplineId, setDisciplineId] = useState('');
  const [percentage, setPercentage] = useState('50');
  const policyAttemptRef = useRef<DependencyPolicyAttempt | null>(null);

  const selectDiscipline = (nextId: string) => {
    setDisciplineId(nextId);
    const currentRule = rules.find((rule) => rule.disciplinaId === nextId);
    if (currentRule) {
      setPercentage(String(currentRule.percentual));
      return;
    }
    const discipline = disciplines.find((item) => item.id === nextId);
    setPercentage(
      discipline?.cargaHoraria !== null
        && discipline?.cargaHoraria !== undefined
        && discipline.cargaHoraria <= 40
        ? '50'
        : '100',
    );
  };

  const save = () => {
    const parsedPercentage = Number(percentage.replace(',', '.'));
    if (
      !disciplineId
      || !Number.isFinite(parsedPercentage)
      || parsedPercentage < 1
      || parsedPercentage > 1000
    ) return;
    const multiplier = parsedPercentage / 100;
    const attempt = resolveDependencyPolicyAttempt(
      policyAttemptRef.current,
      {
        poloId,
        disciplinaId: disciplineId,
        multiplicadorParcela: multiplier,
      },
      createIdempotencyKey,
    );
    policyAttemptRef.current = attempt;
    mutation.mutate({
      poloId,
      disciplinaId: disciplineId,
      multiplicadorParcela: multiplier,
      idempotencyKey: attempt.idempotencyKey,
    }, {
      onSuccess: () => {
        if (policyAttemptRef.current?.fingerprint === attempt.fingerprint) {
          policyAttemptRef.current = null;
        }
      },
    });
  };

  return (
  <div className="space-y-4">
    <div className="grid gap-3 md:grid-cols-2">
      <article className="rounded-3xl border border-cyan-200 bg-cyan-50 p-5 text-cyan-950">
        <BadgePercent size={22} className="text-cyan-700" />
        <p className="mt-4 text-[10px] font-black uppercase tracking-[0.16em] text-cyan-700">Faixa institucional</p>
        <h3 className="mt-1 text-xl font-black">Até 40h</h3>
        <p className="mt-1 text-sm font-semibold text-cyan-800">Referência descritiva: 50% de uma parcela. O valor canônico vem exclusivamente da prévia do backend.</p>
      </article>
      <article className="rounded-3xl border border-blue-200 bg-blue-50 p-5 text-blue-950">
        <Scale size={22} className="text-blue-700" />
        <p className="mt-4 text-[10px] font-black uppercase tracking-[0.16em] text-blue-700">Faixa institucional</p>
        <h3 className="mt-1 text-xl font-black">Acima de 40h</h3>
        <p className="mt-1 text-sm font-semibold text-blue-800">Referência descritiva: 100% de uma parcela. O navegador nunca calcula nem substitui o snapshot do servidor.</p>
      </article>
    </div>

    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
        <div className="flex-1">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-700">
            Configuração por disciplina
          </p>
          <h3 className="mt-1 text-base font-black text-[#001a33]">
            Sobrescrever a faixa institucional
          </h3>
          <p className="mt-1 text-xs font-medium text-slate-500">
            O percentual é versionado no servidor. Cobranças já confirmadas preservam o snapshot anterior.
          </p>
        </div>
        <label className="block min-w-0 lg:w-72">
          <span className="text-[9px] font-black uppercase tracking-wider text-slate-500">Disciplina técnica do polo</span>
          <select
            value={disciplineId}
            onChange={(event) => selectDiscipline(event.target.value)}
            className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700"
          >
            <option value="">Selecione</option>
            {disciplines.map((discipline) => (
              <option key={discipline.id} value={discipline.id}>
                {discipline.nome}
                {discipline.cursoNome ? ` — ${discipline.cursoNome}` : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="block lg:w-36">
          <span className="text-[9px] font-black uppercase tracking-wider text-slate-500">% da parcela</span>
          <input
            type="number"
            min="1"
            max="1000"
            step="0.01"
            value={percentage}
            onChange={(event) => setPercentage(event.target.value)}
            className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700"
          />
        </label>
        <button
          type="button"
          onClick={save}
          disabled={!disciplineId || mutation.isPending}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#001a33] px-4 text-[9px] font-black uppercase tracking-wider text-white disabled:opacity-45"
        >
          {mutation.isPending
            ? <Loader2 size={14} className="animate-spin" />
            : <Save size={14} />}
          Salvar nova versão
        </button>
      </div>
      {mutation.isSuccess ? (
        <p className="mt-3 text-xs font-bold text-emerald-700">Regra versionada com sucesso.</p>
      ) : null}
      {mutation.isError ? (
        <p className="mt-3 text-xs font-bold text-rose-700">{mutation.error.message}</p>
      ) : null}
      {!disciplines.length ? (
        <p className="mt-3 text-xs font-semibold text-amber-700">
          Nenhuma disciplina de curso técnico foi ofertada neste polo.
        </p>
      ) : null}
    </section>

    {!rules.length ? (
      <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-10 text-center">
        <Landmark size={28} className="mx-auto text-slate-300" />
        <p className="mt-3 text-sm font-black uppercase tracking-tight text-[#001a33]">
          Regras ainda não retornadas pelo serviço
        </p>
        <p className="mx-auto mt-1 max-w-lg text-xs font-medium text-slate-500">
          A cobrança só poderá ser confirmada quando a prévia segura do backend informar a faixa, a base e o valor final.
        </p>
      </div>
    ) : (
      <>
        <div className="space-y-3 md:hidden">
          {rules.map((rule) => (
            <article key={rule.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-black text-[#001a33]">{rule.disciplinaNome}</p>
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">{rule.faixa}</p>
                </div>
                <span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-black text-cyan-800">{rule.percentual}%</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] font-bold text-slate-500">
                <span>CH: {rule.cargaHoraria ?? '—'}h</span>
                <span>Base: {formatCurrency(rule.valorReferencia)}</span>
                <span className="col-span-2">Vigência: {formatDate(rule.vigenciaInicio)}</span>
              </div>
            </article>
          ))}
        </div>
        <div className="hidden overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm md:block">
          <table className="w-full text-left">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">
                <th className="px-4 py-3">Disciplina / regra</th>
                <th className="px-4 py-3">Carga horária</th>
                <th className="px-4 py-3">Faixa</th>
                <th className="px-4 py-3">Percentual</th>
                <th className="px-4 py-3">Referência</th>
                <th className="px-4 py-3">Vigência / origem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {rules.map((rule) => (
                <tr key={rule.id}>
                  <td className="px-4 py-4 font-black text-[#001a33]">{rule.disciplinaNome}</td>
                  <td className="px-4 py-4">{rule.cargaHoraria ?? '—'}h</td>
                  <td className="px-4 py-4">{rule.faixa}</td>
                  <td className="px-4 py-4 font-black text-cyan-800">{rule.percentual}%</td>
                  <td className="px-4 py-4">{formatCurrency(rule.valorReferencia)}</td>
                  <td className="px-4 py-4">
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500">
                      <CalendarClock size={12} /> {formatDate(rule.vigenciaInicio)}
                    </span>
                    <p className="mt-1 text-[10px] font-bold text-slate-400">{rule.origem}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    )}
  </div>
  );
};

export default DependenciasFinancialRules;
