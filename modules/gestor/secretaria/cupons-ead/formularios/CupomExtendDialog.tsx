import React, { useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarClock, X } from 'lucide-react';
import { generateSafeUuid } from '../../../../../lib/randomUuid';
import type { EadCoupon, EadCouponDraft } from '../../../../ead/cupons/coupons-management.types';
import { formatCupomDate } from '../cupons-ead.formatters';
import { useCupomDialog } from '../hooks/useCupomDialog';
import { extendCupomDraft } from './cupom-extension.model';

interface Props {
  coupon: EadCoupon;
  pending: boolean;
  error?: string;
  onSubmit: (coupon: EadCouponDraft, requestId: string) => void;
  onClose: () => void;
}

export const CupomExtendDialog: React.FC<Props> = ({ coupon, pending, error, onSubmit, onClose }) => {
  const titleId = useId();
  const dialogRef = useCupomDialog(onClose, pending);
  const [endsAt, setEndsAt] = useState('');
  const [validation, setValidation] = useState('');
  const request = useRef<{ key: string; id: string } | null>(null);
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;
    try {
      const draft = extendCupomDraft(coupon, endsAt);
      const key = JSON.stringify(draft);
      if (request.current?.key !== key) request.current = { key, id: generateSafeUuid() };
      onSubmit(draft, request.current.id);
    } catch (cause) { setValidation(cause instanceof Error ? cause.message : 'Confira a nova validade.'); }
  };
  const exhausted = coupon.totalLimit !== null && coupon.reservedCount + coupon.confirmedCount >= coupon.totalLimit;
  return createPortal(<div className="cupons-ead-overlay">
    <div className="cupons-ead-dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
      <header><div><h3 id={titleId}>Prorrogar validade de {coupon.code}</h3>
        <p>Validade atual: {formatCupomDate(coupon.endsAt)}</p></div>
        <button type="button" className="cupom-icon-button" aria-label="Fechar prorrogação" disabled={pending} onClick={onClose}><X size={20} /></button></header>
      <form onSubmit={submit}>
        <fieldset disabled={pending} className="cupom-form-grid">
          <div className="cupom-field cupom-field-wide"><label htmlFor="cupom-extend-end">Nova data e hora de validade</label>
            <input id="cupom-extend-end" type="datetime-local" value={endsAt} required
              onChange={event => { setEndsAt(event.target.value); setValidation(''); }} />
            <small>Somente o fim da validade será alterado. As utilizações, limites e benefícios serão preservados.</small>
            {exhausted && <small>Este cupom está esgotado. Prorrogar a validade não libera novas utilizações; revise a quantidade em Editar se necessário.</small>}
            {!coupon.active && <small>Este cupom continuará desativado após a prorrogação.</small>}
          </div>
        </fieldset>
        {(validation || error) && <p role="alert" className="cupom-error">{validation || error}</p>}
        <footer><button type="button" className="cupom-secondary" disabled={pending} onClick={onClose}>Cancelar</button>
          <button type="submit" className="cupom-primary" disabled={pending}><CalendarClock size={16} />{pending ? 'Salvando…' : 'Confirmar prorrogação'}</button></footer>
      </form>
    </div>
  </div>, document.body);
}
