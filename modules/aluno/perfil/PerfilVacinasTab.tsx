import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock, FileText, ShieldCheck, Syringe, Upload, XCircle } from 'lucide-react';
import { getVacinaDoseKey } from '../../shared/vacinas/vacinas.config';
import {
  AlunoVacinaCursoContext,
  AlunoVacinaRegistro,
  SaveAlunoVacinaInput,
  VacinaStatus,
} from '../../shared/vacinas/vacinas.types';

interface PerfilVacinasTabProps {
  alunoId: string;
  contexts: AlunoVacinaCursoContext[];
  registros: AlunoVacinaRegistro[];
  saving: boolean;
  uploading: boolean;
  onSave: (input: SaveAlunoVacinaInput) => void;
  onUpload: (input: SaveAlunoVacinaInput, file: File) => void;
}

type DoseDraft = {
  dataAplicacao: string;
  lote: string;
  localAplicacao: string;
};

const getStatusBadge = (status?: VacinaStatus) => {
  if (status === 'aprovado') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-emerald-700">
        <CheckCircle2 size={10} /> Aprovado
      </span>
    );
  }
  if (status === 'reprovado') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-red-100 bg-red-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-red-700">
        <XCircle size={10} /> Reprovado
      </span>
    );
  }
  if (status === 'em_analise') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-blue-700">
        <Clock size={10} /> Em análise
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-slate-100 bg-slate-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-slate-600">
      Pendente
    </span>
  );
};

const PerfilVacinasTab: React.FC<PerfilVacinasTabProps> = ({
  alunoId,
  contexts,
  registros,
  saving,
  uploading,
  onSave,
  onUpload,
}) => {
  const registroMap = useMemo(() => {
    const map = new Map<string, AlunoVacinaRegistro>();
    registros.forEach((registro) => {
      map.set(getVacinaDoseKey(registro.cursoId, registro.vacinaCodigo, registro.doseNumero), registro);
    });
    return map;
  }, [registros]);

  const [drafts, setDrafts] = useState<Record<string, DoseDraft>>({});

  useEffect(() => {
    const next: Record<string, DoseDraft> = {};
    registros.forEach((registro) => {
      next[getVacinaDoseKey(registro.cursoId, registro.vacinaCodigo, registro.doseNumero)] = {
        dataAplicacao: registro.dataAplicacao || '',
        lote: registro.lote || '',
        localAplicacao: registro.localAplicacao || '',
      };
    });
    setDrafts(next);
  }, [registros]);

  const updateDraft = (key: string, patch: Partial<DoseDraft>) => {
    setDrafts((current) => ({
      ...current,
      [key]: {
        dataAplicacao: current[key]?.dataAplicacao || '',
        lote: current[key]?.lote || '',
        localAplicacao: current[key]?.localAplicacao || '',
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
    const draft = drafts[key] || { dataAplicacao: '', lote: '', localAplicacao: '' };

    if (!draft.dataAplicacao) {
      alert('Informe a data de aplicação da vacina antes de enviar.');
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
      origem: 'aluno' as const,
    };
  };

  if (contexts.length === 0) {
    return (
      <div className="rounded-[2.5rem] border border-slate-100 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
          <ShieldCheck size={26} />
        </div>
        <h3 className="mt-4 text-base font-black text-[#001a33]">Nenhuma vacina exigida agora</h3>
        <p className="mx-auto mt-2 max-w-md text-xs font-semibold leading-relaxed text-slate-500">
          Quando você estiver matriculado em curso que exige carteirinha para estágio, as doses aparecerão aqui.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {contexts.map((context) => {
        const requiredDoses = context.config.vacinas.flatMap((vacina) =>
          vacina.obrigatoria ? vacina.doses.map((dose) => ({ vacina, dose })) : []
        );
        const approved = requiredDoses.filter(({ vacina, dose }) => (
          registroMap.get(getVacinaDoseKey(context.cursoId, vacina.codigo, dose.numero))?.status === 'aprovado'
        )).length;

        return (
          <section key={`${context.cursoId}-${context.matriculaId || 'sem-matricula'}`} className="min-w-0 rounded-3xl border border-slate-100 bg-white p-4 shadow-sm sm:p-6 md:rounded-[2.5rem]">
            <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
                  <Syringe size={20} />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-600">Vacinação para estágio</p>
                  <h3 className="mt-1 break-words text-base font-black text-[#001a33] sm:text-lg">{context.cursoNome}</h3>
                  <p className="mt-1 text-xs font-semibold text-slate-500">{context.turmaNome || 'Turma vinculada'}</p>
                </div>
              </div>
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3">
                <p className="text-[9px] font-black uppercase tracking-widest text-emerald-700">Aprovadas</p>
                <p className="mt-1 text-xl font-black text-emerald-700">{approved}/{requiredDoses.length}</p>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              {context.config.vacinas.filter((vacina) => vacina.obrigatoria).map((vacina) => (
                <div key={vacina.codigo} className="min-w-0 rounded-2xl border border-slate-100 bg-slate-50/70 p-3 sm:p-4">
                  <h4 className="text-sm font-black text-[#001a33]">{vacina.nome}</h4>
                  <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
                    {vacina.doses.map((dose) => {
                      const key = getVacinaDoseKey(context.cursoId, vacina.codigo, dose.numero);
                      const registro = registroMap.get(key);
                      const isApproved = registro?.status === 'aprovado';
                      const draft = drafts[key] || {
                        dataAplicacao: registro?.dataAplicacao || '',
                        lote: registro?.lote || '',
                        localAplicacao: registro?.localAplicacao || '',
                      };

                      return (
                        <div key={key} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
                          <div className="mb-3 flex flex-col items-start gap-2 min-[390px]:flex-row min-[390px]:items-center min-[390px]:justify-between">
                            <p className="text-xs font-black uppercase tracking-widest text-slate-700">{dose.label}</p>
                            {getStatusBadge(registro?.status)}
                          </div>

                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                            <label className="space-y-1">
                              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Data</span>
                              <input
                                type="date"
                                value={draft.dataAplicacao}
                                disabled={isApproved}
                                onChange={(event) => updateDraft(key, { dataAplicacao: event.target.value })}
                                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-emerald-300"
                              />
                            </label>
                            <label className="space-y-1">
                              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Lote</span>
                              <input
                                type="text"
                                value={draft.lote}
                                disabled={isApproved}
                                onChange={(event) => updateDraft(key, { lote: event.target.value })}
                                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-emerald-300"
                              />
                            </label>
                            <label className="space-y-1">
                              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Local</span>
                              <input
                                type="text"
                                value={draft.localAplicacao}
                                disabled={isApproved}
                                onChange={(event) => updateDraft(key, { localAplicacao: event.target.value })}
                                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-emerald-300"
                              />
                            </label>
                          </div>

                          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                            <button
                              type="button"
                              disabled={saving || isApproved}
                              onClick={() => {
                                const input = buildInput(context, vacina, dose);
                                if (input) onSave(input);
                              }}
                              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#001a33] px-3 py-2.5 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-blue-900 disabled:opacity-60"
                            >
                              <FileText size={13} />
                              {saving ? 'Salvando...' : 'Salvar dados'}
                            </button>

                            <label className="inline-flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-3 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-600 transition hover:border-emerald-300 hover:text-emerald-700">
                              <Upload size={13} />
                              {isApproved
                                ? 'Comprovante aprovado'
                                : uploading
                                  ? 'Enviando...'
                                  : registro?.arquivoUrl ? 'Reenviar anexo' : 'Enviar anexo'}
                              <input
                                type="file"
                                accept="image/jpeg,image/png,application/pdf"
                                className="hidden"
                                disabled={uploading || isApproved}
                                onChange={(event) => {
                                  const file = event.target.files?.[0];
                                  event.target.value = '';
                                  const input = file ? buildInput(context, vacina, dose) : null;
                                  if (file && input) onUpload(input, file);
                                }}
                              />
                            </label>
                          </div>

                          {registro?.arquivoUrl && (
                            <a
                              href={registro.arquivoUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-3 inline-block text-[10px] font-black uppercase tracking-widest text-blue-600 hover:underline"
                            >
                              Ver comprovante enviado
                            </a>
                          )}

                          {registro?.observacao && (
                            <p className="mt-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-[10px] font-bold text-red-700">
                              {registro.observacao}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
};

export default PerfilVacinasTab;
