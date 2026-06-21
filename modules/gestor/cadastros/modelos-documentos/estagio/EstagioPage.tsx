import React from 'react';
import { Briefcase } from 'lucide-react';
import EditableDocumentPage from '../shared/EditableDocumentPage';
import { ESTAGIO_VARIABLES } from '../shared/documentVariables';
import { estagioService } from './estagio.service';

const EstagioPage: React.FC = () => (
  <EditableDocumentPage
    title="Termo de Estágio"
    description="Edite o termo por unidade com campos livres, assinaturas, QR Code e arraste no canvas."
    documentTitle="Termo de Compromisso de Estágio"
    editorTitle="Editor de Termo de Estágio"
    icon={<Briefcase size={20} />}
    accent={{ text: 'text-teal-600', soft: 'bg-teal-50', solid: 'bg-teal-600', border: 'border-teal-100' }}
    service={estagioService}
    variables={ESTAGIO_VARIABLES}
    validationPrefix="EST"
    defaultValidityDays={90}
    showValidity
  />
);

export default EstagioPage;
