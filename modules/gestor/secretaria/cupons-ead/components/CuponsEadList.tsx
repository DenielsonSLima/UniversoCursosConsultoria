import React from 'react';
import { History, Pencil } from 'lucide-react';
import type { EadCoupon } from '../../../../ead/cupons/coupons-management.types';
import { formatCupomDate } from '../cupons-ead.formatters';

interface Props { items: EadCoupon[]; onEdit: (item: EadCoupon) => void; onHistory: (item: EadCoupon) => void }

export function CuponsEadList({ items, onEdit, onHistory }: Props) {
  return <div className="cupons-list">{items.map(coupon => <article key={coupon.id} className="cupons-list-item">
    <div className="cupons-item-title"><strong>{coupon.code}</strong><span className={`cupom-badge ${coupon.active ? 'is-active' : ''}`}>
      {coupon.active ? 'Ativo' : 'Desativado'}</span></div>
    <dl className="cupons-item-details">
      <div><dt>Benefício</dt><dd>{coupon.discountPercent === 100 ? 'Curso gratuito' : '50% de desconto'}</dd></div>
      <div><dt>Quantidade total</dt><dd>{coupon.totalLimit === null ? 'Ilimitada' : `${coupon.totalLimit} utilizações`}</dd></div>
      <div><dt>Cursos por aluno</dt><dd>{coupon.perStudentLimit}</dd></div>
      <div><dt>Cursos participantes</dt><dd>{coupon.allCourses ? 'Todos os cursos EAD' : `${coupon.courseIds.length} curso(s) selecionado(s)`}</dd></div>
      <div><dt>Validade</dt><dd>{formatCupomDate(coupon.startsAt)} até {formatCupomDate(coupon.endsAt)}</dd></div>
      <div><dt>Utilizações</dt><dd>{coupon.reservedCount} reservadas · {coupon.confirmedCount} confirmadas</dd></div>
    </dl>
    <div className="cupons-item-actions"><button type="button" className="cupom-secondary" onClick={() => onHistory(coupon)}>
      <History size={16} />Histórico<span className="sr-only"> de {coupon.code}</span></button>
      <button type="button" className="cupom-secondary" onClick={() => onEdit(coupon)}><Pencil size={16} />Editar<span className="sr-only"> {coupon.code}</span></button></div>
  </article>)}</div>;
}
