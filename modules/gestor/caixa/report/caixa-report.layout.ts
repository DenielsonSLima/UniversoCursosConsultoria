export interface CaixaReportPageDimensions {
  clientHeight: number;
  clientWidth: number;
  scrollHeight: number;
  scrollWidth: number;
}

const OVERFLOW_TOLERANCE_PX = 2;

export const getCaixaReportArtworkScale = (pageCount: number) => {
  if (pageCount > 30) return 1;
  if (pageCount > 15) return 1.25;
  return 1.5;
};

export const isCaixaReportPageOverflowing = (
  page: CaixaReportPageDimensions,
) => (
  page.scrollHeight > page.clientHeight + OVERFLOW_TOLERANCE_PX
  || page.scrollWidth > page.clientWidth + OVERFLOW_TOLERANCE_PX
);

export const assertCaixaReportPagesFit = (
  pages: CaixaReportPageDimensions[],
) => {
  const overflowingPageIndex = pages.findIndex(isCaixaReportPageOverflowing);
  if (overflowingPageIndex >= 0) {
    throw new Error(
      `A página ${overflowingPageIndex + 1} excedeu a área segura do relatório.`,
    );
  }
};
