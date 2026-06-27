import React from 'react';
import RelatorioAlunosAcademicos from './RelatorioAlunosAcademicos';

const RelatorioAlunosCursando: React.FC<{ company: any; polo: any }> = (props) => (
  <RelatorioAlunosAcademicos {...props} modo="cursando" />
);

export default RelatorioAlunosCursando;
