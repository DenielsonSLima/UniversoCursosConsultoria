import '../components/professor-pages.css';
import React from 'react';
import type { PortalContextScope } from '../../login/portal-context.contract';
import ElectronicSignatureInbox from '../../shared/assinatura-eletronica/ElectronicSignatureInbox';
import { useProfessorSignatureRealtime } from './useProfessorSignatureRealtime';
import { hasCoordinationSignatureAccess } from './professor-signature-access';

interface ProfessorAssinaturasPageProps {
  professorId?: string;
  capabilities?: readonly string[];
  contextId: string;
  poloId?: string | null;
  scopes?: readonly PortalContextScope[];
}

const ProfessorAssinaturasPage: React.FC<ProfessorAssinaturasPageProps> = ({
  professorId,
  capabilities,
  contextId,
  poloId,
  scopes,
}) => {
  useProfessorSignatureRealtime(professorId, contextId);
  const canReviewAsCoordinator = hasCoordinationSignatureAccess({ capabilities, scopes });

  return (
    <div className="professor-page professor-signatures space-y-5">
      <ElectronicSignatureInbox
        compact
        audience="professor"
        profile="PROFESSOR"
        contextId={contextId}
        heading="Como professor"
        poloId={poloId}
      />

      {canReviewAsCoordinator ? (
        <ElectronicSignatureInbox
          compact
          audience="coordenador"
          profile="COORDENADOR"
          contextId={contextId}
          heading="Revisão como coordenação"
          poloId={poloId}
        />
      ) : null}
    </div>
  );
};

export default ProfessorAssinaturasPage;
