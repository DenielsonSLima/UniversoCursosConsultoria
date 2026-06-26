import React from 'react';
import { BadgeCheck } from 'lucide-react';
import EditableDocumentPage from '../shared/EditableDocumentPage';
import { ATESTADO_CONCLUSAO_TECNICO_VARIABLES } from '../shared/documentVariables';
import { atestadoConclusaoService } from './atestado-conclusao.service';

const AtestadoConclusaoPage: React.FC = () => (
  <EditableDocumentPage
    title="Atestado de Conclusão"
    description="Comprovação provisória de conclusão exclusiva para cursos técnicos."
    documentTitle="Atestado de Conclusão"
    editorTitle="Editor do Atestado de Conclusão"
    icon={<BadgeCheck size={20} />}
    accent={{ text: 'text-emerald-700', soft: 'bg-emerald-50', solid: 'bg-emerald-600', border: 'border-emerald-100' }}
    service={atestadoConclusaoService}
    variables={ATESTADO_CONCLUSAO_TECNICO_VARIABLES}
    validationPrefix="ATC"
    defaultValidityDays={90}
    showValidity
    restrictionLabel="Somente cursos técnicos concluídos"
    modalityScope="TECNICO"
  />
);

export default AtestadoConclusaoPage;
