import React from 'react';
import AlunoCursosPage from '../../aluno/cursos/CursosPage';

interface CursosPageProps {
  professorId: string;
  alunoId?: string;
}

const CursosPage: React.FC<CursosPageProps> = ({ alunoId }) => {
  return <AlunoCursosPage alunoId={alunoId} />;
};

export default CursosPage;
