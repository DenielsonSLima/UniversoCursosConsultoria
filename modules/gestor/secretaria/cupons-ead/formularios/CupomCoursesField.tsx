import React, { useRef } from 'react';
import { X } from 'lucide-react';
import InstitutionalSelect from '../../../../shared/components/InstitutionalSelect';
import type { EadCouponCourseOption } from '../../../../ead/cupons/coupons-management.types';

interface Props {
  courseIds: string[];
  courses: EadCouponCourseOption[];
  loading: boolean;
  error?: string;
  disabled: boolean;
  onSearch: (search: string) => void;
  onChange: (ids: string[]) => void;
}

export function CupomCoursesField({ courseIds, courses, loading, error, disabled, onSearch, onChange }: Props) {
  const labels = useRef(new Map<string, string>());
  const rememberCourses = () => { for (const course of courses) labels.current.set(course.id, course.name); };
  const label = (id: string, index: number) => courses.find(course => course.id === id)?.name
    || labels.current.get(id) || `Curso vinculado ${index + 1}`;
  return <div className="cupom-field cupom-field-wide">
    <label htmlFor="cupom-course-picker">Cursos participantes</label>
    <InstitutionalSelect id="cupom-course-picker" value="" ariaLabel="Adicionar curso participante"
      placeholder="Buscar e adicionar curso" disabled={disabled} loading={loading} error={error}
      options={courses.filter(course => !courseIds.includes(course.id)).map(course => ({ value: course.id, label: course.name }))}
      onValueChange={id => { rememberCourses(); onChange([...courseIds, id]); }}
      remoteSearch={{ onSearchChange: search => { rememberCourses(); onSearch(search); } }} />
    <div className="cupom-course-chips" aria-label="Cursos selecionados">
      {courseIds.map((id, index) => <span key={id} className="cupom-course-chip">
        <span className="cupom-course-chip-label">{label(id, index)}</span>
        <button type="button" disabled={disabled} aria-label={`Remover ${label(id, index)}`}
          onClick={() => onChange(courseIds.filter(value => value !== id))}><X size={14} /></button>
      </span>)}
    </div>
    <small>Cada curso adquirido com o cupom conta como uma utilização.</small>
  </div>;
}
