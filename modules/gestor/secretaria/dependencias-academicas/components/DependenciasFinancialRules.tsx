import {
  BadgePercent,
  CalendarClock,
  Landmark,
  Loader2,
  Pencil,
  RotateCcw,
  Save,
  Scale,
  Trash2,
  X,
} from 'lucide-react';
import { useRef, useState } from 'react';
import type { UseMutationResult } from '@tanstack/react-query';
import type {
  DependenciaDisciplinaConfiguravel,
  DependenciaPoliticaInput,
  DependenciaPoliticaRemocaoInput,
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
  removeMutation: UseMutationResult<void, Error, DependenciaPoliticaRemocaoInput>;
}

const createIdempotencyKey = () => (
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `dependencia-politica-${Date.now()}-${Math.random().toString(36).slice(2)}`
);

const DEFAULT_DEPENDENCY_TERMS = {
  descontoPontualidade: 19.9,
  jurosAtrasoPercentual: 1,
  multaAtrasoPercentual: 2,
};

const decimal = (value: string) => Number(value.replace(',', '.'));

const DependenciasFinancialRules = ({
  poloId,
  rules,
  disciplines,
  mutation,
  removeMutation,
}: DependenciasFinancialRulesProps) => {
  const [disciplineId, setDisciplineId] = useState('');
  const [percentage, setPercentage] = useState('50');
  const [discount, setDiscount] = useState(String(DEFAULT_DEPENDENCY_TERMS.descontoPontualidade));
  const [interest, setInterest] = useState(String(DEFAULT_DEPENDENCY_TERMS.jurosAtrasoPercentual));
  const [penalty, setPenalty] = useState(String(DEFAULT_DEPENDENCY_TERMS.multaAtrasoPercentual));
  const policyAttemptRef = useRef<DependencyPolicyAttempt | null>(null);
  const formRef = useRef<HTMLElement | null>(null);
  const [removingRuleId, setRemovingRuleId] = useState<string | null>(null);

  const selectDiscipline = (nextId: string) => {
    setDisciplineId(nextId);
    const currentRule = rules.find((rule) => rule.disciplinaId === nextId);
    if (currentRule) {
      setPercentage(String(currentRule.percentual));
      setDiscount(String(currentRule.descontoPontualidade));
      setInterest(String(currentRule.jurosAtrasoPercentual));
      setPenalty(String(currentRule.multaAtrasoPercentual));
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
    setDiscount(String(DEFAULT_DEPENDENCY_TERMS.descontoPontualidade));
    setInterest(String(DEFAULT_DEPENDENCY_TERMS.jurosAtrasoPercentual));
    setPenalty(String(DEFAULT_DEPENDENCY_TERMS.multaAtrasoPercentual));
  };

  const editRule = (rule: DependenciaRegraFinanceira) => {
    if (!rule.disciplinaId) return;
    selectDiscipline(rule.disciplinaId);
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const removeRule = (rule: DependenciaRegraFinanceira) => {
    if (!rule.disciplinaId) return;
    removeMutation.mutate({ poloId, politicaId: rule.id }, {
      onSuccess: () => {
        setRemovingRuleId(null);
        if (disciplineId === rule.disciplinaId) {
          setDisciplineId('');
          setPercentage('50');
          setDiscount(String(DEFAULT_DEPENDENCY_TERMS.descontoPontualidade));
          setInterest(String(DEFAULT_DEPENDENCY_TERMS.jurosAtrasoPercentual));
          setPenalty(String(DEFAULT_DEPENDENCY_TERMS.multaAtrasoPercentual));
        }
      },
    });
  };

  const save = () => {
    const parsedPercentage = decimal(percentage);
    const parsedDiscount = decimal(discount);
    const parsedInterest = decimal(interest);
    const parsedPenalty = decimal(penalty);
    if (
      !disciplineId
      || !Number.isFinite(parsedPercentage)
      || parsedPercentage < 1
      || parsedPercentage > 1000
      || !Number.isFinite(parsedDiscount)
      || parsedDiscount < 0
      || !Number.isFinite(parsedInterest)
      || parsedInterest < 0
      || parsedInterest >= 100
      || !Number.isFinite(parsedPenalty)
      || parsedPenalty < 0
      || parsedPenalty >= 100
    ) return;
    const multiplier = parsedPercentage / 100;
    const attempt = resolveDependencyPolicyAttempt(
      policyAttemptRef.current,
      {
        poloId,
        disciplinaId: disciplineId,
        multiplicadorParcela: multiplier,
        descontoPontualidade: parsedDiscount,
        jurosAtrasoPercentual: parsedInterest,
        multaAtrasoPercentual: parsedPenalty,
      },
      createIdempotencyKey,
    );
    policyAttemptRef.current = attempt;
    mutation.mutate({
      poloId,
      disciplinaId: disciplineId,
      multiplicadorParcela: multiplier,
      descontoPontualidade: parsedDiscount,
      jurosAtrasoPercentual: parsedInterest,
      multaAtrasoPercentual: parsedPenalty,
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

    <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-700">Cobrança avulsa da disciplina</p>
      <h3 className="mt-1 text-base font-black">Termos próprios, sem mexer no curso técnico</h3>
      <p className="mt-1 max-w-4xl text-xs font-semibold leading-relaxed text-emerald-800">
        A reoferta cria um único boleto da disciplina. Desconto, juros e multa são congelados no título e não usam a turma de destino, a matrícula ou as mensalidades do aluno.
      </p>
      <p className="mt-3 rounded-xl border border-emerald-200 bg-white/70 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-emerald-800">
        Instrução fixa: SR.(A) CAIXA: NÃO RECEBER ESTE TÍTULO APÓS 60 (SESSENTA) DIAS DO VENCIMENTO.
      </p>
    </section>

    <section ref={formRef} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end">
        <div className="flex-1 lg:min-w-[250px]">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-700">
            Configuração por disciplina
          </p>
          <h3 className="mt-1 text-base font-black text-[#001a33]">
            {disciplineId ? 'Editar regra da disciplina' : 'Sobrescrever a faixa institucional'}
          </h3>
          <p className="mt-1 text-xs font-medium text-slate-500">
            O percentual é versionado no servidor. Cobranças já confirmadas preservam o snapshot anterior.
          </p>
          {disciplineId ? (
            <button
              type="button"
              onClick={() => {
                setDisciplineId('');
                setPercentage('50');
                setDiscount(String(DEFAULT_DEPENDENCY_TERMS.descontoPontualidade));
                setInterest(String(DEFAULT_DEPENDENCY_TERMS.jurosAtrasoPercentual));
                setPenalty(String(DEFAULT_DEPENDENCY_TERMS.multaAtrasoPercentual));
              }}
              className="mt-2 inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-slate-500 transition hover:text-blue-700"
            >
              <X size={12} /> Cancelar edição
            </button>
          ) : null}
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
        <label className="block lg:w-36">
          <span className="text-[9px] font-black uppercase tracking-wider text-slate-500">Desconto R$</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={discount}
            onChange={(event) => setDiscount(event.target.value)}
            className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700"
          />
        </label>
        <label className="block lg:w-32">
          <span className="text-[9px] font-black uppercase tracking-wider text-slate-500">Juros % mês</span>
          <input
            type="number"
            min="0"
            max="99.9999"
            step="0.01"
            value={interest}
            onChange={(event) => setInterest(event.target.value)}
            className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700"
          />
        </label>
        <label className="block lg:w-32">
          <span className="text-[9px] font-black uppercase tracking-wider text-slate-500">Multa % única</span>
          <input
            type="number"
            min="0"
            max="99.9999"
            step="0.01"
            value={penalty}
            onChange={(event) => setPenalty(event.target.value)}
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
      {removeMutation.isSuccess ? (
        <p className="mt-3 text-xs font-bold text-emerald-700">
          Personalização removida. A disciplina voltou a usar a faixa institucional.
        </p>
      ) : null}
      {removeMutation.isError ? (
        <p className="mt-3 text-xs font-bold text-rose-700">{removeMutation.error.message}</p>
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
                <span>Desconto: {formatCurrency(rule.descontoPontualidade)}</span>
                <span>Juros: {rule.jurosAtrasoPercentual}% ao mês</span>
                <span className="col-span-2">Multa: {rule.multaAtrasoPercentual}% única</span>
                <span className="col-span-2">Vigência: {formatDate(rule.vigenciaInicio)}</span>
              </div>
              {rule.disciplinaId ? (
                <div className="mt-4 border-t border-slate-100 pt-3">
                  {removingRuleId === rule.id ? (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                      <p className="text-[11px] font-bold text-rose-800">
                        Remover esta personalização e voltar à regra institucional?
                      </p>
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() => removeRule(rule)}
                          disabled={removeMutation.isPending}
                          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-rose-700 px-3 text-[9px] font-black uppercase tracking-wider text-white disabled:opacity-50"
                        >
                          {removeMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                          Confirmar
                        </button>
                        <button
                          type="button"
                          onClick={() => setRemovingRuleId(null)}
                          className="min-h-9 rounded-lg border border-rose-200 bg-white px-3 text-[9px] font-black uppercase tracking-wider text-rose-700"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => editRule(rule)}
                        className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 text-[9px] font-black uppercase tracking-wider text-blue-700"
                      >
                        <Pencil size={12} /> Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => setRemovingRuleId(rule.id)}
                        className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 text-[9px] font-black uppercase tracking-wider text-rose-700"
                      >
                        <Trash2 size={12} /> Remover
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <p className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-slate-50 px-3 py-2 text-[9px] font-black uppercase tracking-wider text-slate-500">
                  <RotateCcw size={12} /> Regra padrão do sistema
                </p>
              )}
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
                <th className="px-4 py-3">Encargos próprios</th>
                <th className="px-4 py-3">Referência</th>
                <th className="px-4 py-3">Vigência / origem</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {rules.map((rule) => (
                <tr key={rule.id}>
                  <td className="px-4 py-4 font-black text-[#001a33]">{rule.disciplinaNome}</td>
                  <td className="px-4 py-4">{rule.cargaHoraria ?? '—'}h</td>
                  <td className="px-4 py-4">{rule.faixa}</td>
                  <td className="px-4 py-4 font-black text-cyan-800">{rule.percentual}%</td>
                  <td className="px-4 py-4 text-[10px] font-bold text-slate-600">
                    <p>Desc. {formatCurrency(rule.descontoPontualidade)}</p>
                    <p className="mt-1">Juros {rule.jurosAtrasoPercentual}% · multa {rule.multaAtrasoPercentual}%</p>
                  </td>
                  <td className="px-4 py-4">{formatCurrency(rule.valorReferencia)}</td>
                  <td className="px-4 py-4">
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500">
                      <CalendarClock size={12} /> {formatDate(rule.vigenciaInicio)}
                    </span>
                    <p className="mt-1 text-[10px] font-bold text-slate-400">{rule.origem}</p>
                  </td>
                  <td className="px-4 py-4">
                    {rule.disciplinaId ? (
                      removingRuleId === rule.id ? (
                        <div className="ml-auto w-56 rounded-xl border border-rose-200 bg-rose-50 p-3">
                          <p className="text-[10px] font-bold leading-relaxed text-rose-800">
                            Voltar à regra institucional?
                          </p>
                          <div className="mt-2 flex justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setRemovingRuleId(null)}
                              className="min-h-8 rounded-lg border border-rose-200 bg-white px-2.5 text-[8px] font-black uppercase tracking-wider text-rose-700"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              onClick={() => removeRule(rule)}
                              disabled={removeMutation.isPending}
                              className="inline-flex min-h-8 items-center gap-1 rounded-lg bg-rose-700 px-2.5 text-[8px] font-black uppercase tracking-wider text-white disabled:opacity-50"
                            >
                              {removeMutation.isPending ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                              Confirmar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => editRule(rule)}
                            title="Editar criando uma nova versão"
                            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 text-[9px] font-black uppercase tracking-wider text-blue-700 transition hover:border-blue-300 hover:bg-blue-100"
                          >
                            <Pencil size={12} /> Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => setRemovingRuleId(rule.id)}
                            title="Remover personalização"
                            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 text-[9px] font-black uppercase tracking-wider text-rose-700 transition hover:border-rose-300 hover:bg-rose-100"
                          >
                            <Trash2 size={12} /> Remover
                          </button>
                        </div>
                      )
                    ) : (
                      <span className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-slate-50 px-3 py-2 text-[8px] font-black uppercase tracking-wider text-slate-500">
                        <RotateCcw size={11} /> Padrão
                      </span>
                    )}
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
