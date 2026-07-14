import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock, Eye, FileText, ShieldCheck, Syringe, Upload, XCircle } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../../../lib/supabase';
import { getVacinaDoseKey } from '../../../../../shared/vacinas/vacinas.config';
import {
  alunoVacinasKeys,
  alunoVacinasService,
} from '../../../../../shared/vacinas/vacinas.service';
import {
  AlunoVacinaCursoContext,
  AlunoVacinaRegistro,
  SaveAlunoVacinaInput,
  VacinaStatus,
} from '../../../../../shared/vacinas/vacinas.types';

interface ParceiroAlunoVacinasProps {
  alunoId: string;
}

type DoseDraft = {
  dataAplicacao: string;
  lote: string;
  localAplicacao: string;
  observacao: string;
};

const getStatusBadge = (status?: VacinaStatus) => {
  if (status === 'aprovado') {
    return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-700"><CheckCircle2 size={11} /> Aprovado</span>;
  }
  if (status === 'reprovado') {
    return <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-red-700"><XCircle size={11} /> Reprovado</span>;
  }
  if (status === 'em_analise') {
    return <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-blue-700"><Clock size={11} /> Em análise</span>;
  }
  return <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-slate-600"><AlertCircle size={11} /> Pendente</span>;
};

const ParceiroAlunoVacinas: React.FC<ParceiroAlunoVacinasProps> = ({ alunoId }) => {
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, DoseDraft>>({});

  const { data: contexts = [], isLoading: loadingContexts } = useQuery<AlunoVacinaCursoContext[]>({
    queryKey: alunoVacinasKeys.contexts(alunoId),
    queryFn: () => alunoVacinasService.getCursoContexts(alunoId),
    enabled: !!alunoId,
  });

  const { data: registros = [], isLoading: loadingRegistros } = useQuery<AlunoVacinaRegistro[]>({
    queryKey: alunoVacinasKeys.records(alunoId),
    queryFn: () => alunoVacinasService.getAlunoVacinas(alunoId),
    enabled: !!alunoId,
  });

  useEffect(() => {
    if (!alunoId) return;
    const channel = supabase
      .channel(`aluno_vacinas_realtime_${alunoId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'aluno_vacinas', filter: `aluno_id=eq.${alunoId}` },
        () => queryClient.invalidateQueries({ queryKey: alunoVacinasKeys.records(alunoId) })
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [alunoId, queryClient]);

  const registroMap = useMemo(() => {
    const map = new Map<string, AlunoVacinaRegistro>();
    registros.forEach((registro) => {
      map.set(getVacinaDoseKey(registro.cursoId, registro.vacinaCodigo, registro.doseNumero), registro);
    });
    return map;
  }, [registros]);

  useEffect(() => {
    const next: Record<string, DoseDraft> = {};
    registros.forEach((registro) => {
      next[getVacinaDoseKey(registro.cursoId, registro.vacinaCodigo, registro.doseNumero)] = {
        dataAplicacao: registro.dataAplicacao || '',
        lote: registro.lote || '',
        localAplicacao: registro.localAplicacao || '',
        observacao: registro.observacao || '',
      };
    });
    setDrafts(next);
  }, [registros]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: alunoVacinasKeys.records(alunoId) });
  };

  const saveMutation = useMutation({
    mutationFn: (payload: SaveAlunoVacinaInput) => alunoVacinasService.saveAlunoVacina(payload),
    onSuccess: invalidate,
  });

  const uploadMutation = useMutation({
    mutationFn: ({ payload, file }: { payload: SaveAlunoVacinaInput; file: File }) =>
      alunoVacinasService.uploadVacinaArquivo(payload, file),
    onSuccess: invalidate,
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status, observacao }: { id: string; status: VacinaStatus; observacao?: string }) =>
      alunoVacinasService.updateStatus(id, status, observacao),
    onSuccess: invalidate,
  });

  const updateDraft = (key: string, patch: Partial<DoseDraft>) => {
    setDrafts((current) => ({
      ...current,
      [key]: {
        dataAplicacao: current[key]?.dataAplicacao || '',
        lote: current[key]?.lote || '',
        localAplicacao: current[key]?.localAplicacao || '',
        observacao: current[key]?.observacao || '',
        ...patch,
      },
    }));
  };

  const buildInput = (
    context: AlunoVacinaCursoContext,
    vacina: AlunoVacinaCursoContext['config']['vacinas'][number],
    dose: AlunoVacinaCursoContext['config']['vacinas'][number]['doses'][number]
  ) => {
    const key = getVacinaDoseKey(context.cursoId, vacina.codigo, dose.numero);
    const draft = drafts[key] || { dataAplicacao: '', lote: '', localAplicacao: '', observacao: '' };
    if (!draft.dataAplicacao) {
      alert('Informe a data de aplicação antes de registrar a vacina.');
      return null;
    }

    return {
      alunoId,
      cursoId: context.cursoId,
      matriculaId: context.matriculaId,
      turmaId: context.turmaId,
      vacinaCodigo: vacina.codigo,
      vacinaNome: vacina.nome,
      doseNumero: dose.numero,
      doseLabel: dose.label,
      dataAplicacao: draft.dataAplicacao,
      lote: draft.lote,
      localAplicacao: draft.localAplicacao,
      origem: 'secretaria' as const,
    };
  };

  const isLoading = loadingContexts || loadingRegistros;

  if (isLoading) {
    return <div className="py-20 text-center text-sm font-bold text-slate-400">Carregando vacinas...</div>;
  }

  return (
    <div className="animate-fadeIn space-y-6">
      <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-xl font-black uppercase tracking-tight text-[#001a33]">Vacinas do aluno</h3>
          <p className="mt-1 text-xs font-semibold text-slate-500">Valide carteirinha, doses e pendências para liberação de estágio.</p>
        </div>
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-emerald-800">
          <p className="text-[9px] font-black uppercase tracking-widest">Controle de estágio</p>
          <p className="mt-1 text-xs font-bold">Aprovação manual pela secretaria</p>
        </div>
      </div>

      {contexts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center">
          <ShieldCheck className="mx-auto text-slate-300" size={42} />
          <p className="mt-3 text-sm font-black text-[#001a33]">Nenhuma exigência de vacina para as matrículas atuais.</p>
          <p className="mt-1 text-xs font-semibold text-slate-500">Configure a exigência no cadastro do curso técnico.</p>
        </div>
      ) : (
        contexts.map((context) => (
          <section key={`${context.cursoId}-${context.matriculaId || 'sem-matricula'}`} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-5 flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
                <Syringe size={20} />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Curso com exigência</p>
                <h4 className="text-base font-black text-[#001a33]">{context.cursoNome}</h4>
                <p className="mt-1 text-xs font-bold text-slate-500">{context.turmaNome || 'Turma vinculada'}</p>
              </div>
            </div>

            <div className="space-y-4">
              {context.config.vacinas.filter((vacina) => vacina.obrigatoria).map((vacina) => (
                <div key={vacina.codigo} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                  <p className="text-sm font-black text-[#001a33]">{vacina.nome}</p>
                  <div className="mt-4 space-y-3">
                    {vacina.doses.map((dose) => {
                      const key = getVacinaDoseKey(context.cursoId, vacina.codigo, dose.numero);
                      const registro = registroMap.get(key);
                      const draft = drafts[key] || {
                        dataAplicacao: registro?.dataAplicacao || '',
                        lote: registro?.lote || '',
                        localAplicacao: registro?.localAplicacao || '',
                        observacao: registro?.observacao || '',
                      };

                      return (
                        <div key={key} className="rounded-2xl border border-slate-200 bg-white p-4">
                          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-black uppercase tracking-widest text-slate-700">{dose.label}</span>
                              {getStatusBadge(registro?.status)}
                            </div>
                            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                              Origem: {registro?.origem === 'secretaria' ? 'Secretaria' : registro?.origem === 'aluno' ? 'Aluno' : 'Não enviado'}
                            </span>
                          </div>

                          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                            <input type="date" value={draft.dataAplicacao} onChange={(e) => updateDraft(key, { dataAplicacao: e.target.value })} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-emerald-300" />
                            <input type="text" value={draft.lote} onChange={(e) => updateDraft(key, { lote: e.target.value })} placeholder="Lote" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-emerald-300" />
                            <input type="text" value={draft.localAplicacao} onChange={(e) => updateDraft(key, { localAplicacao: e.target.value })} placeholder="Local" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-emerald-300" />
                            <input type="text" value={draft.observacao} onChange={(e) => updateDraft(key, { observacao: e.target.value })} placeholder="Observação" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-emerald-300" />
                          </div>

                          <div className="mt-4 flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={saveMutation.isPending}
                              onClick={() => {
                                const input = buildInput(context, vacina, dose);
                                if (input) saveMutation.mutate(input);
                              }}
                              className="inline-flex items-center gap-2 rounded-xl bg-[#001a33] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white hover:bg-blue-900 disabled:opacity-60"
                            >
                              <FileText size={13} /> Registrar
                            </button>

                            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:border-emerald-300 hover:text-emerald-700">
                              <Upload size={13} /> Anexar
                              <input
                                type="file"
                                accept="image/jpeg,image/png,application/pdf"
                                className="hidden"
                                disabled={uploadMutation.isPending}
                                onChange={(event) => {
                                  const file = event.target.files?.[0];
                                  event.target.value = '';
                                  const input = file ? buildInput(context, vacina, dose) : null;
                                  if (file && input) uploadMutation.mutate({ payload: input, file });
                                }}
                              />
                            </label>

                            {registro?.arquivoUrl && (
                              <a href={registro.arquivoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-blue-700">
                                <Eye size={13} /> Visualizar
                              </a>
                            )}

                            {registro?.id && (
                              <>
                                <button
                                  type="button"
                                  disabled={statusMutation.isPending}
                                  onClick={() => statusMutation.mutate({ id: registro.id!, status: 'aprovado', observacao: draft.observacao })}
                                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white hover:bg-emerald-700 disabled:opacity-60"
                                >
                                  <CheckCircle2 size={13} /> Aprovar
                                </button>
                                <button
                                  type="button"
                                  disabled={statusMutation.isPending}
                                  onClick={() => statusMutation.mutate({ id: registro.id!, status: 'reprovado', observacao: draft.observacao || 'Documento ou informação precisa ser corrigido.' })}
                                  className="inline-flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-red-700 hover:bg-red-100 disabled:opacity-60"
                                >
                                  <XCircle size={13} /> Reprovar
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
};

export default ParceiroAlunoVacinas;
