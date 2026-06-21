import React from 'react';
import SecretariaDocumentoEmissionPage from '../shared/SecretariaDocumentoEmissionPage';
import { secretariaDocumentoDefinitions } from '../shared/secretaria-documentos.definitions';

const SecretariaDeclaracaoIrpfPage: React.FC = () => (
  <SecretariaDocumentoEmissionPage definition={secretariaDocumentoDefinitions.declaracaoIrpf} />
);

export default SecretariaDeclaracaoIrpfPage;
