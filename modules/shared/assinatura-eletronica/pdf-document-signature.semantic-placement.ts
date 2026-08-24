import type { DiaryPdfSemanticManifestV2 } from "./diary-pdf-semantic-manifest.ts";
import type { AppliedSignatureStamp } from "./pdf-document-signature.types.ts";

const placementMatches = (
  stamp: AppliedSignatureStamp,
  slot: DiaryPdfSemanticManifestV2["signatureSlots"][number],
) => stamp.placement.coordinateSpace === slot.coordinateSpace &&
  stamp.placement.xBp === slot.xBp &&
  stamp.placement.yBp === slot.yBp &&
  stamp.placement.widthBp === slot.widthBp &&
  stamp.placement.heightBp === slot.heightBp;

export const assertDiaryBackCoverSignaturePlacements = (
  manifest: DiaryPdfSemanticManifestV2,
  stamps: readonly AppliedSignatureStamp[],
) => {
  if (stamps.length !== manifest.signatureSlots.length) {
    throw new Error(
      "Os carimbos não correspondem aos dois slots congelados da contracapa.",
    );
  }
  const roles = new Set(stamps.map(({ role }) => role));
  if (roles.size !== stamps.length) {
    throw new Error("Os papéis dos carimbos da contracapa estão duplicados.");
  }
  stamps.forEach((stamp) => {
    const slot = manifest.signatureSlots.find(({ role }) => role === stamp.role);
    if (!slot || !placementMatches(stamp, slot)) {
      throw new Error(
        `A posição do carimbo ${stamp.role} diverge do slot congelado da contracapa.`,
      );
    }
  });
};
