import React from 'react';
import { ClipboardCheck } from 'lucide-react';
import EditableDocumentPage from '../shared/EditableDocumentPage';
import { BOLETIM_TECNICO_VARIABLES } from '../shared/documentVariables';
import { boletimService } from './boletim.service';

const BoletimPage: React.FC = () => (
  <EditableDocumentPage
    title="Boletim Escolar"
    description="Modelo informativo de notas e frequência para a formação técnica."
    documentTitle="Boletim Escolar — Cursos Técnicos"
    editorTitle="Editor de Boletim Escolar"
    icon={<ClipboardCheck size={20} />}
    accent={{ text: 'text-cyan-700', soft: 'bg-cyan-50', solid: 'bg-cyan-600', border: 'border-cyan-100' }}
    service={boletimService}
    variables={BOLETIM_TECNICO_VARIABLES}
    validationPrefix="BOL"
    defaultValidityDays={30}
    restrictionLabel="Somente cursos técnicos"
  />
);

export default BoletimPage;
