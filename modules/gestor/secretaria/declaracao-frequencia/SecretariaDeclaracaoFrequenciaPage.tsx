import React from 'react';
import SecretariaDeclaracaoMatriculaPage from '../declaracao-matricula/SecretariaDeclaracaoMatriculaPage';
import {
  declaracaoFrequenciaService,
  frequenciaDefaultTemplate,
} from '../../cadastros/modelos-documentos/declaracao-frequencia/declaracao-frequencia.service';

const SecretariaDeclaracaoFrequenciaPage: React.FC = () => (
  <SecretariaDeclaracaoMatriculaPage
    documentService={declaracaoFrequenciaService}
    defaultTemplate={frequenciaDefaultTemplate}
    documentTitle="Declaração de Frequência"
    documentType="declaracao_frequencia"
    fileSlug="declaracoes-frequencia"
  />
);

export default SecretariaDeclaracaoFrequenciaPage;
