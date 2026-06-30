import React from 'react';
import { FileSignature } from 'lucide-react';
import EditableDocumentPage from '../shared/EditableDocumentPage';
import { FICHA_CADASTRAL_VARIABLES, fichaCadastralService } from './ficha-cadastral.service';

const FichaCadastralPage: React.FC = () => (
  <EditableDocumentPage
    title="Ficha Cadastral do Aluno"
    description="Modelo da ficha impressa no cadastro do aluno, com campos, assinatura, fonte, cores e elementos ajustáveis."
    documentTitle="Ficha Cadastral do Aluno"
    editorTitle="Editor da Ficha Cadastral do Aluno"
    icon={<FileSignature size={20} />}
    accent={{ text: 'text-blue-700', soft: 'bg-blue-50', solid: 'bg-blue-600', border: 'border-blue-100' }}
    service={fichaCadastralService}
    variables={FICHA_CADASTRAL_VARIABLES}
    validationPrefix="FICHA"
    showValidity={false}
    sharedTemplate
  />
);

export default FichaCadastralPage;
