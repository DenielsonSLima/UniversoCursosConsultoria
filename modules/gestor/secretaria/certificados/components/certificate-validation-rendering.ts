export const removePublicValidationReferences = (content: string) => String(content || '')
  .replace(
    /(?:<br\s*\/?>\s*)*(?:Código do certificado|Código de verificação do certificado|Código de verificação)\s*:\s*(?:<strong[^>]*>)?\s*{{codigo_certificado}}\s*(?:<\/strong>)?\.?/gi,
    '',
  )
  .replace(
    /\n*Validador:\s*<strong[^>]*>.*?<\/strong>/gi,
    '',
  );

export const hasActiveCertificateQrBlock = (model: any): boolean => Boolean(
  model?.hasValidationQrCode === true
  || model?.blocks?.some(
    (block: any) => block?.type === 'qrcode' && block.visible !== false,
  )
);

export const shouldRenderCertificateQrBlock = (
  block: any,
  showValidationQrCode: boolean,
  model: any,
): boolean => (
  showValidationQrCode
  && hasActiveCertificateQrBlock(model)
  && block?.type === 'qrcode'
  && block.visible !== false
);

export const getMissingRequiredSignatureSources = (
  blocks: any[],
  signatures: object,
): string[] => {
  const signatureMap = signatures as Record<string, unknown>;
  const missing = new Set<string>();
  blocks
    .filter((block) => (
      block?.visible === true
      && ['signature', 'signatureImage'].includes(block?.type)
    ))
    .forEach((block) => {
      const source = String(block.signatureSource || 'none');
      if (source === 'none') return;
      if (source === 'manual') {
        if (!String(block.signatureImageUrl || '').trim()) {
          missing.add(`assinatura manual "${block.label || block.id}"`);
        }
        return;
      }
      if (!String(signatureMap[source] || '').trim()) {
        missing.add(`assinatura institucional "${block.label || block.id}"`);
      }
    });
  return [...missing];
};
