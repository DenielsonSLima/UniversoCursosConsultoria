import React from 'react';
import { CalendarClock, History, Pencil } from 'lucide-react';
import type { EadCoupon } from '../../../../ead/cupons/coupons-management.types';
import { formatCupomDate, formatCupomPercent } from '../cupons-ead.formatters';

import { couponBadges } from '../cupons-ead.status';
import { useCupomClock } from '../hooks/useCupomClock';

interface Props { items: EadCoupon[]; onEdit: (item: EadCoupon) => void; onHistory: (item: EadCoupon) => void; onExtend: (item: EadCoupon) => void }

export function CuponsEadList({ items, onEdit, onHistory, onExtend }: Props) {
  const now = useCupomClock(items);
  return <div className="cupons-list">{items.map(coupon => <article key={coupon.id} className="cupons-list-item">
    <div className="cupons-item-title"><strong>{coupon.code}</strong><div className="cupom-status-badges">{couponBadges(coupon, now).map(badge =>
        <span key={badge.label} className={`cupom-badge ${badge.tone}`}>{badge.label}</span>)}</div></div>
    <dl className="cupons-item-details">
      <div><dt>Benefício</dt><dd>{coupon.discountPercent === 100 ? 'Curso gratuito' : `${formatCupomPercent(coupon.discountPercent)} de desconto`}</dd></div>
      <div><dt>Quantidade total</dt><dd>{coupon.totalLimit === null ? 'Ilimitada' : `${coupon.totalLimit} utilizações`}</dd></div>
      <div><dt>Cursos por aluno</dt><dd>{coupon.perStudentLimit}</dd></div>
      <div><dt>Cursos participantes</dt><dd>{coupon.allCourses ? 'Todos os cursos EAD' : `${coupon.courseIds.length} curso(s) selecionado(s)`}</dd></div>
      <div><dt>Validade</dt><dd>{formatCupomDate(coupon.startsAt)} até {formatCupomDate(coupon.endsAt)}</dd></div>
      <div><dt>Utilizações</dt><dd>{coupon.reservedCount} reservadas · {coupon.confirmedCount} confirmadas</dd></div>
    </dl>
    <div className="cupons-item-actions"><button type="button" className="cupom-secondary" onClick={() => onExtend(coupon)}>
      <CalendarClock size={16} />Prorrogar validade<span className="sr-only"> de {coupon.code}</span></button><button type="button" className="cupom-secondary" onClick={() => onHistory(coupon)}>
      <History size={16} />Histórico<span className="sr-only"> de {coupon.code}</span></button>
      <button type="button" className="cupom-secondary" onClick={() => onEdit(coupon)}><Pencil size={16} />Editar<span className="sr-only"> {coupon.code}</span></button></div>
  </article>)}</div>;
}
