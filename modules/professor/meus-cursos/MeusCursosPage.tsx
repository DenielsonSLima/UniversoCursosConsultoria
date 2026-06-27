import React from 'react';
import AlunoTurmasPage from '../../aluno/turmas/TurmasPage';

interface MeusCursosPageProps {
  professorId: string;
  alunoId?: string;
}

const MeusCursosPage: React.FC<MeusCursosPageProps> = ({ alunoId }) => {
  return <AlunoTurmasPage alunoId={alunoId} />;
};

export default MeusCursosPage;
