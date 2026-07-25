import React, { useEffect, useRef, useState } from 'react';
import { ArrowRightLeft, ChevronDown, LoaderCircle, X } from 'lucide-react';
import { WhatsAppConversation, WhatsAppRoutingPolo, WhatsAppSector } from '../whatsapp.types';

const SECTORS: Array<{ value: WhatsAppSector; label: string }> = [
  { value: 'comercial_matriculas', label: 'Comercial / Matrículas' },
  { value: 'secretaria', label: 'Secretaria' },
  { value: 'financeiro', label: 'Financeiro' },
  { value: 'pedagogico_coordenacao', label: 'Coordenação pedagógica' },
  { value: 'atendimento_geral', label: 'Atendimento geral' },
];

interface TransferConversationMenuProps {
  conversation: WhatsAppConversation;
  polos: WhatsAppRoutingPolo[];
  onTransfer: (input: {
    conversationId: string;
    setor: WhatsAppSector;
    poloId: string;
    motivo?: string;
  }) => Promise<void>;
}

const TransferConversationMenu: React.FC<TransferConversationMenuProps> = ({
  conversation,
  polos,
  onTransfer,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [sector, setSector] = useState<WhatsAppSector>(
    conversation.setor || 'atendimento_geral',
  );
  const [poloId, setPoloId] = useState(conversation.polo_id || '');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSector(conversation.setor || 'atendimento_geral');
    setPoloId(conversation.polo_id || '');
    setReason('');
  }, [conversation.id, conversation.polo_id, conversation.setor]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, [open]);

  const submit = async () => {
    if (!poloId || saving) return;
    setSaving(true);
    try {
      await onTransfer({
        conversationId: conversation.id,
        setor: sector,
        poloId,
        motivo: reason.trim() || undefined,
      });
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex min-h-[34px] items-center gap-1.5 rounded-xl border border-blue-100 bg-blue-50 px-3 text-[11px] font-bold uppercase text-blue-700 transition-colors hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        aria-expanded={open}
        title="Transferir para outro setor e polo"
      >
        <ArrowRightLeft size={14} />
        Transferir
        <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+10px)] z-40 w-[340px] rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-[0_24px_70px_-24px_rgba(15,23,42,0.45)]">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-black text-[#001a33]">Transferir atendimento</p>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                A conversa sai da fila atual e aparece apenas para usuários do novo setor e polo.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label="Fechar transferência"
            >
              <X size={15} />
            </button>
          </div>

          <label className="block text-[11px] font-black uppercase tracking-wide text-slate-500">
            Setor
            <select
              value={sector}
              onChange={(event) => setSector(event.target.value as WhatsAppSector)}
              className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold normal-case tracking-normal text-slate-700 outline-none focus:border-blue-400 focus:bg-white"
            >
              {SECTORS.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>

          <label className="mt-3 block text-[11px] font-black uppercase tracking-wide text-slate-500">
            Polo responsável
            <select
              value={poloId}
              onChange={(event) => setPoloId(event.target.value)}
              className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold normal-case tracking-normal text-slate-700 outline-none focus:border-blue-400 focus:bg-white"
            >
              <option value="">Selecione o polo</option>
              {polos.map((polo) => (
                <option key={polo.id} value={polo.id}>
                  {[polo.nome, polo.cidade].filter(Boolean).join(' — ')}
                </option>
              ))}
            </select>
          </label>

          <label className="mt-3 block text-[11px] font-black uppercase tracking-wide text-slate-500">
            Motivo opcional
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={240}
              placeholder="Ex.: dúvida sobre matrícula"
              className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium normal-case tracking-normal text-slate-700 outline-none placeholder:text-slate-400 focus:border-blue-400 focus:bg-white"
            />
          </label>

          <button
            type="button"
            onClick={submit}
            disabled={!poloId || saving}
            className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#001a33] text-xs font-black uppercase tracking-wide text-white transition-colors hover:bg-[#082d52] disabled:cursor-not-allowed disabled:opacity-45"
          >
            {saving ? <LoaderCircle size={15} className="animate-spin" /> : <ArrowRightLeft size={15} />}
            Confirmar transferência
          </button>
        </div>
      )}
    </div>
  );
};

export default TransferConversationMenu;
