import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, ChevronDown, Eye, Loader2, ShieldAlert, Syringe, XCircle } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../../../lib/supabase';
import { formatMatricula } from '../../../../../../lib/academicUtils';
import { formatCpf } from '../../../../../../lib/documentFormatters';
import { Turma } from '../../../gestao.types';
import { getVacinaDoseKey, normalizeCursoVacinasConfig } from '../../../../../shared/vacinas/vacinas.config';
import { alunoVacinasService } from '../../../../../shared/vacinas/vacinas.service';
import { AlunoVacinaRegistro, VacinaStatus } from '../../../../../shared/vacinas/vacinas.types';

interface TurmaVacinasProps {
  turma: Turma;
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

const getStatusBadge = (status?: VacinaStatus) => {
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

const TurmaVacinas: React.FC<TurmaVacinasProps> = ({ turma }) => {
  const queryClient = useQueryClient();
  const [observacoes, setObservacoes] = useState<Record<string, string>>({});
  const [expandedMatriculaId, setExpandedMatriculaId] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['turma-vacinas', turma.id, turma.cursoId],
    queryFn: async () => {
      const [{ data: cursoData, error: cursoError }, { data: matriculasData, error: matriculasError }] = await Promise.all([
        supabase
          .from('cursos')
          .select('id, nome, vacinas_config')
          .eq('id', turma.cursoId)
          .single(),
        supabase
          .from('matriculas')
          .select('id, aluno_id, data_matricula, status, parceiros(id, nome, cpf_cnpj, nome_mae, data_nascimento, polo_id)')
          .eq('turma_id', turma.id)
          .order('data_matricula', { ascending: true }),
      ]);

      if (cursoError) throw cursoError;
      if (matriculasError) throw matriculasError;

      const config = normalizeCursoVacinasConfig(cursoData?.vacinas_config, cursoData?.nome);
      const alunoIds = (matriculasData || []).map((matricula: any) => matricula.aluno_id).filter(Boolean);

      const { data: registrosData, error: registrosError } = alunoIds.length > 0
        ? await supabase
          .from('aluno_vacinas')
          .select('*')
          .eq('curso_id', turma.cursoId)
          .in('aluno_id', alunoIds)
        : { data: [], error: null };

      if (registrosError) throw registrosError;

      return {
        config,
        matriculas: matriculasData || [],
        registros: (registrosData || []) as any[],
      };
    },
  });

  useEffect(() => {
    if (!turma.id) return;
    const channel = supabase
      .channel(`turma_vacinas_${turma.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'aluno_vacinas', filter: `turma_id=eq.${turma.id}` },
        () => queryClient.invalidateQueries({ queryKey: ['turma-vacinas', turma.id, turma.cursoId] })
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, turma.cursoId, turma.id]);

  const registrosMap = useMemo(() => {
    const map = new Map<string, AlunoVacinaRegistro>();
    (data?.registros || []).forEach((row: any) => {
      map.set(
        `${row.aluno_id}:${getVacinaDoseKey(row.curso_id, row.vacina_codigo, row.dose_numero)}`,
        {
          id: row.id,
          alunoId: row.aluno_id,
          cursoId: row.curso_id,
          matriculaId: row.matricula_id,
          turmaId: row.turma_id,
          vacinaCodigo: row.vacina_codigo,
          vacinaNome: row.vacina_nome,
          doseNumero: row.dose_numero,
          doseLabel: row.dose_label,
          dataAplicacao: row.data_aplicacao,
          lote: row.lote,
          localAplicacao: row.local_aplicacao,
          arquivoUrl: row.arquivo_url,
          status: row.status,
          origem: row.origem,
          observacao: row.observacao,
          validadoEm: row.validado_em,
          updatedAt: row.updated_at,
        }
      );
    });
    return map;
  }, [data?.registros]);

  const statusMutation = useMutation({
    mutationFn: ({ id, status, observacao }: { id: string; status: VacinaStatus; observacao?: string }) =>
      alunoVacinasService.updateStatus(id, status, observacao),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['turma-vacinas', turma.id, turma.cursoId] });
      queryClient.invalidateQueries({ queryKey: ['turma-estagio-vacinas-resumo', turma.id, turma.cursoId] });
    },
  });

  const requiredDoses = useMemo(() => (
    (data?.config.vacinas || []).flatMap((vacina) =>
      vacina.obrigatoria
        ? vacina.doses.map((dose) => ({
            vacina,
            dose,
            doseKey: getVacinaDoseKey(turma.cursoId, vacina.codigo, dose.numero),
          }))
        : []
    )
  ), [data?.config.vacinas, turma.cursoId]);

  const studentRows = useMemo(() => (
    (data?.matriculas || []).map((matricula: any) => {
      const aluno = Array.isArray(matricula.parceiros) ? matricula.parceiros[0] : matricula.parceiros;
      const pendentes = requiredDoses.filter(({ doseKey }) => (
        registrosMap.get(`${aluno?.id}:${doseKey}`)?.status !== 'aprovado'
      ));
      const totalDoses = requiredDoses.length;
      return {
        matricula,
        aluno,
        pendentes,
        liberado: pendentes.length === 0,
        aprovadas: Math.max(0, totalDoses - pendentes.length),
        totalDoses,
      };
    })
  ), [data?.matriculas, registrosMap, requiredDoses]);

  const studentGroups = useMemo(() => ([
    {
      id: 'pendentes',
      title: 'Alunos com pendências',
      rows: studentRows.filter((row) => !row.liberado),
    },
    {
      id: 'liberados',
      title: 'Alunos liberados',
      rows: studentRows.filter((row) => row.liberado),
    },
  ].filter((group) => group.rows.length > 0)), [studentRows]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center rounded-[2rem] border border-slate-100 bg-white py-20">
        <Loader2 className="animate-spin text-emerald-600" size={30} />
        <span className="ml-3 text-sm font-bold text-slate-500">Carregando vacinas da turma...</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-[2rem] border border-red-100 bg-red-50 p-8 text-sm font-bold text-red-700">
        Não foi possível carregar o controle de vacinas da turma.
      </div>
    );
  }

  if (!data?.config.exigirCarteiraEstagio || requiredDoses.length === 0) {
    return (
      <div className="rounded-[2rem] border border-dashed border-slate-200 bg-white p-10 text-center shadow-sm">
        <Syringe className="mx-auto text-slate-300" size={46} />
        <h3 className="mt-4 text-lg font-black text-[#001a33]">Este curso não exige vacina para estágio</h3>
        <p className="mx-auto mt-2 max-w-md text-xs font-semibold leading-relaxed text-slate-500">
          Para ativar, vá em Cadastros, Cursos Técnicos, abra o curso e entre na aba Vacinas.
        </p>
      </div>
    );
  }

  const totalLiberados = studentRows.filter((row) => row.liberado).length;
  const totalPendentes = Math.max(0, studentRows.length - totalLiberados);

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
              <Syringe size={24} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-600">Liberação para estágio</p>
              <h3 className="mt-1 text-xl font-black uppercase tracking-tight text-[#001a33]">Vacinas da turma</h3>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                Aprove ou reprove doses enviadas pelo aluno antes da avaliação de estágio.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-5 py-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-emerald-700">Liberados</p>
              <p className="mt-1 text-2xl font-black text-emerald-700">{totalLiberados}</p>
            </div>
            <div className="rounded-2xl border border-amber-100 bg-amber-50 px-5 py-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-amber-700">Pendentes</p>
              <p className="mt-1 text-2xl font-black text-amber-700">{totalPendentes}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {studentGroups.map((group) => (
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
                const formattedMatricula = formatMatricula(matricula.id, matricula.data_matricula, aluno?.polo_id || turma.poloId);

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

                      <ChevronDown
                        size={18}
                        className={`justify-self-end text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
                      />
                    </button>

                    {expanded && (
                      <div className="border-t border-slate-100 bg-slate-50/70 px-4 py-4">
                        <div className="space-y-3">
                          {data.config.vacinas.filter((vacina) => vacina.obrigatoria).map((vacina) => (
                            <div key={`${matricula.id}-${vacina.codigo}`} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                              <div className="flex items-center justify-between border-b border-slate-100 bg-white px-4 py-3">
                                <p className="text-sm font-black text-[#001a33]">{vacina.nome}</p>
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                  {vacina.doses.length} dose(s)
                                </span>
                              </div>

                              <div className="divide-y divide-slate-100">
                                {vacina.doses.map((dose) => {
                                  const doseKey = getVacinaDoseKey(turma.cursoId, vacina.codigo, dose.numero);
                                  const registro = registrosMap.get(`${aluno?.id}:${doseKey}`);
                                  const obsKey = registro?.id || `${matricula.id}-${doseKey}`;
                                  const observacao = observacoes[obsKey] ?? registro?.observacao ?? '';

                                  return (
                                    <div
                                      key={`${matricula.id}-${doseKey}`}
                                      className="grid grid-cols-1 gap-3 px-4 py-3 xl:grid-cols-[155px_minmax(260px,1fr)_110px_minmax(300px,0.9fr)] xl:items-center"
                                    >
                                      <div className="flex flex-wrap items-center gap-2">
                                        <p className="text-xs font-black uppercase tracking-widest text-slate-700">{dose.label}</p>
                                        {getStatusBadge(registro?.status)}
                                      </div>

                                      <div className="grid grid-cols-1 gap-1 text-[11px] font-semibold text-slate-500 sm:grid-cols-3">
                                        <span>Data: <strong className="text-slate-700">{registro?.dataAplicacao || 'Pendente'}</strong></span>
                                        <span>Lote: <strong className="text-slate-700">{registro?.lote || '-'}</strong></span>
                                        <span>Local: <strong className="text-slate-700">{registro?.localAplicacao || '-'}</strong></span>
                                      </div>

                                      <div>
                                        {registro?.arquivoUrl ? (
                                          <a
                                            href={registro.arquivoUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-blue-700 hover:bg-blue-100"
                                          >
                                            <Eye size={13} /> Anexo
                                          </a>
                                        ) : (
                                          <span className="inline-flex rounded-xl border border-dashed border-slate-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                                            Sem anexo
                                          </span>
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
                                          <button
                                            type="button"
                                            disabled={statusMutation.isPending}
                                            onClick={() => statusMutation.mutate({ id: registro.id!, status: 'aprovado', observacao })}
                                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white hover:bg-emerald-700 disabled:opacity-60"
                                          >
                                            <CheckCircle2 size={13} /> Aprovar
                                          </button>
                                          <button
                                            type="button"
                                            disabled={statusMutation.isPending}
                                            onClick={() => statusMutation.mutate({ id: registro.id!, status: 'reprovado', observacao: observacao || 'Documento ou informação precisa ser corrigido.' })}
                                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-red-700 hover:bg-red-100 disabled:opacity-60"
                                          >
                                            <XCircle size={13} /> Reprovar
                                          </button>
                                        </div>
                                      ) : (
                                        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400 xl:text-right">
                                          Aguardando envio
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
};

export default TurmaVacinas;
