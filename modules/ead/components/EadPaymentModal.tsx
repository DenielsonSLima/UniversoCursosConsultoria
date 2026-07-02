import React, { useEffect } from 'react';
import { ArrowUpRight, Copy, FileText, QrCode, X } from 'lucide-react';

export interface EadPaymentPanelData {
  url?: string | null;
  receivableId?: string | null;
  alreadyPaid?: boolean;
  alreadyPending?: boolean;
  awaitingWebhook?: boolean;
  payment?: {
    id?: string | null;
    method?: string | null;
    status?: string | null;
    value?: number | string | null;
    displayValue?: string | null;
    dueDate?: string | null;
    invoiceUrl?: string | null;
    bankSlipUrl?: string | null;
    courseName?: string | null;
    recipient?: {
      name?: string | null;
      document?: string | null;
    } | null;
    pixQrCode?: {
      encodedImage?: string | null;
      payload?: string | null;
      expirationDate?: string | null;
    } | null;
  };
}

interface EadPaymentModalProps {
  panel: EadPaymentPanelData;
  onClose: () => void;
  onCopied?: () => void;
}

const formatCurrencyDisplay = (value: number | string | null | undefined) => {
  if (value === null || value === undefined || value === '') return 'Valor informado pelo Asaas';
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return String(value);
  return parsed.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const formatDateDisplay = (value?: string | null) => {
  if (!value) return null;
  const [year, month, day] = String(value).slice(0, 10).split('-');
  if (!year || !month || !day) return String(value);
  return `${day}/${month}/${year}`;
};

const EadPaymentModal: React.FC<EadPaymentModalProps> = ({ panel, onClose, onCopied }) => {
  const payment = panel.payment || {};
  const method = String(payment.method || '').toUpperCase();
  const isPix = method === 'PIX';
  const isBoleto = method === 'BOLETO';
  const recipientName = payment.recipient?.name || 'Universo Cursos e Consultoria';
  const recipientDocument = payment.recipient?.document || '13.278.137/0001-54';
  const displayValue = payment.displayValue || formatCurrencyDisplay(payment.value);
  const dueDate = formatDateDisplay(payment.dueDate);
  const pixExpiration = formatDateDisplay(payment.pixQrCode?.expirationDate);
  const officialUrl = payment.invoiceUrl || panel.url || payment.bankSlipUrl || null;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const copyPix = async () => {
    const payload = payment.pixQrCode?.payload;
    if (!payload) return;
    await navigator.clipboard.writeText(payload);
    onCopied?.();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[99999] flex min-h-[100svh] w-screen items-center justify-center overflow-y-auto overscroll-contain bg-slate-950/75 px-4 py-6 backdrop-blur-sm pointer-events-auto"
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="relative z-[100000] w-full max-w-2xl rounded-[2rem] border border-white/20 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-emerald-600">Pagamento EAD</p>
            <h3 className="mt-1 text-xl font-black uppercase tracking-tight text-[#001a33]">
              {isPix ? 'Pague com Pix' : isBoleto ? 'Boleto gerado' : 'Pagamento gerado'}
            </h3>
            <p className="mt-1 text-xs font-bold leading-relaxed text-slate-500">
              O curso só será liberado depois que o webhook confirmado do Asaas atualizar a matrícula.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-100 text-slate-400 hover:text-slate-700"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div className="grid gap-3 rounded-3xl border border-slate-100 bg-slate-50 p-4 text-xs font-bold text-slate-600 sm:grid-cols-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Recebedor</p>
              <p className="mt-1 text-sm font-black text-[#001a33]">{recipientName}</p>
              <p className="mt-1 text-xs text-slate-500">{recipientDocument}</p>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Valor</p>
              <p className="mt-1 text-2xl font-black text-[#001a33]">{displayValue}</p>
              {(dueDate || pixExpiration) && (
                <p className="mt-1 text-xs text-slate-500">
                  {isPix ? 'Expira em' : 'Vencimento'}: {pixExpiration || dueDate}
                </p>
              )}
            </div>
            {payment.courseName && (
              <div className="sm:col-span-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Curso</p>
                <p className="mt-1 text-sm font-black text-[#001a33]">{payment.courseName}</p>
              </div>
            )}
            {payment.id && (
              <div className="sm:col-span-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">ID da cobrança Asaas</p>
                <p className="mt-1 break-all text-xs font-bold text-slate-500">{payment.id}</p>
              </div>
            )}
          </div>

          {isPix && (
            <div className="rounded-3xl border border-emerald-100 bg-emerald-50/60 p-5 text-center">
              {payment.pixQrCode?.encodedImage ? (
                <img
                  src={`data:image/png;base64,${payment.pixQrCode.encodedImage}`}
                  alt="QR Code Pix"
                  className="mx-auto h-56 w-56 rounded-2xl bg-white p-3 shadow-sm"
                />
              ) : (
                <div className="mx-auto flex h-56 w-56 items-center justify-center rounded-2xl bg-white text-emerald-600 shadow-sm">
                  <QrCode size={76} />
                </div>
              )}
              <p className="mt-4 text-xs font-black uppercase tracking-widest text-emerald-700">Pix copia e cola</p>
              <div className="mt-2 rounded-2xl border border-emerald-100 bg-white p-3 text-left">
                <p className="line-clamp-3 break-all text-xs font-bold leading-relaxed text-slate-600">
                  {payment.pixQrCode?.payload || 'Código Pix indisponível. Abra a fatura oficial abaixo.'}
                </p>
              </div>
              <button
                type="button"
                onClick={copyPix}
                className="mt-3 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white hover:bg-emerald-700"
              >
                <Copy size={14} />
                Copiar Pix
              </button>
            </div>
          )}

          {isBoleto && (
            <div className="rounded-3xl border border-blue-100 bg-blue-50/60 p-5">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-blue-600 shadow-sm">
                  <FileText size={26} />
                </div>
                <div>
                  <p className="text-sm font-black uppercase tracking-tight text-[#001a33]">Boleto oficial Asaas</p>
                  <p className="mt-1 text-xs font-bold leading-relaxed text-slate-500">
                    Se o redirecionamento automatico nao abrir, use o acesso oficial abaixo.
                  </p>
                </div>
              </div>
              {payment.bankSlipUrl && (
                <a
                  href={payment.bankSlipUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white hover:bg-blue-700"
                >
                  <ArrowUpRight size={14} />
                  Abrir boleto
                </a>
              )}
            </div>
          )}

          {officialUrl && (
            <a
              href={officialUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:border-slate-300 hover:text-slate-800"
            >
              <ArrowUpRight size={14} />
              Abrir fatura oficial
            </a>
          )}

          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-xs font-bold leading-relaxed text-slate-600">
            A tela pode ser fechada sem cancelar a cobrança. Quando o Asaas confirmar o pagamento, o curso aparece automaticamente em Meus Cursos.
          </div>
        </div>
      </div>
    </div>
  );
};

export default EadPaymentModal;
