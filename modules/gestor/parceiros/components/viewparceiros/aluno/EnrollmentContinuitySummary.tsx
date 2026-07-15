import React from 'react';
import { BookCheck } from 'lucide-react';

interface EnrollmentContinuitySummaryProps {
  enrollment: any;
}

const EnrollmentContinuitySummary: React.FC<EnrollmentContinuitySummaryProps> = ({ enrollment }) => {
  const credits = enrollment.matricula_aproveitamentos || [];
  if (!enrollment.origem_matricula_id && credits.length === 0) return null;

  return (
    <div className="mt-3 rounded-xl border border-violet-100 bg-violet-50 px-3 py-2 text-violet-800">
      <div className="flex items-center gap-2 text-[10px] font-black uppercase">
        <BookCheck size={13} />
        {enrollment.continuidade_tipo?.replaceAll('_', ' ') || 'Continuidade acadêmica'}
      </div>
      <p className="mt-1 text-[10px] font-bold">
        {credits.length} disciplina{credits.length === 1 ? '' : 's'} preservada{credits.length === 1 ? '' : 's'}.
      </p>
      {credits.length > 0 && (
        <p className="mt-1 text-[10px] text-violet-700/80">
          {credits.map((credit: any) => credit.disciplinas?.nome || 'Disciplina').join(' · ')}
        </p>
      )}
    </div>
  );
};

export default EnrollmentContinuitySummary;
