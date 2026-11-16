import React, { useId } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { EadCoupon, EadCouponHistoryItem, EadCouponPage } from '../../../../ead/cupons/coupons-management.types';
import { formatCupomDate, formatCupomMoney } from '../cupons-ead.formatters';
import { useCupomDialog } from '../hooks/useCupomDialog';
import { CuponsPagination } from './CuponsPagination';

interface Props {
  coupon: EadCoupon;
  data?: EadCouponPage<EadCouponHistoryItem>;
  loading: boolean;
  error?: string;
  onPage: (page: number) => void;
  onClose: () => void;
}
const labels = { RESERVED: 'Reservada', CONFIRMED: 'Confirmada', RELEASED: 'Liberada sem utilização' };

export function CupomHistoryDialog({ coupon, data, loading, error, onPage, onClose }: Props) {
  const titleId = useId();
  const dialogRef = useCupomDialog(onClose);
  return createPortal(<div className="cupons-ead-overlay"><div className="cupons-ead-dialog" role="dialog" aria-modal="true"
    ref={dialogRef} aria-labelledby={titleId} tabIndex={-1}>
    <header><div><h3 id={titleId}>Histórico · {coupon.code}</h3><p>Composição do benefício e situação de cada utilização.</p></div>
      <button type="button" className="cupom-icon-button" onClick={onClose} aria-label="Fechar histórico"><X size={20} /></button></header>
    <div className="cupom-history-content" aria-busy={loading}>
      {loading && <p role="status">Carregando histórico…</p>}
      {error && <p role="alert" className="cupom-error">{error}</p>}
      {!loading && !error && data?.items.length === 0 && <p>Nenhuma utilização registrada para este cupom.</p>}
      {!error && data?.items.map(item => <article key={item.id} className="cupom-history-item">
        <div className="cupons-item-title"><strong>{item.studentName}</strong><div className="cupom-history-status">
          <span className="cupom-badge">{labels[item.status]}</span>
          {item.reviewRequired && <span className="cupom-badge is-review">Em revisão</span>}</div></div>
        <p>{item.courseName}</p><dl className="cupons-item-details">
          <div><dt>Valor original</dt><dd>{formatCupomMoney(item.originalAmount)}</dd></div>
          <div><dt>Benefício concedido</dt><dd>{formatCupomMoney(item.discountAmount)}</dd></div>
          <div><dt>Valor a pagar</dt><dd>{formatCupomMoney(item.payableAmount)}</dd></div>
          <div><dt>Recebido</dt><dd>{formatCupomMoney(item.receivedAmount)}</dd></div>
          <div><dt>Registrado em</dt><dd>{formatCupomDate(item.createdAt)}</dd></div>
          {item.confirmedAt && <div><dt>Confirmado em</dt><dd>{formatCupomDate(item.confirmedAt)}</dd></div>}
          {item.releasedAt && <div><dt>Reserva liberada em</dt><dd>{formatCupomDate(item.releasedAt)}</dd></div>}
        </dl>
      </article>)}
      <p className="cupom-help">Gratuidade não representa entrada financeira. Utilizações reservadas aguardam a confirmação do pagamento.</p>
      {data && <CuponsPagination page={data.page} pageSize={data.pageSize} total={data.total} pending={loading} onChange={onPage} />}
    </div><footer><button type="button" className="cupom-secondary" onClick={onClose}>Fechar</button></footer>
  </div></div>, document.body);
}
