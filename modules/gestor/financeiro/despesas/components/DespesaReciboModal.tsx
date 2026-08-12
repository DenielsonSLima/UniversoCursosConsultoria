import React, { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, ArrowLeft, Loader2, RefreshCw } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

import CanonicalDocumentPreviewModal from '../../../secretaria/shared/CanonicalDocumentPreviewModal';
import { type Polo } from '../../../configuracoes/polos/polos.service';
import { despesaToReciboData, type ReciboData } from '../../../cadastros/modelos-documentos/recibo/ReciboDespesaPreview';
import type { ContaBancaria } from '../../financeiro.service';
import {
  despesasService,
  type DespesaLancamento,
  type DespesaReciboSnapshot,
} from '../despesas.service';
import {
  createDespesaReciboPdf,
  type DespesaReciboPreviewItem,
} from './despesa-recibo.pdf';
import { getDespesaContaLabel } from './despesaPresentation';

interface ParceiroDocumento {
  id?: string;
  cpf_cnpj?: string;
  cpfCnpj?: string;
}

interface DespesaReciboModalProps {
  data?: ReciboData;
  item?: DespesaLancamento;
  contas?: ContaBancaria[];
  parceiros?: ParceiroDocumento[];
  onClose: () => void;
}

const mapSnapshotToReceipt = (snapshot: DespesaReciboSnapshot): ReciboData => ({
  ...snapshot.receipt,
  empresaNome: snapshot.polo.nome,
  empresaCnpj: snapshot.polo.cnpj,
  logoUrl: snapshot.polo.logoUrl,
  poloId: snapshot.receipt.poloId || snapshot.polo.id,
  poloNome: snapshot.receipt.poloNome || snapshot.polo.nome,
});

const mapSnapshotToPolo = (snapshot: DespesaReciboSnapshot): Polo => ({
  ...snapshot.polo,
  nome: snapshot.polo.nome,
  cnpj: snapshot.polo.cnpj || '',
  cidade: snapshot.polo.cidade || '',
  estado: snapshot.polo.estado || snapshot.polo.uf || '',
  status: snapshot.polo.status === 'inativo' ? 'inativo' : 'ativo',
});

const ReceiptPreparationScreen: React.FC<{
  error?: string;
  onClose: () => void;
  onRetry?: () => void;
}> = ({ error, onClose, onRetry }) => {
  const modal = (
    <div
      className="fixed inset-0 z-[2147483000] flex h-[100dvh] w-screen animate-fadeIn bg-slate-950"
      role="dialog"
      aria-modal="true"
      aria-label="Preparação do recibo"
    >
      <div className="flex h-full w-full flex-col items-center justify-center bg-slate-900 p-6 text-center text-white">
        <div className="rounded-3xl border border-white/10 bg-slate-800/80 p-8 shadow-2xl sm:p-10">
          {error ? <AlertTriangle className="mx-auto text-amber-300" size={40} /> : <Loader2 className="mx-auto animate-spin text-blue-300" size={40} />}
          <h2 className="mt-5 text-sm font-black uppercase tracking-widest">
            {error ? 'Prévia indisponível' : 'Preparando recibo oficial'}
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm font-medium leading-relaxed text-slate-300">
            {error || 'Carregando o snapshot institucional para gerar o mesmo PDF da prévia, do download e da impressão.'}
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-700 px-4 py-2.5 text-xs font-black uppercase tracking-wide text-white transition-colors hover:bg-slate-600"
            >
              <ArrowLeft size={15} /> Voltar
            </button>
            {error && onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-black uppercase tracking-wide text-white transition-colors hover:bg-blue-700"
              >
                <RefreshCw size={15} /> Tentar novamente
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document === 'undefined' ? modal : createPortal(modal, document.body);
};

const DespesaReciboModal: React.FC<DespesaReciboModalProps> = ({
  data,
  item,
  contas = [],
  parceiros = [],
  onClose,
}) => {
  const receiptId = item?.despesaLancamentoId || item?.id || '';
  const snapshotQuery = useQuery({
    queryKey: ['despesas', 'recibo-institucional', receiptId],
    queryFn: () => despesasService.getDespesaReciboSnapshot(receiptId),
    enabled: Boolean(item && receiptId && !item.isRateioDerived),
    staleTime: 5 * 60_000,
  });
  const isSnapshotLoading = Boolean(item && snapshotQuery.isPending);
  const isOverlayScreen = isSnapshotLoading || snapshotQuery.isError || Boolean(item?.isRateioDerived);
  const snapshot = snapshotQuery.data || null;
  const receipt = useMemo(() => {
    if (snapshot) return mapSnapshotToReceipt(snapshot);
    const fallback = data || (item ? despesaToReciboData(item) : null);
    if (!fallback || !item) return fallback;
    const parceiro = parceiros.find((candidate) => candidate.id === item.fornecedorId);
    return {
      ...fallback,
      contaBancariaNome: fallback.contaBancariaNome || getDespesaContaLabel(item, contas),
      fornecedorDocumento: fallback.fornecedorDocumento || parceiro?.cpf_cnpj || parceiro?.cpfCnpj,
    };
  }, [contas, data, item, parceiros, snapshot]);
  const poloSnapshot = useMemo(() => (
    snapshot ? mapSnapshotToPolo(snapshot) : undefined
  ), [snapshot]);
  const previewItem = useMemo<DespesaReciboPreviewItem | null>(() => {
    if (!receipt) return null;
    const paid = String(receipt.status || '').toUpperCase() === 'PAGO';
    const emissionId = receipt.lancamentoId || `recibo-${receipt.reciboNumero || receipt.descricao || 'despesa'}`;
    return {
      emissionId,
      title: paid ? 'Recibo de pagamento' : 'Comprovante de lançamento',
      targetName: receipt.fornecedorNome || receipt.descricao || 'Despesa',
      validationCode: null,
      validationUrl: null,
      validUntil: null,
      renderPayload: null,
      recibo: receipt,
      poloSnapshot,
    };
  }, [poloSnapshot, receipt]);

  useEffect(() => {
    if (!isOverlayScreen) return undefined;
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
  }, [isOverlayScreen, onClose]);

  if (item?.isRateioDerived) {
    return (
      <ReceiptPreparationScreen
        error="Esta é uma linha econômica de rateio. O recibo pertence somente ao lançamento físico da Matriz."
        onClose={onClose}
      />
    );
  }

  if (isSnapshotLoading) return <ReceiptPreparationScreen onClose={onClose} />;
  if (snapshotQuery.isError) {
    const message = snapshotQuery.error instanceof Error
      ? snapshotQuery.error.message
      : 'Não foi possível preparar o recibo institucional desta despesa.';
    return (
      <ReceiptPreparationScreen
        error={message}
        onClose={onClose}
        onRetry={() => { void snapshotQuery.refetch(); }}
      />
    );
  }
  if (!previewItem) return null;

  return (
    <CanonicalDocumentPreviewModal
      items={[previewItem]}
      title={previewItem.title}
      accentClassName="bg-blue-600 hover:bg-blue-700"
      fileNamePrefix="recibo-despesa"
      onClose={onClose}
      isRenderable={(entry) => Boolean(entry.recibo.descricao?.trim()) && Number.isFinite(entry.recibo.valor)}
      createPdf={createDespesaReciboPdf}
    />
  );
};

export default DespesaReciboModal;
