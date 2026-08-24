import type { AppliedSignatureStamp } from '../../../modules/shared/assinatura-eletronica/pdf-document-signature.server.ts';
import type { DiaryPdfSemanticManifest } from '../../../modules/shared/assinatura-eletronica/diary-pdf-semantic-manifest.ts';
import type { SignatureParticipant } from './artifact-contracts.ts';

export const resolveDiarySignaturePlacements = (
  manifest: DiaryPdfSemanticManifest,
  participants: readonly SignatureParticipant[],
  historicalPlacements: readonly AppliedSignatureStamp['placement'][] | null,
): readonly AppliedSignatureStamp['placement'][] => {
  if (manifest.schemaVersion === 1) {
    if (!historicalPlacements || historicalPlacements.length !== participants.length) {
      throw new Error('A geometria histórica não corresponde aos signatários congelados.');
    }
    return historicalPlacements;
  }
  if (participants.length !== manifest.signatureSlots.length) {
    throw new Error('Os slots da contracapa não correspondem aos signatários congelados.');
  }
  const usedRoles = new Set<string>();
  return participants.map((participant) => {
    if (usedRoles.has(participant.role)) {
      throw new Error(`O papel ${participant.role} está duplicado no envelope.`);
    }
    usedRoles.add(participant.role);
    const slot = manifest.signatureSlots.find((candidate) => (
      candidate.role === participant.role
    ));
    if (!slot) {
      throw new Error(`O signatário ${participant.role} não possui campo na contracapa.`);
    }
    return {
      coordinateSpace: slot.coordinateSpace,
      xBp: slot.xBp,
      yBp: slot.yBp,
      widthBp: slot.widthBp,
      heightBp: slot.heightBp,
    };
  });
};
