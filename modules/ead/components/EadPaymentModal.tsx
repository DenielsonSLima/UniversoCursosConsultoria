import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpRight, CheckCircle2, Copy, FileText, X } from 'lucide-react';
import { fetchBaneseBoletoDocument } from '../../aluno/shared/baneseBoletoDocument';
import {
  preparePaymentWindow,
  renderPaymentWindowError,
  renderPdfInPaymentWindow,
} from '../../aluno/shared/paymentWindow';
import EadOfficialPixQr from './EadOfficialPixQr';
import { normalizeEadPaymentQrImageSource } from './eadPaymentQrImage';

export interface EadPaymentPanelData {
  url?: string | null;
  presentation?: 'BOLETO' | 'PIX';
  receivableId?: string | null;
  matriculaId?: string | null;
  alreadyPaid?: boolean;
  alreadyPending?: boolean;
  awaitingWebhook?: boolean;
  payment?: {
    id?: string | null;
    provider?: string | null;
    method?: string | null;
    installments?: number | null;
    status?: string | null;
    value?: number | string | null;
    displayValue?: string | null;
    dueDate?: string | null;
    invoiceUrl?: string | null;
      bankSlipUrl?: string | null;
      bankSlipDigitableLine?: string | null;
      bankSlipBarcode?: string | null;
      bankSlipOurNumber?: string | null;
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
}

const formatCurrencyDisplay = (value: number | string | null | undefined) => {
  if (value === null || value === undefined || value === '') return 'Valor informado pelo gateway';
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

const EadPaymentModal: React.FC<EadPaymentModalProps> = ({ panel, onClose }) => {
  const [pixCopied, setPixCopied] = useState(false);
  const [boletoError, setBoletoError] = useState('');
  const [isOpeningBoleto, setIsOpeningBoleto] = useState(false);
  const payment = panel.payment || {};
  const method = String(payment.method || '').toUpperCase();
  const provider = String(payment.provider || 'asaas').toLowerCase();
  const providerName = provider === 'mercado_pago'
    ? 'Mercado Pago'
    : provider.startsWith('banese')
      ? 'Banese'
      : 'Asaas';
  const isPix = method === 'PIX';
  const isBoleto = method === 'BOLETO';
  const hasPixQrCode = Boolean(payment.pixQrCode?.payload || payment.pixQrCode?.encodedImage);
  const wantsInlineBolePix = panel.presentation === 'PIX' && isBoleto;
  const showInlinePix = wantsInlineBolePix || (isPix && (provider === 'asaas' || hasPixQrCode));
  const showBoletoAction = isBoleto && !wantsInlineBolePix;
  const recipientName = payment.recipient?.name || 'Universo Cursos e Consultoria';
  const recipientDocument = payment.recipient?.document || '13.278.137/0001-54';
  const displayValue = payment.displayValue || formatCurrencyDisplay(payment.value);
  const dueDate = formatDateDisplay(payment.dueDate);
  const pixExpiration = formatDateDisplay(payment.pixQrCode?.expirationDate);
  const pixQrImageSource = normalizeEadPaymentQrImageSource(payment.pixQrCode?.encodedImage);
  const officialUrl = payment.invoiceUrl || panel.url || payment.bankSlipUrl || null;
  const expirationLabel = pixExpiration || dueDate || `Informado pelo ${providerName}`;

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
    try {
      await navigator.clipboard.writeText(payload);
    } catch (error) {
      console.warn('Nao foi possivel copiar o Pix automaticamente:', error);
    }
    setPixCopied(true);
    window.setTimeout(() => setPixCopied(false), 2200);
  };

  const openBaneseBoleto = async () => {
    const paymentWindow = preparePaymentWindow();
    setBoletoError('');
    setIsOpeningBoleto(true);
    try {
      const pdf = await fetchBaneseBoletoDocument(String(panel.receivableId || ''));
      if (!renderPdfInPaymentWindow(paymentWindow, pdf)) {
        throw new Error('O navegador bloqueou a nova aba do boleto.');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível abrir o boleto Banese.';
      renderPaymentWindowError(paymentWindow, message);
      setBoletoError(message);
    } finally {
      setIsOpeningBoleto(false);
    }
  };

  if (typeof document === 'undefined') return null;

  return createPortal((
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ead-payment-modal-title"
      className="fixed inset-0 z-[99999] flex h-[100dvh] min-h-[100dvh] w-screen items-center justify-center overflow-hidden overscroll-contain bg-slate-950/75 p-2 backdrop-blur-sm pointer-events-auto sm:p-4 lg:p-6"
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      {pixCopied && createPortal((
        <div className="fixed left-3 right-3 top-3 z-[2147483647] pointer-events-none animate-fadeIn sm:left-auto sm:right-6 sm:top-6">
          <div className="flex items-center justify-center gap-3 rounded-2xl border border-emerald-100 border-l-4 border-l-emerald-500 bg-white px-4 py-3 text-emerald-700 shadow-2xl shadow-slate-900/15 sm:justify-start sm:px-5 sm:py-4">
            <CheckCircle2 size={20} className="shrink-0 text-emerald-500" />
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Pix copia e cola</p>
              <p className="text-sm font-black uppercase tracking-wide">Copiado</p>
            </div>
          </div>
        </div>
      ), document.body)}

      <div className="relative z-[100000] flex max-h-[calc(100dvh-1rem)] w-full max-w-4xl flex-col overflow-hidden rounded-[1.25rem] border border-white/20 bg-white shadow-2xl sm:max-h-[calc(100dvh-2rem)] sm:rounded-[1.75rem] lg:max-h-[calc(100dvh-3rem)]">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:gap-4 sm:px-5 sm:py-4">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-emerald-600">Pagamento EAD</p>
            <h3 id="ead-payment-modal-title" className="mt-1 text-lg font-black uppercase tracking-tight text-[#001a33] sm:text-xl">
              {showInlinePix ? 'Pague com Pix' : isBoleto ? 'Boleto gerado' : 'Pagamento gerado'}
            </h3>
            <p className="mt-1 text-[11px] font-bold leading-relaxed text-slate-500 sm:text-xs">
              O curso será liberado automaticamente após a confirmação do pagamento.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar pagamento"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-100 text-slate-400 hover:text-slate-700"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-3 py-3 sm:px-5 sm:py-4">
          {showInlinePix && (
            <div className="grid gap-4 rounded-[1.25rem] border border-emerald-100 bg-emerald-50/60 p-3 sm:rounded-3xl sm:p-4 lg:grid-cols-[minmax(220px,280px)_1fr]">
              <div className="text-center">
                <EadOfficialPixQr
                  payload={payment.pixQrCode?.payload}
                  imageSource={pixQrImageSource}
                />
                <p className="mt-3 text-[10px] font-black uppercase tracking-widest text-emerald-700">Pix copia e cola</p>
                <div className="mt-2 rounded-2xl border border-emerald-100 bg-white p-3 text-left">
                  <p className="line-clamp-3 break-all text-[11px] font-bold leading-relaxed text-slate-600">
                    {payment.pixQrCode?.payload || 'Codigo Pix indisponivel. Abra a fatura oficial abaixo.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={copyPix}
                  disabled={!payment.pixQrCode?.payload}
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300 sm:w-auto"
                >
                  <Copy size={14} />
                  Copiar Pix
                </button>
              </div>

              <div className="rounded-[1.15rem] border border-white/70 bg-white/80 p-3 shadow-sm sm:rounded-[1.4rem] sm:p-4">
                <div className="rounded-2xl bg-[#001a33] p-3 text-white sm:p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-200">Valor do Pix</p>
                  <p className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">{displayValue}</p>
                  <p className="mt-1 text-xs font-bold text-slate-200">Expira em: {expirationLabel}</p>
                </div>

                <div className="mt-4 grid gap-3 text-xs font-bold text-slate-600 sm:grid-cols-2">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Banco/Gateway</p>
                    <p className="mt-1 text-sm font-black text-[#001a33]">{providerName}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Recebedor</p>
                    <p className="mt-1 text-sm font-black text-[#001a33]">{recipientName}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">CNPJ</p>
                    <p className="mt-1 text-sm font-black text-[#001a33]">{recipientDocument}</p>
                  </div>
                  <div className="sm:col-span-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Curso</p>
                    <p className="mt-1 text-sm font-black text-[#001a33]">{payment.courseName || 'Curso EAD'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Modalidade</p>
                    <p className="mt-1 text-sm font-black text-[#001a33]">EAD</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Liberacao</p>
                    <p className="mt-1 text-sm font-black text-[#001a33]">Após confirmação do pagamento</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {!showInlinePix && (
            <div className="grid gap-3 rounded-3xl border border-slate-100 bg-slate-50 p-4 text-xs font-bold text-slate-600 sm:grid-cols-2">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Banco/Gateway</p>
                <p className="mt-1 text-sm font-black text-[#001a33]">{providerName}</p>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Recebedor</p>
                <p className="mt-1 text-sm font-black text-[#001a33]">{recipientName}</p>
                <p className="mt-1 text-xs text-slate-500">{recipientDocument}</p>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Valor</p>
                <p className="mt-1 text-2xl font-black text-[#001a33]">{displayValue}</p>
                {dueDate && <p className="mt-1 text-xs text-slate-500">Vencimento: {dueDate}</p>}
              </div>
              <div className="sm:col-span-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Curso</p>
                <p className="mt-1 text-sm font-black text-[#001a33]">{payment.courseName || 'Curso EAD'}</p>
                <p className="mt-1 text-xs text-slate-500">Modalidade: EAD</p>
              </div>
            </div>
          )}

          {showBoletoAction && (
            <div className="rounded-3xl border border-blue-100 bg-blue-50/60 p-5">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-blue-600 shadow-sm">
                  <FileText size={26} />
                </div>
                <div>
                  <p className="text-sm font-black uppercase tracking-tight text-[#001a33]">Boleto oficial {providerName}</p>
                  <p className="mt-1 text-xs font-bold leading-relaxed text-slate-500">
                    Se o redirecionamento automatico nao abrir, use o acesso oficial abaixo.
                  </p>
                </div>
              </div>
              {provider.startsWith('banese') ? (
                <button
                  type="button"
                  onClick={openBaneseBoleto}
                  disabled={isOpeningBoleto}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white hover:bg-blue-700"
                >
                  <ArrowUpRight size={14} />
                  {isOpeningBoleto ? 'Preparando PDF...' : 'Abrir boleto'}
                </button>
              ) : payment.bankSlipUrl ? (
                <a href={payment.bankSlipUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white hover:bg-blue-700">
                  <ArrowUpRight size={14} /> Abrir boleto
                </a>
              ) : null}
              {boletoError ? (
                <p className="mt-3 text-xs font-bold text-red-600">{boletoError}</p>
              ) : null}
            </div>
          )}

          {officialUrl && !isBoleto && (
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

          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3 text-[11px] font-bold leading-relaxed text-slate-600 sm:text-xs">
            A tela pode ser fechada sem cancelar a cobrança. Quando o {providerName} confirmar o pagamento, o curso aparece automaticamente em Meus Cursos.
          </div>
        </div>
      </div>
    </div>
  ), document.body);
};

export default EadPaymentModal;
