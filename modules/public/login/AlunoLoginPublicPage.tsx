import React from 'react';
import AlunoLoginPublicView from './AlunoLoginPublicView';
import { useAlunoLoginPublicPage } from './useAlunoLoginPublicPage';

const AlunoLoginPublicPage: React.FC = () => {
  const model = useAlunoLoginPublicPage();
  return <AlunoLoginPublicView model={model} />;
};

export default AlunoLoginPublicPage;
