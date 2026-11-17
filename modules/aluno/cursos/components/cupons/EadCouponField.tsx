import React from 'react';
import { CheckCircle2, Loader2, Tag, X } from 'lucide-react';
import type { EadCouponCheckoutState } from '../../../../ead/cupons/hooks/useEadCouponCheckout';
import { formatEadCheckoutMoney } from '../../eadCheckoutOptions';
import './ead-coupon-field.css';

interface Props { coupon: EadCouponCheckoutState; disabled: boolean }

export default function EadCouponField({ coupon, disabled }: Props) {
  if (!coupon.visible) return null;
  return (
    <section aria-label="Cupom de desconto" className="ead-coupon-field">
      <label htmlFor="ead-coupon-code">
        <Tag size={14} aria-hidden="true" /> Cupom de desconto
      </label>
      <div className="ead-coupon-controls">
        <input id="ead-coupon-code" value={coupon.code} maxLength={64} autoComplete="off"
          placeholder="Digite o código" disabled={disabled}
          onChange={event => coupon.setCode(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); coupon.apply(); } }}
          className="ead-coupon-input" />
        <button type="button" onClick={coupon.apply} disabled={disabled || !coupon.enabled || coupon.isChecking || !coupon.code.trim()}
          className="ead-coupon-apply">
          {coupon.isChecking && <Loader2 size={14} className="animate-spin" aria-hidden="true" />} Aplicar
        </button>
        {coupon.code && <button type="button" onClick={coupon.clear} disabled={disabled}
          aria-label="Remover cupom" className="ead-coupon-remove">
          <X size={16} aria-hidden="true" />
        </button>}
      </div>
      {coupon.isChecking && <p role="status" className="ead-coupon-help">Conferindo o cupom...</p>}
      {coupon.error && <p role="alert" className="ead-coupon-error">{coupon.error}</p>}
      {coupon.quote && <div role="status" className="ead-coupon-summary">
        <p className="ead-coupon-summary-title"><CheckCircle2 size={15} aria-hidden="true" /><span>Cupom {coupon.quote.code} aplicado</span></p>
        <dl>
          <dt>Valor original</dt><dd>{formatEadCheckoutMoney(coupon.quote.originalAmount)}</dd>
          <dt>Desconto ({coupon.quote.discountPercent.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%)</dt><dd>{formatEadCheckoutMoney(coupon.quote.discountAmount)}</dd>
          <dt className="ead-coupon-total">Total a pagar</dt><dd className="ead-coupon-total">{formatEadCheckoutMoney(coupon.quote.payableAmount)}</dd>
        </dl>
      </div>}
    </section>
  );
}
