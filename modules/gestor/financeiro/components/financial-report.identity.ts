/** Identidade visual da matriz não é filtro dos lançamentos do relatório. */
export const resolveFinancialReportMatrixBrand = (
  polos: Array<{ is_matriz?: boolean; watermark_url?: string | null; watermark_opacity?: number;
    watermark_scale?: number; watermark_rotate?: boolean }>,
) => {
  const matrix = polos.find((polo) => polo.is_matriz);
  return {
    isMatriz: true,
    watermark_url: matrix?.watermark_url,
    watermark_opacity: matrix?.watermark_opacity,
    watermark_scale: matrix?.watermark_scale,
    watermark_rotate: matrix?.watermark_rotate,
  };
};
