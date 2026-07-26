import React from 'react';
import { FolderKanban } from 'lucide-react';
import EditableDocumentPage from '../modelos-documentos/shared/EditableDocumentPage';
import {
  FICHA_ALUNO_VARIABLES,
  pastaIdentificacaoService,
} from './document-layouts';

const PastaIdentificacaoPage: React.FC = () => (
  <EditableDocumentPage
    title="Pasta de Identificação"
    description="Modelo A4 para a capa da pasta do aluno, com foto, dados cadastrais e identificação acadêmica."
    documentTitle="Pasta de Identificação do Aluno"
    editorTitle="Editor da Pasta de Identificação"
    icon={<FolderKanban size={20} />}
    accent={{ text: 'text-cyan-700', soft: 'bg-cyan-50', solid: 'bg-cyan-600', border: 'border-cyan-100' }}
    service={pastaIdentificacaoService}
    variables={FICHA_ALUNO_VARIABLES}
    validationPrefix="PASTA"
    showValidity={false}
    sharedTemplate
  />
);

export default PastaIdentificacaoPage;
