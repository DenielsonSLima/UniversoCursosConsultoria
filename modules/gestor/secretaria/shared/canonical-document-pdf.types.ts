export interface CanonicalDocumentPdfProgress {
  current: number;
  total: number;
}

export interface CanonicalDocumentPdfResult {
  blob: Blob;
  fileName: string;
}

export interface CanonicalDocumentPdfBuildOptions {
  /** Atualização apenas de interface; a composição permanece canônica. */
  onProgress?: (progress: CanonicalDocumentPdfProgress) => void;
}

export type CanonicalDocumentPdfFactory<Item> = (
  items: readonly Item[],
  options?: CanonicalDocumentPdfBuildOptions,
) => Promise<CanonicalDocumentPdfResult>;
