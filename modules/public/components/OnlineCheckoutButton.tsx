import React, { useState } from 'react';
import { CheckCircle2, CreditCard, FileText, Loader2, X, Zap } from 'lucide-react';
import { asaasIntegrationService } from '../../asaas/asaas.service';
import EadPaymentModal from '../../ead/components/EadPaymentModal';
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
        const paymentMethod = String(result.payment.method || '').toUpperCase();
        if (paymentMethod === 'BOLETO') {
          const boletoUrl = result.payment.bankSlipUrl || result.payment.invoiceUrl || result.url;
          if (boletoUrl) {
            setLoading(false);
            window.location.assign(boletoUrl);
            return;
          }
        }
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
        <EadPaymentModal
          panel={paymentPanel}
          onClose={() => setPaymentPanel(null)}
          onCopied={() => setToast({ title: 'Pix copiado', message: 'Código Pix copia e cola copiado.', tone: 'success' })}
        />
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
