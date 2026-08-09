export const PASTA_FOOTER_CANONICAL_Y = 930;
export const PASTA_FOOTER_CANONICAL_HEIGHT = 100;

const LEGACY_PASTA_TEMPLATE_MAX_VERSION = 12;
const LEGACY_PASTA_FOOTER_MIN_Y = 1000;
const TEMPLATE_HEIGHT_PX = 1123;

const asFiniteNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const isKnownLegacyPastaFooter = (field: any) => {
  if (field?.id !== 'pasta_rodape') return false;

  const x = asFiniteNumber(field.x);
  const y = asFiniteNumber(field.y);
  const width = asFiniteNumber(field.width);
  const height = asFiniteNumber(field.height);
  const value = String(field.value || '');

  return x === 76
    && width === 642
    && y !== null
    && y >= LEGACY_PASTA_FOOTER_MIN_Y
    && y < TEMPLATE_HEIGHT_PX
    && (height === null || height <= 0)
    && value.includes('{{POLO_NOME}}')
    && value.includes('{{POLO_ENDERECO_COMPLETO}}')
    && value.includes('{{POLO_TELEFONE}}')
    && value.includes('{{POLO_EMAIL}}');
};

/**
 * Compatibilidade determinística para snapshots de Pasta v12 ou anteriores.
 * O snapshot persistido permanece imutável; somente a geometria conhecida e
 * inválida do rodapé é normalizada durante a composição vetorial.
 */
export const normalizeLegacyPastaFooterGeometry = (template: any) => {
  if (!template || typeof template !== 'object') return template;

  const version = asFiniteNumber(template.v) ?? 0;
  if (version > LEGACY_PASTA_TEMPLATE_MAX_VERSION) return template;

  const fields = Array.isArray(template.absoluteFields) ? template.absoluteFields : [];
  let changed = false;
  const absoluteFields = fields.map((field: any) => {
    if (!isKnownLegacyPastaFooter(field)) return field;
    changed = true;
    return {
      ...field,
      y: PASTA_FOOTER_CANONICAL_Y,
      height: PASTA_FOOTER_CANONICAL_HEIGHT,
    };
  });

  return changed ? { ...template, absoluteFields } : template;
};
