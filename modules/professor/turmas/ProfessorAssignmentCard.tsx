import React from 'react';
import { BookOpen, ChevronRight } from 'lucide-react';
import type { ProfessorDisciplinaAssignment } from '../hooks/useProfessorDisciplinas';

interface Props { assignment: ProfessorDisciplinaAssignment; onOpen: () => void }

const ProfessorAssignmentCard: React.FC<Props> = ({ assignment, onOpen }) => <article className="professor-assignment-card">
  <div className="flex items-start gap-3">
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700"><BookOpen size={19} /></span>
    <div className="min-w-0 flex-1"><h3 className="break-words font-medium text-[#122b42]">{assignment.disciplinaNome}</h3>
      <p className="mt-1 break-words text-xs text-slate-600">{assignment.cursoNome}</p>
      <p className="mt-1 break-words text-xs text-slate-500">{assignment.turmaNome} · {assignment.turno}</p>
    </div>
  </div>
  {!assignment.canEdit && <p className="mt-3 w-fit rounded-md border border-amber-100 bg-amber-50 px-2 py-1 text-xs text-amber-800">{assignment.accessLabel}</p>}
  <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 text-xs">
    <div><dt className="text-slate-500">Carga ministrada</dt><dd className="mt-1 text-[13px] text-slate-800">{assignment.cargaHorariaDada}h de {assignment.cargaHoraria}h</dd></div>
    <div><dt className="text-slate-500">Encontros realizados</dt><dd className="mt-1 text-[13px] text-slate-800">{assignment.totalAulasDadas}</dd></div>
    <div><dt className="text-slate-500">Primeira aula</dt><dd className="mt-1">{assignment.primeiraAulaLabel || 'Sem registro'}</dd></div>
    <div><dt className="text-slate-500">Última aula</dt><dd className="mt-1">{assignment.ultimaAulaLabel || 'Sem registro'}</dd></div>
  </dl>
  {assignment.isEstagio && <p className="mt-3 text-xs text-teal-700">{assignment.cargaHorariaEstagio}h de estágio supervisionado</p>}
  <button type="button" onClick={onOpen} className="professor-academic-primary mt-4 w-full">
    {assignment.canEdit ? 'Abrir diário' : 'Consultar diário'}<ChevronRight size={15} />
  </button>
</article>;

export default ProfessorAssignmentCard;
