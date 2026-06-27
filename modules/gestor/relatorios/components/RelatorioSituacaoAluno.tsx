import React from 'react';
import RelatorioAlunosAcademicos from './RelatorioAlunosAcademicos';

const RelatorioSituacaoAluno: React.FC<{ company: any; polo: any }> = (props) => (
  <RelatorioAlunosAcademicos {...props} modo="situacao-aluno" />
);

export default RelatorioSituacaoAluno;
