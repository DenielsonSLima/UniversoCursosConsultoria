import React from 'react';
import { BookOpenCheck, ShieldCheck } from 'lucide-react';
import type {
  MatriculaTecnicaPendenteDocumento,
  MatriculaTecnicaWorkflowBloqueio,
} from '../../../../documentos-aluno.service';

interface MatriculaTecnicaAccessSectionProps {
  enrollments: MatriculaTecnicaPendenteDocumento[];
  activatePending: boolean;
  implantationReleasePending: boolean;
  implantationRevokePending: boolean;
  onActivate: (enrollment: MatriculaTecnicaPendenteDocumento) => void;
  onOpenImplantation: (enrollment: MatriculaTecnicaPendenteDocumento) => void;
  onRevokeImplantation: (
    enrollment: MatriculaTecnicaPendenteDocumento,
    reason: string,
  ) => void;
  onValidationError: (message: string) => void;
}

const blockerLabels: Record<MatriculaTecnicaWorkflowBloqueio, string> = {
  SEM_PERMISSAO: 'Seu perfil não pode executar esta ação.',
  FLUXO_NAO_REGULAR: 'A matrícula está no fluxo de implantação.',
  STATUS_INCOMPATIVEL: 'O status atual da matrícula não permite esta ação.',
  TURMA_FORA_DE_ANDAMENTO: 'A turma ainda não está em andamento.',
  PAGAMENTO_PENDENTE: 'O pagamento ainda não foi confirmado.',
  DOCUMENTACAO_INCOMPLETA: 'Há documentos obrigatórios pendentes.',
  DADOS_PESSOAIS_INCOMPLETOS: 'Complete sexo e data de nascimento do aluno.',
  ENVIO_DOCUMENTAL_EM_ANDAMENTO: 'Há um envio documental ainda em processamento.',
  COBRANCA_EXISTENTE: 'Já existe vínculo financeiro com esta matrícula.',
  LIBERACAO_JA_ATIVA: 'O acesso acadêmico de implantação já está liberado.',
  LIBERACAO_INATIVA_OU_SEM_PERMISSAO: 'Não há liberação ativa que possa ser revogada.',
};

const describeBlockers = (blockers: MatriculaTecnicaWorkflowBloqueio[]) =>
  blockers.map((blocker) => blockerLabels[blocker]).join(' ');

const MatriculaTecnicaAccessSection: React.FC<MatriculaTecnicaAccessSectionProps> = ({
  enrollments,
  activatePending,
  implantationReleasePending,
  implantationRevokePending,
  onActivate,
  onOpenImplantation,
  onRevokeImplantation,
  onValidationError,
}) => {
  if (enrollments.length === 0) return null;

  return (
    <section className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 shrink-0 text-emerald-700" size={20} />
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-black uppercase tracking-wide text-emerald-900">
            Análise e acesso da matrícula
          </h4>
          <p className="mt-1 text-xs font-semibold leading-relaxed text-emerald-800">
            Matrículas regulares exigem pagamento confirmado e todos os
            documentos obrigatórios concluídos, por anexo aprovado ou registro
            administrativo sem anexo.
          </p>
          <div className="mt-4 space-y-3">
            {enrollments.map((enrollment) => {
              const regularBlockers = describeBlockers(
                enrollment.acoes.ativarRegular.bloqueios,
              );
              const implantationBlockers = describeBlockers(
                enrollment.acoes.liberarImplantacao.bloqueios,
              );

              return (
                <div
                  key={enrollment.matriculaId}
                  className="flex flex-col gap-4 rounded-xl border border-emerald-100 bg-white p-4 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-black text-slate-800">{enrollment.cursoNome}</p>
                    <p className="mt-0.5 text-[10px] font-semibold text-slate-500">
                      {enrollment.turmaNome}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-[8px] font-black uppercase tracking-wider text-slate-600">
                        {enrollment.status}
                      </span>
                      <span
                        className={`rounded-full px-2 py-1 text-[8px] font-black uppercase tracking-wider ${
                          enrollment.fluxo === 'IMPLANTACAO'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-blue-50 text-blue-700'
                        }`}
                      >
                        {enrollment.fluxo === 'IMPLANTACAO'
                          ? 'Aluno de implantação'
                          : 'Matrícula regular'}
                      </span>
                      <span className="rounded-full bg-emerald-50 px-2 py-1 text-[8px] font-black uppercase tracking-wider text-emerald-700">
                        Documentos {enrollment.documentacao.concluidos}/
                        {enrollment.documentacao.obrigatoriosTotal}
                      </span>
                    </div>
                    {enrollment.liberacaoAcademica ? (
                      <p className="mt-2 text-[10px] font-semibold text-amber-700">
                        Acesso liberado por{' '}
                        {enrollment.liberacaoAcademica.liberadoPorNome || 'gestor'} em{' '}
                        {new Date(enrollment.liberacaoAcademica.liberadoEm).toLocaleString('pt-BR')}.
                      </p>
                    ) : null}
                  </div>

                  {enrollment.status === 'ATIVO' ? (
                    <span className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-emerald-100 px-4 text-[10px] font-black uppercase tracking-wider text-emerald-800">
                      <ShieldCheck size={14} /> Matrícula ativa
                    </span>
                  ) : enrollment.liberacaoAcademica ? (
                    <div className="flex flex-col items-stretch gap-1 lg:items-end">
                      <span className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-amber-100 px-4 text-[10px] font-black uppercase tracking-wider text-amber-800">
                        <BookOpenCheck size={14} /> Acesso de implantação liberado
                      </span>
                      <button
                        type="button"
                        disabled={
                          implantationRevokePending
                          || !enrollment.acoes.revogarLiberacao.permitida
                        }
                        onClick={() => {
                          const reason = window.prompt(
                            'Informe o motivo da revogação (mínimo de 10 caracteres):',
                          )?.trim();
                          if (!reason) return;
                          if (reason.length < 10) {
                            onValidationError(
                              'O motivo da revogação deve ter pelo menos 10 caracteres.',
                            );
                            return;
                          }
                          onRevokeImplantation(enrollment, reason);
                        }}
                        className="text-[9px] font-black uppercase tracking-wider text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Revogar acesso
                      </button>
                    </div>
                  ) : enrollment.fluxo === 'IMPLANTACAO' ? (
                    <div className="flex flex-col items-stretch gap-1 md:items-end">
                      <button
                        type="button"
                        title={implantationBlockers || 'Reliberar acesso de implantação'}
                        disabled={
                          implantationReleasePending
                          || !enrollment.acoes.liberarImplantacao.permitida
                        }
                        onClick={() => onOpenImplantation(enrollment)}
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 text-[10px] font-black uppercase tracking-wider text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <BookOpenCheck size={14} />
                        Reliberar acesso de implantação
                      </button>
                      <span className="max-w-64 text-[9px] font-semibold text-amber-700 md:text-right">
                        {implantationBlockers || 'Sem cobrança · nova liberação auditada.'}
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3 md:flex-row">
                      <div className="flex flex-col items-stretch gap-1 md:items-end">
                        <button
                          type="button"
                          title={regularBlockers || 'Ativar matrícula regular'}
                          disabled={
                            activatePending || !enrollment.acoes.ativarRegular.permitida
                          }
                          onClick={() => onActivate(enrollment)}
                          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-[10px] font-black uppercase tracking-wider text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <ShieldCheck size={14} /> Ativar matrícula regular
                        </button>
                        <span className="max-w-64 text-[9px] font-semibold text-slate-500 md:text-right">
                          {regularBlockers || 'Pagamento e documentação confirmados pelo servidor.'}
                        </span>
                      </div>
                      <div className="flex flex-col items-stretch gap-1 md:items-end">
                        <button
                          type="button"
                          title={implantationBlockers || 'Liberar acesso sem financeiro'}
                          disabled={
                            implantationReleasePending
                            || !enrollment.acoes.liberarImplantacao.permitida
                          }
                          onClick={() => onOpenImplantation(enrollment)}
                          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 text-[10px] font-black uppercase tracking-wider text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <BookOpenCheck size={14} />
                          Converter e liberar implantação
                        </button>
                        <span className="max-w-64 text-[9px] font-semibold text-amber-700 md:text-right">
                          {implantationBlockers || 'Sem cobrança · acesso acadêmico auditado.'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};

export default MatriculaTecnicaAccessSection;
