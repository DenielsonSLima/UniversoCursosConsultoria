export const paginateReportItems = <T>(
  items: T[],
  firstPageSize: number,
  continuationPageSize = firstPageSize,
): T[][] => {
  const safeFirstPageSize = Math.max(1, Math.floor(firstPageSize));
  const safeContinuationPageSize = Math.max(1, Math.floor(continuationPageSize));

  if (items.length === 0) return [[]];

  const pages: T[][] = [items.slice(0, safeFirstPageSize)];
  let offset = safeFirstPageSize;

  while (offset < items.length) {
    pages.push(items.slice(offset, offset + safeContinuationPageSize));
    offset += safeContinuationPageSize;
  }

  return pages;
};
