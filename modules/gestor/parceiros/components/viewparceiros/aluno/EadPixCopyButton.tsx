import { useState } from 'react';
import { Copy, Loader2 } from 'lucide-react';
import { copyTextToClipboard } from '../../../../../../lib/clipboard';
import { isValidBanesePixPayload } from '../../../../../aluno/financeiro/banese/banese-payment.utils';
import ToastNotification, { useToast } from '../../shared/ToastNotification';
import type { StudentReceivable } from './parceiro-aluno-financeiro.service';

export default function EadPixCopyButton({ item }: { item: StudentReceivable }) {
  const [copying, setCopying] = useState(false);
  const { toasts, removeToast, toast } = useToast();
  const payload = item.pix_copy_payload;
  if (item.can_open_boleto !== true || !['PENDENTE', 'VENCIDO'].includes(item.status)
    || item.data_pagamento || !isValidBanesePixPayload(payload)) return null;

  const copy = async () => {
    if (copying) return;
    setCopying(true);
    try {
      if (!await copyTextToClipboard(payload!)) throw new Error('Clipboard indisponível.');
      toast.success('Pix copiado', 'Cole o código no aplicativo do seu banco.');
    } catch {
      toast.error('Não foi possível copiar o Pix', 'Tente novamente ou abra o boleto para selecionar o código.');
    } finally {
      setCopying(false);
    }
  };

  return <>
    <button type="button" onClick={() => void copy()} disabled={copying}
      className="inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-sm font-medium text-emerald-800 hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:opacity-60 sm:min-h-10">
      {copying ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
      {copying ? 'Copiando…' : 'Copiar Pix'}
    </button>
    <ToastNotification toasts={toasts} onRemove={removeToast} />
  </>;
}
