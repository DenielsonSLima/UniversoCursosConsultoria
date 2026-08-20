import React from 'react';
import ElectronicSignatureInbox from '../../shared/assinatura-eletronica/ElectronicSignatureInbox';

interface ProfessorAssinaturasPageProps {
  contextId: string;
  poloId?: string | null;
}

const ProfessorAssinaturasPage: React.FC<ProfessorAssinaturasPageProps> = ({ contextId, poloId }) => (
  <ElectronicSignatureInbox
    audience="professor"
    profile="PROFESSOR"
    contextId={contextId}
    heading="Minhas assinaturas"
    poloId={poloId}
  />
);

export default ProfessorAssinaturasPage;
