import React from 'react';
import { ScrollText } from 'lucide-react';
import EditableDocumentPage from '../shared/EditableDocumentPage';
import { HISTORICO_VARIABLES } from '../shared/documentVariables';
import { historicoService } from './historico.service';

const HistoricoPage: React.FC = () => (
  <EditableDocumentPage
    title="Histórico Escolar"
    description="Organize identificação, percurso curricular, notas, frequência e carga horária."
    documentTitle="Histórico Escolar"
    editorTitle="Editor de Histórico Escolar"
    icon={<ScrollText size={20} />}
    accent={{ text: 'text-slate-700', soft: 'bg-slate-100', solid: 'bg-slate-700', border: 'border-slate-200' }}
    service={historicoService}
    variables={HISTORICO_VARIABLES}
    validationPrefix="HIS"
    defaultValidityDays={365}
    sharedTemplate
  />
);

export default HistoricoPage;
