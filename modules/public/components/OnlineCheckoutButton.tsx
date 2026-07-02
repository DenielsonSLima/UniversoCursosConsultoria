import React, { useState } from 'react';
import { CheckCircle2, Copy, CreditCard, ExternalLink, FileText, Loader2, QrCode, X, Zap } from 'lucide-react';
import { asaasIntegrationService } from '../../asaas/asaas.service';
import { ensureLinkedAlunoProfile, getPortalProfile, savePortalSession } from '../../login/portal-session';

interface OnlineCheckoutButtonProps {
  courseId: string;
  turmaId?: string | null;
  disabled?: boolean;
  disabledReason?: string | null;
  availabilityLoading?: boolean;
  eadInline?: boolean;
}

const OnlineCheckoutButton: React.FC<OnlineCheckoutButtonProps> = ({
  courseId,
  turmaId = null,
  disabled = false,
  disabledReason = null,
  availabilityLoading = false,
  eadInline = false,
}) => {
  const [loading, setLoading] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<'PIX' | 'BOLETO'>('PIX');
  const [paymentPanel, setPaymentPanel] = useState<any | null>(null);
  const [toast, setToast] = useState<{ title: string; message: string; tone: 'success' | 'error' } | null>(null);
  const effectiveDisabled = loading || disabled || availabilityLoading;

  const handleCheckout = async () => {
    if (effectiveDisabled) return;
    setLoading(true);
    try {
      setToast(null);
      const profile = await getPortalProfile({ preferredRole: 'Aluno', allowedRoles: ['Aluno'] })
        || await ensureLinkedAlunoProfile();

      if (!profile || profile.tipo !== 'Aluno') {
        const redirect = encodeURIComponent(window.location.pathname + window.location.search);
        setToast({
          title: 'Login necessário',
          message: 'Entre ou crie seu cadastro de aluno para matricular-se e pagar este curso.',
          tone: 'error',
        });
        setLoading(false);
        window.location.assign(`/login?mode=cadastro&redirect=${redirect}`);
        return;
      }

      savePortalSession(profile);
      const result = await asaasIntegrationService.getPublicCheckout(
        courseId,
        profile.id,
        turmaId,
        eadInline ? { method: selectedMethod, installments: 1 } : undefined,
      );
      setToast({
        title: 'Pagamento preparado',
        message: eadInline ? 'A cobrança EAD foi gerada com segurança.' : 'Você será redirecionado para concluir a matrícula com segurança.',
        tone: 'success',
      });
      if (eadInline && result.payment) {
        setPaymentPanel(result);
        setLoading(false);
        return;
      }
      window.location.assign(result.url);
    } catch (error) {
      setToast({
        title: 'Pagamento não iniciado',
        message: error instanceof Error ? error.message : 'Não foi possível iniciar o pagamento.',
        tone: 'error',
      });
      setLoading(false);
    }
  };

  return (
    <>
      {toast && (
        <div className={`fixed right-6 top-24 z-50 w-[min(92vw,380px)] rounded-3xl border bg-white p-5 shadow-2xl animate-fadeIn ${
          toast.tone === 'success' ? 'border-emerald-100 shadow-emerald-900/10' : 'border-red-100 shadow-red-900/10'
        }`}>
          <div className="flex items-start gap-3">
            <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl ${
              toast.tone === 'success' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
            }`}>
              {toast.tone === 'success' ? <CheckCircle2 size={18} /> : <X size={18} />}
            </div>
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-black uppercase tracking-wider ${
                toast.tone === 'success' ? 'text-emerald-800' : 'text-red-800'
              }`}>
                {toast.title}
              </p>
              <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">{toast.message}</p>
            </div>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="rounded-xl p-1 text-slate-300 transition-colors hover:bg-slate-50 hover:text-slate-600"
              aria-label="Fechar notificação"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {paymentPanel && (
        <div className="fixed inset-0 z-[80] flex h-dvh w-screen items-center justify-center overflow-y-auto bg-slate-950/70 px-4 py-6">
          <div className="w-full max-w-xl rounded-[2rem] border border-white/20 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-600">Pagamento EAD</p>
                <h3 className="mt-1 text-xl font-black uppercase tracking-tight text-[#001a33]">
                  {paymentPanel.payment?.method === 'PIX' ? 'Pague com Pix' : 'Boleto gerado'}
                </h3>
                <p className="mt-1 text-xs font-bold leading-relaxed text-slate-500">
                  A liberação do curso acontece somente após confirmação pelo webhook do Asaas.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPaymentPanel(null)}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-100 text-slate-400 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 px-6 py-5">
              {paymentPanel.payment?.method === 'PIX' && (
                <div className="rounded-3xl border border-emerald-100 bg-emerald-50/60 p-5 text-center">
                  {paymentPanel.payment?.pixQrCode?.encodedImage ? (
                    <img
                      src={`data:image/png;base64,${paymentPanel.payment.pixQrCode.encodedImage}`}
                      alt="QR Code Pix"
                      className="mx-auto h-56 w-56 rounded-2xl bg-white p-3 shadow-sm"
                    />
                  ) : (
                    <div className="mx-auto flex h-56 w-56 items-center justify-center rounded-2xl bg-white text-emerald-600 shadow-sm">
                      <QrCode size={80} />
                    </div>
                  )}
                  <p className="mt-4 text-xs font-black uppercase tracking-widest text-emerald-700">Pix copia e cola</p>
                  <div className="mt-2 rounded-2xl border border-emerald-100 bg-white p-3 text-left">
                    <p className="line-clamp-3 break-all text-xs font-bold leading-relaxed text-slate-600">
                      {paymentPanel.payment?.pixQrCode?.payload || 'Código Pix indisponível. Abra a fatura oficial abaixo.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      const payload = paymentPanel.payment?.pixQrCode?.payload;
                      if (!payload) return;
                      await navigator.clipboard.writeText(payload);
                      setToast({ title: 'Pix copiado', message: 'Código Pix copia e cola copiado.', tone: 'success' });
                    }}
                    className="mt-3 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white hover:bg-emerald-700"
                  >
                    <Copy size={14} />
                    Copiar Pix
                  </button>
                </div>
              )}

              {paymentPanel.payment?.method === 'BOLETO' && (
                <div className="rounded-3xl border border-blue-100 bg-blue-50/60 p-5">
                  <div className="flex items-center gap-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-blue-600 shadow-sm">
                      <FileText size={26} />
                    </div>
                    <div>
                      <p className="text-sm font-black uppercase tracking-tight text-[#001a33]">Boleto oficial Asaas</p>
                      <p className="mt-1 text-xs font-bold leading-relaxed text-slate-500">
                        Abra ou baixe o boleto oficial gerado pelo Asaas. A matrícula continua aguardando confirmação.
                      </p>
                    </div>
                  </div>
                  {paymentPanel.payment?.bankSlipUrl && (
                    <a
                      href={paymentPanel.payment.bankSlipUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white hover:bg-blue-700"
                    >
                      <ExternalLink size={14} />
                      Abrir boleto
                    </a>
                  )}
                </div>
              )}

              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-xs font-bold leading-relaxed text-slate-600">
                Se o pagamento já foi feito, aguarde alguns instantes. O acesso ao curso é liberado automaticamente quando o Asaas confirmar o pagamento.
              </div>
            </div>
          </div>
        </div>
      )}

      {eadInline && (
        <div className="mb-3 grid grid-cols-2 gap-2">
          {[
            { method: 'PIX' as const, label: 'Pix', icon: Zap },
            { method: 'BOLETO' as const, label: 'Boleto', icon: FileText },
          ].map(({ method, label, icon: Icon }) => (
            <button
              key={method}
              type="button"
              onClick={() => setSelectedMethod(method)}
              disabled={effectiveDisabled}
              className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-[10px] font-black uppercase tracking-widest transition-all ${
                selectedMethod === method
                  ? 'border-emerald-500 bg-emerald-600 text-white shadow-sm'
                  : 'border-slate-200 bg-white text-slate-500 hover:border-emerald-200 hover:text-emerald-700'
              }`}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>
      )}

        <button
          type="button"
          onClick={handleCheckout}
          disabled={effectiveDisabled}
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-4 text-[10px] font-black uppercase tracking-widest text-white shadow-md shadow-emerald-600/20 transition-all hover:bg-emerald-700 disabled:opacity-60"
        >
          {loading || availabilityLoading ? <Loader2 className="animate-spin" size={15} /> : <CreditCard size={15} />}
          {loading || availabilityLoading
            ? 'Verificando disponibilidade...'
            : eadInline
              ? selectedMethod === 'PIX' ? 'Gerar QR Code Pix' : 'Gerar boleto'
              : 'Matricular e pagar online'}
      </button>

      {effectiveDisabled && !loading && (
        <p className={`mb-4 text-xs rounded-xl border px-4 py-3 ${
          availabilityLoading
            ? 'border-slate-200 bg-slate-50 text-slate-500'
            : 'border-rose-200 bg-rose-50 text-rose-700'
        }`}>
          {availabilityLoading ? 'Verificando vagas e período de inscrição...' : (disabledReason || 'As inscrições estão fechadas para este curso no momento.')}
        </p>
      )}
    </>
  );
};

export default OnlineCheckoutButton;
