import React from 'react';
import type { EadTrustAccessStudent } from '../ead-turma.types';
import { isEadEnrollmentPending, statusLabel } from '../ead-turma.presentation';
import { EadTrustAccessAction } from './EadTrustAccessAction';

interface Props {
  turmaId: string;
  alunos: EadTrustAccessStudent[];
  allowed: boolean;
  isLoading: boolean;
  isError: boolean;
}

export const EadTrustAccessPanel = ({ turmaId, alunos, allowed, isLoading, isError }: Props) => {
  if (!allowed) return null;
  const pending = alunos.filter(aluno => isEadEnrollmentPending(aluno.status));
  if (!isLoading && !isError && pending.length === 0) return null;
  return <section aria-label="Acesso EAD por confiança" className="mt-4 rounded-xl border border-blue-100 bg-blue-50/30 p-5">
    <h3 className="text-sm font-medium text-[#001a33]">Acesso EAD por confiança</h3>
    <p className="mt-1 text-xs text-slate-500">Após conferir o comprovante, libere curso, prova e emissão do certificado por até 24 horas. Sem confirmação do pagamento nesse prazo, o acesso será bloqueado e o certificado revogado. Isso não registra pagamento.</p>
    {isLoading ? <p role="status" className="mt-4 text-sm text-slate-500">Carregando matrículas EAD...</p>
      : isError ? <p role="alert" className="mt-4 text-sm text-red-700">Não foi possível conferir as matrículas desta turma. A liberação ficará disponível após a atualização.</p>
        : <ul className="mt-4 divide-y divide-blue-100 rounded-lg border border-blue-100 bg-white">
          {pending.map(aluno => <li key={aluno.matriculaId} className="flex flex-col justify-between gap-3 px-4 py-3 sm:flex-row sm:items-center">
            <div className="min-w-0"><p className="text-sm font-medium text-[#001a33]">{aluno.nome}</p>
              <p className="mt-1 text-xs text-slate-500">{statusLabel(aluno.status)}</p></div>
            <EadTrustAccessAction matriculaId={aluno.matriculaId} turmaId={turmaId}
              expiresAt={aluno.acessoTemporarioAte} accessActive={aluno.acessoTemporarioAtivo} allowed={allowed} />
          </li>)}
        </ul>}
  </section>;
};
