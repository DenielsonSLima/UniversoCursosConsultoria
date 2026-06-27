import React from 'react';
import RelatorioAlunosAcademicos from './RelatorioAlunosAcademicos';

const RelatorioAlunosFinalizados: React.FC<{ company: any; polo: any }> = (props) => (
  <RelatorioAlunosAcademicos {...props} modo="finalizados" />
);

export default RelatorioAlunosFinalizados;
