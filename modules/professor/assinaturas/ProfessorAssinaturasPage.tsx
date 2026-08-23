import React from 'react';
import type { PortalContextScope } from '../../login/portal-context.contract';
import ElectronicSignatureInbox from '../../shared/assinatura-eletronica/ElectronicSignatureInbox';
import { hasCoordinationSignatureAccess } from './professor-signature-access';

interface ProfessorAssinaturasPageProps {
  capabilities?: readonly string[];
  contextId: string;
  poloId?: string | null;
  scopes?: readonly PortalContextScope[];
}

const ProfessorAssinaturasPage: React.FC<ProfessorAssinaturasPageProps> = ({
  capabilities,
  contextId,
  poloId,
  scopes,
}) => {
  const canReviewAsCoordinator = hasCoordinationSignatureAccess({ capabilities, scopes });

  return (
    <div className="space-y-6">
      <ElectronicSignatureInbox
        audience="professor"
        profile="PROFESSOR"
        contextId={contextId}
        heading="Como professor"
        poloId={poloId}
      />

      {canReviewAsCoordinator ? (
        <ElectronicSignatureInbox
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
