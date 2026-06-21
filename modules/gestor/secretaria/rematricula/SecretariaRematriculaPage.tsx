import React from 'react';
import SecretariaDocumentoEmissionPage from '../shared/SecretariaDocumentoEmissionPage';
import { secretariaDocumentoDefinitions } from '../shared/secretaria-documentos.definitions';

const SecretariaRematriculaPage: React.FC = () => (
  <SecretariaDocumentoEmissionPage definition={secretariaDocumentoDefinitions.rematricula} />
);

export default SecretariaRematriculaPage;
