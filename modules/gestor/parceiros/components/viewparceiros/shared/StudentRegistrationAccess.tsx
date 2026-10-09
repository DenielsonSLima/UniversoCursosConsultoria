import React from 'react';
import { Loader2, UserRound } from 'lucide-react';

interface StudentRegistrationAccessProps {
  matriculaPrincipal?: string | null;
  status: 'loading' | 'error' | 'ready';
  legacyIdentifier?: string | null;
}

const StudentRegistrationAccess: React.FC<StudentRegistrationAccessProps> = ({
  matriculaPrincipal,
  status,
  legacyIdentifier,
}) => {
  const primary = String(matriculaPrincipal || '').trim();
  const legacy = String(legacyIdentifier || '').trim();
  const value = status === 'ready' ? primary || legacy : '';
  const label = status === 'ready' && !primary && legacy ? 'Identificador de acesso' : 'Matrícula';

  return (
    <div className="rounded-2xl border border-blue-100 bg-blue-50 p-6">
      <h4 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-slate-800">
        <UserRound size={16} className="text-blue-600" />
        {label}
      </h4>
      {value ? (
        <input
          type="text"
          readOnly
          aria-label={label}
          value={value}
          className="w-full rounded-xl border border-blue-100 bg-white px-4 py-3 font-black tracking-wider text-slate-800"
        />
      ) : (
        <p role="status" className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          {status === 'loading' && <Loader2 size={16} className="animate-spin" />}
          {status === 'loading' ? 'Carregando matrícula…'
            : status === 'error' ? 'Não foi possível carregar a matrícula.'
              : 'Ainda sem matrícula acadêmica.'}
        </p>
      )}
      {status === 'ready' && (
        <p className="mt-3 text-xs font-medium leading-relaxed text-slate-500">
          {primary
            ? 'Use esta mesma matrícula para entrar no portal do aluno com sua senha.'
            : legacy
              ? 'Este aluno ainda não possui matrícula acadêmica. Use este identificador para entrar no portal com sua senha.'
              : 'A matrícula será exibida quando o aluno tiver um vínculo acadêmico.'}
        </p>
      )}
    </div>
  );
};

export default StudentRegistrationAccess;
