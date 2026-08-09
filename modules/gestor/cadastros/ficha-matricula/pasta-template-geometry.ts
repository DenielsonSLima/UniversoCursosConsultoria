const REDUNDANT_PASTA_FOOTER_MAX_VERSION = 13;
const PASTA_FOOTER_CANONICAL_Y = 930;
const PASTA_FOOTER_CANONICAL_HEIGHT = 100;
const LEGACY_PASTA_FOOTER_MIN_Y = 1000;
const TEMPLATE_HEIGHT_PX = 1123;

const asFiniteNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const isKnownRedundantPastaFooter = (field: any) => {
  if (field?.id !== 'pasta_rodape') return false;

  const x = asFiniteNumber(field.x);
  const y = asFiniteNumber(field.y);
  const width = asFiniteNumber(field.width);
  const height = asFiniteNumber(field.height);
  const value = String(field.value || '');

  const usesCanonicalGeometry = y === PASTA_FOOTER_CANONICAL_Y
    && height === PASTA_FOOTER_CANONICAL_HEIGHT;
  const usesLegacyGeometry = y !== null
    && y >= LEGACY_PASTA_FOOTER_MIN_Y
    && y < TEMPLATE_HEIGHT_PX
    && (height === null || height <= 0);

  return x === 76
    && width === 642
    && (usesCanonicalGeometry || usesLegacyGeometry)
    && value.includes('{{POLO_NOME}}')
    && value.includes('{{POLO_CNPJ}}')
    && value.includes('{{POLO_ENDERECO_COMPLETO}}')
    && value.includes('{{POLO_TELEFONE}}')
    && value.includes('{{POLO_EMAIL}}');
};

/**
 * Remove somente o rodapé institucional conhecido da Pasta v13 ou anterior,
 * pois a mesma identidade já é exibida no cabeçalho canônico. O snapshot
 * persistido permanece imutável; a remoção ocorre apenas na cópia renderizada.
 */
export const stripRedundantPastaFooter = (template: any) => {
  if (!template || typeof template !== 'object') return template;

  const version = asFiniteNumber(template.v) ?? 0;
  if (version > REDUNDANT_PASTA_FOOTER_MAX_VERSION) return template;

  const fields = Array.isArray(template.absoluteFields) ? template.absoluteFields : [];
  const footerFields = fields.filter((field: any) => field?.id === 'pasta_rodape');
  if (
    footerFields.length !== 1
    || !isKnownRedundantPastaFooter(footerFields[0])
  ) return template;

  return {
    ...template,
    absoluteFields: fields.filter((field: any) => field !== footerFields[0]),
  };
};
