import React from 'react';
import RelatorioAlunosAcademicos from './RelatorioAlunosAcademicos';

const RelatorioMatriculaInicial: React.FC<{ company: any; polo: any }> = (props) => (
  <RelatorioAlunosAcademicos {...props} modo="matricula-inicial" />
);

export default RelatorioMatriculaInicial;
