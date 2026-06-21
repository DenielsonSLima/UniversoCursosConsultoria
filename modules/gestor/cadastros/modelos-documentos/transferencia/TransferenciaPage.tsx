import React from 'react';
import { ArrowRightLeft } from 'lucide-react';
import EditableDocumentPage from '../shared/EditableDocumentPage';
import { TRANSFERENCIA_VARIABLES } from '../shared/documentVariables';
import { transferenciaService } from './transferencia.service';

const TransferenciaPage: React.FC = () => (
  <EditableDocumentPage
    title="Modelo de Transferência"
    description="Configure a guia de transferência e o demonstrativo acadêmico por unidade."
    documentTitle="Guia de Transferência Escolar"
    editorTitle="Editor de Transferência"
    icon={<ArrowRightLeft size={20} />}
    accent={{ text: 'text-orange-600', soft: 'bg-orange-50', solid: 'bg-orange-500', border: 'border-orange-100' }}
    service={transferenciaService}
    variables={TRANSFERENCIA_VARIABLES}
    validationPrefix="TRF"
    defaultValidityDays={90}
    showValidity
  />
);

export default TransferenciaPage;
