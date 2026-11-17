import React, { useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Save, X } from 'lucide-react';
import { generateSafeUuid } from '../../../../../lib/randomUuid';
import InstitutionalSelect from '../../../../shared/components/InstitutionalSelect';
import type { EadCoupon, EadCouponCourseOption, EadCouponDraft } from '../../../../ead/cupons/coupons-management.types';
import { useCupomDialog } from '../hooks/useCupomDialog';
import { createCupomForm, cupomFormToDraft, type CupomFormState } from './cupom-form.model';
import { CupomCoursesField } from './CupomCoursesField';

interface Props {
  coupon: EadCoupon | null;
  courses: EadCouponCourseOption[];
  coursesLoading: boolean;
  coursesError?: string;
  pending: boolean;
  error?: string;
  onCourseSearch: (search: string) => void;
  onSubmit: (coupon: EadCouponDraft, requestId: string) => void;
  onClose: () => void;
}

export const CupomEadForm: React.FC<Props> = (props) => {
  const { coupon, pending, onClose } = props;
  const titleId = useId();
  const dialogRef = useCupomDialog(onClose, pending);
  const [form, setForm] = useState(() => createCupomForm(coupon));
  const [validation, setValidation] = useState('');
  const request = useRef<{ key: string; id: string } | null>(null);
  const benefitLocked = Boolean(coupon && (coupon.reservedCount > 0 || coupon.confirmedCount > 0));
  const change = <K extends keyof CupomFormState>(key: K, value: CupomFormState[K]) => {
    setForm(previous => ({ ...previous, [key]: value }));
    setValidation('');
  };
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;
    try {
      const draft = cupomFormToDraft(form, coupon?.id, coupon?.updatedAt);
      const key = JSON.stringify(draft);
      if (request.current?.key !== key) request.current = { key, id: generateSafeUuid() };
      props.onSubmit(draft, request.current.id);
    } catch (error) { setValidation(error instanceof Error ? error.message : 'Confira os campos.'); }
  };
  return createPortal(<div className="cupons-ead-overlay">
    <div className="cupons-ead-dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
      <header><div><h3 id={titleId}>{coupon ? 'Editar cupom EAD' : 'Novo cupom EAD'}</h3>
        <p>Configure o benefício, a validade e os limites de utilização.</p></div>
        <button type="button" className="cupom-icon-button" aria-label="Fechar formulário" disabled={pending} onClick={onClose}><X size={20} /></button></header>
      <form onSubmit={submit}>
        <fieldset disabled={pending} className="cupom-form-grid">
          <div className="cupom-field"><label htmlFor="cupom-code">Código do cupom</label>
            <input id="cupom-code" value={form.code} autoComplete="off" maxLength={40} required readOnly={benefitLocked}
              onChange={event => change('code', event.target.value.toUpperCase())} placeholder="Ex.: EAD50" /></div>
          <div className="cupom-field"><label htmlFor="cupom-benefit">Percentual de desconto (%)</label>
            <input id="cupom-benefit" type="text" inputMode="decimal" value={form.discountPercent} required readOnly={benefitLocked}
              autoComplete="off" maxLength={8} placeholder="Ex.: 25 ou 12,5" aria-describedby="cupom-benefit-help"
              onChange={event => change('discountPercent', event.target.value)} />
            <small id="cupom-benefit-help">Informe manualmente o percentual. Com 100%, o curso é gratuito.</small>
            {benefitLocked && <small>Código e percentual são preservados quando há utilizações reservadas ou confirmadas.</small>}</div>
          <div className="cupom-field"><label htmlFor="cupom-start">Início da validade</label>
            <input id="cupom-start" type="datetime-local" value={form.startsAt} required onChange={event => change('startsAt', event.target.value)} /></div>
          <div className="cupom-field"><label htmlFor="cupom-end">Fim da validade</label>
            <input id="cupom-end" type="datetime-local" value={form.endsAt} required onChange={event => change('endsAt', event.target.value)} /></div>
          <div className="cupom-field"><label htmlFor="cupom-total-mode">Quantidade total</label>
            <InstitutionalSelect id="cupom-total-mode" ariaLabel="Tipo de quantidade total" value={form.unlimited ? 'unlimited' : 'limited'} disabled={pending}
              options={[{ value: 'limited', label: 'Quantidade limitada' }, { value: 'unlimited', label: 'Ilimitada' }]}
              onValueChange={value => change('unlimited', value === 'unlimited')} />
            {!form.unlimited && <input aria-label="Total de utilizações" type="number" inputMode="numeric" min="1" step="1" required
              value={form.totalLimit} onChange={event => change('totalLimit', event.target.value)} />}</div>
          <div className="cupom-field"><label htmlFor="cupom-student-limit">Cursos por aluno</label>
            <input id="cupom-student-limit" type="number" inputMode="numeric" min="1" step="1" required value={form.perStudentLimit}
              onChange={event => change('perStudentLimit', event.target.value)} /><small>Limite de cursos adquiridos com este cupom por aluno.</small></div>
          <div className="cupom-field"><label htmlFor="cupom-course-mode">Aplicar aos cursos</label>
            <InstitutionalSelect id="cupom-course-mode" ariaLabel="Abrangência de cursos" value={form.allCourses ? 'all' : 'selected'} disabled={pending}
              options={[{ value: 'all', label: 'Todos os cursos EAD' }, { value: 'selected', label: 'Selecionar cursos EAD' }]}
              onValueChange={value => change('allCourses', value === 'all')} />
            <small>O cupom vale em todos os polos, respeitando os cursos participantes.</small></div>
          <div className="cupom-field"><label htmlFor="cupom-active">Situação</label>
            <InstitutionalSelect id="cupom-active" ariaLabel="Situação do cupom" value={form.active ? 'active' : 'inactive'} disabled={pending}
              options={[{ value: 'active', label: 'Ativo' }, { value: 'inactive', label: 'Desativado' }]}
              onValueChange={value => change('active', value === 'active')} /></div>
          {!form.allCourses && <CupomCoursesField courseIds={form.courseIds} courses={props.courses} loading={props.coursesLoading}
            error={props.coursesError} disabled={pending} onSearch={props.onCourseSearch} onChange={ids => change('courseIds', ids)} />}
        </fieldset>
        {(validation || props.error) && <p role="alert" className="cupom-error">{validation || props.error}</p>}
        <footer><button type="button" className="cupom-secondary" disabled={pending} onClick={onClose}>Cancelar</button>
          <button className="cupom-primary" type="submit" disabled={pending}>{pending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {pending ? 'Salvando…' : 'Salvar cupom'}</button></footer>
      </form>
    </div>
  </div>, document.body);
}
