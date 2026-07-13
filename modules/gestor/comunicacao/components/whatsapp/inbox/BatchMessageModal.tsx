import React, { useState } from 'react';
import { AlertTriangle, RefreshCw, Send, X } from 'lucide-react';

export interface BatchSendResult {
  sent: number;
  skipped: number;
  failures: string[];
}

interface BatchMessageModalProps {
  selectedCount: number;
  sendableCount: number;
  apiReady: boolean;
  onClose: () => void;
  onSend: (message: string) => Promise<BatchSendResult>;
}

const BatchMessageModal: React.FC<BatchMessageModalProps> = ({
  selectedCount,
  sendableCount,
  apiReady,
  onClose,
  onSend,
}) => {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<BatchSendResult | null>(null);
  const blockedCount = Math.max(selectedCount - sendableCount, 0);

  const handleSend = async () => {
    const text = message.trim();
    if (!text || sending) return;

    setSending(true);
    try {
      setResult(await onSend(text));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#001a33]/45 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex min-h-[66px] items-center justify-between border-b border-slate-100 px-5">
          <div>
            <h3 className="text-lg font-bold tracking-tight text-[#001a33]">Enviar mensagem em lote</h3>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              {sendableCount} de {selectedCount} conversa(s) prontas para envio.
            </p>
          </div>
          <button onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700" title="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {!apiReady && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">
              Configure a API da Meta antes de enviar mensagens em lote.
            </div>
          )}

          {blockedCount > 0 && (
            <div className="flex gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-semibold text-slate-600">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-500" />
              {blockedCount} conversa(s) serão ignoradas por falta de aluno vinculado ou telefone válido.
            </div>
          )}

          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Mensagem</span>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Escreva a mensagem para os contatos selecionados..."
              className="mt-2 h-36 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold leading-relaxed text-slate-700 outline-none transition-all focus:border-emerald-500 focus:bg-white"
            />
          </label>

          <p className="text-xs font-medium leading-relaxed text-slate-500">
            Mensagens livres em lote dependem das regras da Meta, incluindo janela de atendimento quando aplicável. Para campanhas fora da janela, use templates aprovados.
          </p>

          {result && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">
              {result.sent} envio(s) concluído(s). {result.skipped} ignorado(s).
              {result.failures.length > 0 && <span className="block pt-1 text-rose-700">{result.failures.slice(0, 2).join(' | ')}</span>}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="min-h-[42px] rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold uppercase tracking-wide text-slate-600 transition-colors hover:bg-slate-50">
              Fechar
            </button>
            <button onClick={handleSend} disabled={!apiReady || sendableCount === 0 || !message.trim() || sending} className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-bold uppercase tracking-wide text-white transition-colors hover:bg-emerald-700 disabled:opacity-40">
              {sending ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
              Enviar para selecionados
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BatchMessageModal;
