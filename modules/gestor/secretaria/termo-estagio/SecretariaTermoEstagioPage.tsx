import React from 'react';
import SecretariaDocumentoEmissionPage from '../shared/SecretariaDocumentoEmissionPage';
import { secretariaDocumentoDefinitions } from '../shared/secretaria-documentos.definitions';

const SecretariaTermoEstagioPage: React.FC = () => (
  <SecretariaDocumentoEmissionPage definition={secretariaDocumentoDefinitions.termoEstagio} />
);

export default SecretariaTermoEstagioPage;
