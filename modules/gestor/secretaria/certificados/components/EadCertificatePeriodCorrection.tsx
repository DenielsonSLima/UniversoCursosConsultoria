import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useEadHistoricalStudyEvidence, useRetificarPeriodoEadMutation } from '../certificados.queries';
import type { CertificadoAcademico } from '../certificados.types';
import EadCertificatePreviewPortal from './EadCertificatePreviewPortal';

interface Props {
  certificate: CertificadoAcademico;
  onClose: () => void;
}

const fieldClass = 'mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800';
const formatDate = (date: string) => date.split('-').reverse().join('/');

const EadCertificatePeriodCorrection = ({ certificate, onClose }: Props) => {
  const mutation = useRetificarPeriodoEadMutation();
  const audit = useEadHistoricalStudyEvidence(certificate.id, certificate.codigo_validacao);
  const [useExternalEvidence, setUseExternalEvidence] = useState(false);
  const [startedOn, setStartedOn] = useState('');
  const [evidenceReference, setEvidenceReference] = useState('');
  const [reason, setReason] = useState('');
  const progressEvidence = useExternalEvidence ? null : audit.data;
  const selectedStart = progressEvidence?.inicioData || startedOn;
  const selectedReference = progressEvidence?.referencia || evidenceReference.trim();
  const canSubmit = !mutation.isPending && !audit.isPending && Boolean(selectedStart) && selectedReference.length >= 4
    && reason.trim().length >= 8;
  const error = mutation.error as { message?: string } | null;
  const close = () => { if (!mutation.isPending) onClose(); };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const originalCode = certificate.codigo_validacao;
    if (!canSubmit || !originalCode) return;
    mutation.mutate({
      certificateId: certificate.id, originalCode, startedOn: selectedStart,
      evidenceReference: selectedReference, reason: reason.trim(), useProgressAudit: Boolean(progressEvidence),
    });
  };

  return (
    <EadCertificatePreviewPortal onClose={close}>
      <div className="flex h-full items-center justify-center overflow-y-auto bg-slate-950/60 p-4">
        <section aria-labelledby="ead-period-correction-title" className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
          <h3 id="ead-period-correction-title" className="text-lg font-semibold text-slate-900">Retificar período do EAD</h3>
          <p className="mt-1 text-sm text-slate-600">{certificate.aluno.nome} · {certificate.curso.nome}</p>
          {mutation.isSuccess ? (
            <div className="mt-4 space-y-4">
              <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                Certificado retificado. Novo código <strong>{mutation.data}</strong>.
              </p>
              <div className="flex justify-end">
                <button type="button" onClick={close} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Concluir</button>
              </div>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-4 space-y-3">
              <p className="text-sm text-slate-600">
                O código anterior será revogado na emissão do certificado retificado.
              </p>
              {audit.isPending ? <p role="status" className="text-sm text-slate-600">Conferindo a auditoria de progresso…</p>
                : audit.isError ? <p role="alert" className="text-sm text-amber-800">Auditoria indisponível. Use uma evidência documental conferida.</p>
                  : audit.data ? (
                    <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                      <input type="checkbox" checked={!useExternalEvidence} disabled={mutation.isPending}
                        onChange={event => setUseExternalEvidence(!event.target.checked)} />
                      Usar a auditoria de progresso
                    </label>
                  ) : null}
              {progressEvidence ? (
                <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  <p>Período comprovado de <strong>{formatDate(progressEvidence.inicioData)}</strong> a <strong>{formatDate(progressEvidence.conclusaoData)}</strong></p>
                  {progressEvidence.conclusaoData !== certificate.data_conclusao && <p>
                    A conclusão anterior de {formatDate(certificate.data_conclusao)} será ajustada para o dia registrado no horário de Sergipe.
                  </p>}
                </div>
              ) : !audit.isPending ? <>
                <p className="text-sm text-slate-600">Conclusão atestada em {formatDate(certificate.data_conclusao)}.</p>
                <label className="block text-sm font-medium text-slate-700">
                  Data de início comprovada
                  <input type="date" required max={certificate.data_conclusao}
                    value={startedOn} onChange={event => setStartedOn(event.target.value)}
                    disabled={mutation.isPending} className={fieldClass} />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Referência da evidência
                  <input required minLength={4} maxLength={300} value={evidenceReference}
                    onChange={event => setEvidenceReference(event.target.value)}
                    disabled={mutation.isPending} className={fieldClass} />
                </label>
              </> : null}
              <label className="block text-sm font-medium text-slate-700">
                Motivo da retificação
                <textarea required rows={2} minLength={8} maxLength={500} value={reason}
                  onChange={event => setReason(event.target.value)}
                  disabled={mutation.isPending} className={fieldClass} />
              </label>
              {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
                {error.message || 'Não foi possível retificar o certificado.'}
              </p>}
              <div className="flex flex-wrap justify-end gap-2 pt-1">
                <button type="button" onClick={close} disabled={mutation.isPending}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700">Cancelar</button>
                <button type="submit" disabled={!canSubmit}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
                  Emitir certificado retificado
                </button>
              </div>
            </form>
          )}
        </section>
      </div>
    </EadCertificatePreviewPortal>
  );
};

export default EadCertificatePeriodCorrection;
