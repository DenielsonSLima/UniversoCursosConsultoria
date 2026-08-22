import React from 'react';
import AlunoFirstAccessPage from '../public/login/AlunoFirstAccessPage';

/**
 * Mantém a rota e o domínio do Responsável explícitos, reutilizando apenas o
 * formulário seguro de senha e termos do primeiro acesso público.
 */
const ResponsavelFirstAccessPage: React.FC = () => (
  <AlunoFirstAccessPage role="Responsavel" />
);

export default ResponsavelFirstAccessPage;
