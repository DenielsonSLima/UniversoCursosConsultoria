import React, { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createPortal } from 'react-dom';
import { AlertTriangle, ArrowLeft, Loader2, RefreshCw } from 'lucide-react';

import CanonicalDocumentPreviewModal from '../../gestor/secretaria/shared/CanonicalDocumentPreviewModal';
import {
  createAlunoFinancialReceiptPdf,
  type AlunoFinancialReceiptPreviewItem,
} from './aluno-financeiro-receipt.pdf';
import { alunoFinancialErrorMessage } from './financeiro.presentation';
import { alunoFinanceiroReceiptOptions } from './financeiro.queries';

interface AlunoFinanceiroReceiptModalProps {
  alunoId: string;
  paymentId: string;
  onClose: () => void;
}

const ReceiptPreparationOverlay: React.FC<{
  error?: string;
  onClose: () => void;
  onRetry?: () => void;
}> = ({ error, onClose, onRetry }) => {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [onClose]);

  const modal = (
    <div
      className="fixed inset-0 z-[2147483000] flex h-[100dvh] w-screen bg-slate-950"
      role="dialog"
      aria-modal="true"
      aria-label="Preparação do recibo do aluno"
    >
      <div className="flex h-full w-full items-center justify-center bg-slate-900 p-6 text-center text-white">
        <div className="rounded-3xl border border-white/10 bg-slate-800/80 p-8 shadow-2xl sm:p-10">
          {error ? (
            <AlertTriangle className="mx-auto text-amber-300" size={40} />
          ) : (
            <Loader2 className="mx-auto animate-spin text-emerald-300" size={40} />
          )}
          <h2 className="mt-5 text-sm font-black uppercase tracking-widest">
            {error ? 'Recibo indisponível' : 'Preparando recibo oficial'}
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm font-medium leading-relaxed text-slate-300">
            {error || 'Carregando o snapshot autorizado do modelo, cabeçalho e marca d água institucional.'}
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-700 px-4 py-2.5 text-xs font-black uppercase tracking-wide text-white hover:bg-slate-600"
            >
              <ArrowLeft size={15} /> Voltar
            </button>
            {error && onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black uppercase tracking-wide text-white hover:bg-emerald-700"
              >
                <RefreshCw size={15} /> Tentar novamente
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
  return typeof document === 'undefined' ? modal : createPortal(modal, document.body);
};

const AlunoFinanceiroReceiptModal: React.FC<AlunoFinanceiroReceiptModalProps> = ({
  alunoId,
  paymentId,
  onClose,
}) => {
  const receiptQuery = useQuery(alunoFinanceiroReceiptOptions(alunoId, paymentId));
  const previewItem = useMemo<AlunoFinancialReceiptPreviewItem | null>(() => {
    const payload = receiptQuery.data;
    if (!payload) return null;
    return {
      emissionId: payload.receipt.id,
      title: payload.receipt.title,
      targetName: payload.receipt.payerName,
      validationCode: null,
      validationUrl: null,
      validUntil: null,
      renderPayload: {
        template: payload.model as unknown as Record<string, unknown>,
        snapshot: payload as unknown as Record<string, unknown>,
        templateRevision: payload.model.revision,
        rendered: {
          kind: payload.model.documentKind,
          emissao: payload.receipt.emittedAt,
          pages: [{
            header: payload.institution.name,
            title: payload.receipt.title,
            body: payload.receipt.declaration,
            footer: payload.receipt.footerNote,
          }],
          watermark: payload.watermark,
          qr: null,
          front: null,
          back: null,
        },
      },
      receiptPayload: payload,
    };
  }, [receiptQuery.data]);

  if (receiptQuery.isPending) return <ReceiptPreparationOverlay onClose={onClose} />;
  if (receiptQuery.isError || !previewItem) {
    return (
      <ReceiptPreparationOverlay
        error={alunoFinancialErrorMessage(receiptQuery.error)}
        onClose={onClose}
        onRetry={() => { void receiptQuery.refetch(); }}
      />
    );
  }

  return (
    <CanonicalDocumentPreviewModal
      items={[previewItem]}
      title={previewItem.title}
      accentClassName="bg-emerald-600 hover:bg-emerald-700"
      fileNamePrefix="recibo-aluno"
      onClose={onClose}
      isRenderable={(item) => (
        item.receiptPayload.model.key === 'recibo'
        && item.receiptPayload.receipt.statusCode === 'PAGO'
        && Number.isFinite(item.receiptPayload.receipt.valuePaid)
      )}
      createPdf={createAlunoFinancialReceiptPdf}
    />
  );
};

export default AlunoFinanceiroReceiptModal;
