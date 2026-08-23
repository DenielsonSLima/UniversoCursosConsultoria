export const ELECTRONIC_SIGNATURE_LEGAL_SECTION_IDS = [
  "ownership",
  "consent",
  "terms_update",
  "contact",
  "copies",
] as const;

export type ElectronicSignatureLegalSectionId =
  typeof ELECTRONIC_SIGNATURE_LEGAL_SECTION_IDS[number];

/**
 * A marca-d'água do editor é um recurso próprio do modelo. Ela nunca reutiliza
 * a marca institucional do cabeçalho canônico.
 */
export type ElectronicSignatureWatermarkSource = "TEXT" | "CUSTOM_ASSET";

export interface ElectronicSignaturePageWatermark {
  enabled: boolean;
  source: ElectronicSignatureWatermarkSource;
  label: string | null;
  /** UUID do ativo autorizado pela Edge Function; URLs e base64 não persistem no editor. */
  assetId: string | null;
  opacity: number;
  scalePercent: number;
  rotationDegrees: number;
}

export interface ElectronicSignatureLegalSection {
  id: ElectronicSignatureLegalSectionId;
  title: string;
  body: string;
}

export interface ElectronicSignatureEvidenceEditorPage {
  page: 1;
  template: "EVIDENCE";
}

export interface ElectronicSignatureLegalEditorPage {
  page: 2;
  template: "LEGAL_TEXTS";
  sections: readonly ElectronicSignatureLegalSection[];
}
