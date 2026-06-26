import React from 'react';
import SecretariaDocumentoEmissionPage from '../shared/SecretariaDocumentoEmissionPage';
import { secretariaDocumentoDefinitions } from '../shared/secretaria-documentos.definitions';

const SecretariaAtestadoConclusaoPage: React.FC = () => (
  <SecretariaDocumentoEmissionPage definition={secretariaDocumentoDefinitions.atestadoConclusao} />
);

export default SecretariaAtestadoConclusaoPage;
