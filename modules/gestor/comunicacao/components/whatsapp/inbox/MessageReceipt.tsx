import React from 'react';
import { AlertCircle, Check, CheckCheck, Clock3 } from 'lucide-react';

interface MessageReceiptProps {
  status?: string | null;
  compact?: boolean;
}

const normalizeStatus = (status?: string | null) => String(status || 'sent').toLowerCase();

const MessageReceipt: React.FC<MessageReceiptProps> = ({ status, compact = false }) => {
  const value = normalizeStatus(status);
  const size = compact ? 13 : 14;

  if (['read', 'lida'].includes(value)) {
    return <CheckCheck size={size} strokeWidth={2.2} className="text-[#53bdeb]" aria-label="Lida" />;
  }

  if (['delivered', 'entregue', 'received', 'recebida'].includes(value)) {
    return <CheckCheck size={size} strokeWidth={2.2} className="text-[#667781]" aria-label="Entregue" />;
  }

  if (['failed', 'error', 'erro'].includes(value)) {
    return <AlertCircle size={size} className="text-[#ea4335]" aria-label="Falha no envio" />;
  }

  if (['queued', 'pending', 'enviando'].includes(value)) {
    return <Clock3 size={size} className="text-[#667781]" aria-label="Enviando" />;
  }

  return <Check size={size} strokeWidth={2.2} className="text-[#667781]" aria-label="Enviada" />;
};

export default MessageReceipt;
