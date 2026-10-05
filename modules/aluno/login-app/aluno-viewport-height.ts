/** Retorna a altura em pixels de layout, sem confundir pinch zoom com teclado. */
export const getAlunoViewportHeight = (
  visualHeight: number | undefined,
  visualScale: number | undefined,
  fallbackHeight: number,
): number => {
  if (!visualHeight || !Number.isFinite(visualHeight) || visualHeight <= 0) {
    return fallbackHeight;
  }
  const scale = visualScale && Number.isFinite(visualScale) && visualScale > 0
    ? visualScale
    : 1;
  return visualHeight * scale;
};
