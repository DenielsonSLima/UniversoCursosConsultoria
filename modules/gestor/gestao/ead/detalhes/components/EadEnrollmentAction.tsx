import React from 'react';
import { Plus } from 'lucide-react';
import type { GestorPermissions } from '../../../../access-control';
import { canAddAlunoEad } from '../ead-enrollment.model';

export const EadEnrollmentAction: React.FC<{ permissions: GestorPermissions; onClick: () => void }> = ({ permissions, onClick }) =>
  canAddAlunoEad(permissions) ? <button type="button" onClick={onClick}
    className="flex items-center justify-center gap-2 rounded-xl bg-purple-600 px-5 py-3 text-[10px] font-black uppercase tracking-widest text-white shadow-lg shadow-purple-900/20 hover:bg-purple-700">
    <Plus size={15} /> Adicionar aluno
  </button> : null;
