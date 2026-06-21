import React from 'react';
import SecretariaDocumentoEmissionPage from '../shared/SecretariaDocumentoEmissionPage';
import { secretariaDocumentoDefinitions } from '../shared/secretaria-documentos.definitions';

const SecretariaDeclaracaoMatriculaPage: React.FC = () => (
  <SecretariaDocumentoEmissionPage definition={secretariaDocumentoDefinitions.declaracaoMatricula} />
);

export default SecretariaDeclaracaoMatriculaPage;
