import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Eye,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import { formatMatricula } from '../../../../../../../lib/academicUtils';
import { formatCpf } from '../../../../../../../lib/documentFormatters';
import { Turma } from '../../../../gestao.types';
import { getVacinaDoseKey } from '../../../../../../shared/vacinas/vacinas.config';
import {
  AlunoVacinaRegistro,
  CursoVacinasConfig,
  VacinaStatus,
} from '../../../../../../shared/vacinas/vacinas.types';
import { TurmaVacinaStudentGroup } from './useTurmaVacinas';

interface TurmaVacinasStudentGroupsProps {
  turma: Turma;
  config: CursoVacinasConfig;
  groups: TurmaVacinaStudentGroup[];
  registrosMap: Map<string, AlunoVacinaRegistro>;
  isUpdating: boolean;
  onUpdateStatus: (id: string, status: VacinaStatus, observacao?: string) => void;
}

const calculateAge = (birthDate?: string | null) => {
  if (!birthDate) return null;
  const date = new Date(birthDate);
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - date.getFullYear();
  const monthDiff = today.getMonth() - date.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < date.getDate())) age -= 1;
  return age;
};

const StatusBadge: React.FC<{ status?: VacinaStatus }> = ({ status }) => {
  if (status === 'aprovado') {
    return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-700"><CheckCircle2 size={11} /> Aprovado</span>;
  }
  if (status === 'reprovado') {
    return <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-red-700"><XCircle size={11} /> Reprovado</span>;
  }
  if (status === 'em_analise') {
    return <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-blue-700"><AlertCircle size={11} /> Em análise</span>;
  }
  return <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-slate-600"><AlertCircle size={11} /> Pendente</span>;
};

const TurmaVacinasStudentGroups: React.FC<TurmaVacinasStudentGroupsProps> = ({
  turma,
  config,
  groups,
  registrosMap,
  isUpdating,
  onUpdateStatus,
}) => {
  const [observacoes, setObservacoes] = useState<Record<string, string>>({});
  const [expandedMatriculaId, setExpandedMatriculaId] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <section key={group.id} className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-4 py-3">
            <h4 className="text-xs font-black uppercase tracking-[0.18em] text-[#001a33]">{group.title}</h4>
            <span className="rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-widest text-slate-500">
              {group.rows.length} aluno(s)
            </span>
          </div>

          <div className="divide-y divide-slate-100">
            {group.rows.map(({ matricula, aluno, pendentes, liberado, aprovadas, totalDoses }) => {
              const age = calculateAge(aluno?.data_nascimento);
              const expanded = expandedMatriculaId === matricula.id;
              const formattedCpf = formatCpf(aluno?.cpf_cnpj) || 'Não informado';
              const formattedMatricula = formatMatricula(
                matricula.id,
                matricula.data_matricula,
                aluno?.polo_id || turma.poloId,
              );

              return (
                <article key={matricula.id} className={expanded ? 'bg-white' : 'bg-white hover:bg-slate-50/70'}>
                  <button
                    type="button"
                    onClick={() => setExpandedMatriculaId((current) => (current === matricula.id ? null : matricula.id))}
                    className="grid w-full grid-cols-1 items-center gap-3 px-4 py-3 text-left lg:grid-cols-[minmax(220px,1.4fr)_150px_150px_90px_minmax(170px,1fr)_145px_34px]"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-[#001a33]">{aluno?.nome || 'Aluno sem nome'}</p>
                      <p className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">Aluno</p>
                    </div>
                    <div>
                      <p className="font-mono text-xs font-black text-slate-700">{formattedCpf}</p>
                      <p className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">CPF</p>
                    </div>
                    <div>
                      <p className="truncate text-xs font-black text-slate-700">{formattedMatricula}</p>
                      <p className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">Matrícula</p>
                    </div>
                    <div>
                      <p className="text-xs font-black text-slate-700">{age === null ? '-' : `${age} anos`}</p>
                      <p className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">Idade</p>
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-black text-slate-700">{aluno?.nome_mae || 'Não informada'}</p>
                      <p className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">Mãe</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {liberado ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-700">
                          <CheckCircle2 size={11} /> {aprovadas}/{totalDoses}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-amber-700">
                          <ShieldAlert size={11} /> {pendentes.length} pend.
                        </span>
                      )}
                    </div>
                    <ChevronDown size={18} className={`justify-self-end text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                  </button>

                  {expanded ? (
                    <div className="border-t border-slate-100 bg-slate-50/70 px-4 py-4">
                      <div className="space-y-3">
                        {config.vacinas.filter((vacina) => vacina.obrigatoria).map((vacina) => (
                          <div key={`${matricula.id}-${vacina.codigo}`} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                            <div className="flex items-center justify-between border-b border-slate-100 bg-white px-4 py-3">
                              <p className="text-sm font-black text-[#001a33]">{vacina.nome}</p>
                              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{vacina.doses.length} dose(s)</span>
                            </div>
                            <div className="divide-y divide-slate-100">
                              {vacina.doses.map((dose) => {
                                const doseKey = getVacinaDoseKey(turma.cursoId, vacina.codigo, dose.numero);
                                const registro = registrosMap.get(`${aluno?.id}:${doseKey}`);
                                const obsKey = registro?.id || `${matricula.id}-${doseKey}`;
                                const observacao = observacoes[obsKey] ?? registro?.observacao ?? '';
                                return (
                                  <div key={`${matricula.id}-${doseKey}`} className="grid grid-cols-1 gap-3 px-4 py-3 xl:grid-cols-[155px_minmax(260px,1fr)_110px_minmax(300px,0.9fr)] xl:items-center">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <p className="text-xs font-black uppercase tracking-widest text-slate-700">{dose.label}</p>
                                      <StatusBadge status={registro?.status} />
                                    </div>
                                    <div className="grid grid-cols-1 gap-1 text-[11px] font-semibold text-slate-500 sm:grid-cols-3">
                                      <span>Data: <strong className="text-slate-700">{registro?.dataAplicacao || 'Pendente'}</strong></span>
                                      <span>Lote: <strong className="text-slate-700">{registro?.lote || '-'}</strong></span>
                                      <span>Local: <strong className="text-slate-700">{registro?.localAplicacao || '-'}</strong></span>
                                    </div>
                                    <div>
                                      {registro?.arquivoUrl ? (
                                        <a href={registro.arquivoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-blue-700 hover:bg-blue-100">
                                          <Eye size={13} /> Anexo
                                        </a>
                                      ) : (
                                        <span className="inline-flex rounded-xl border border-dashed border-slate-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400">Sem anexo</span>
                                      )}
                                    </div>
                                    {registro?.id ? (
                                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center xl:justify-end">
                                        <input
                                          type="text"
                                          value={observacao}
                                          onChange={(event) => setObservacoes((current) => ({ ...current, [obsKey]: event.target.value }))}
                                          placeholder="Observação"
                                          className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-emerald-300"
                                        />
                                        <button type="button" disabled={isUpdating} onClick={() => onUpdateStatus(registro.id!, 'aprovado', observacao)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white hover:bg-emerald-700 disabled:opacity-60">
                                          <CheckCircle2 size={13} /> Aprovar
                                        </button>
                                        <button type="button" disabled={isUpdating} onClick={() => onUpdateStatus(registro.id!, 'reprovado', observacao || 'Documento ou informação precisa ser corrigido.')} className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-red-700 hover:bg-red-100 disabled:opacity-60">
                                          <XCircle size={13} /> Reprovar
                                        </button>
                                      </div>
                                    ) : (
                                      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400 xl:text-right">Aguardando envio</div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
};

export default TurmaVacinasStudentGroups;
