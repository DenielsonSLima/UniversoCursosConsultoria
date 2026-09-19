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

export const hasPastaStudentPhoto = (photoUrl: unknown): boolean => {
  const normalizedPhoto = String(photoUrl ?? '').trim();
  return Boolean(normalizedPhoto
    && !/(?:^|\/)sem-foto-aluno\.svg(?:[?#].*)?$/i.test(normalizedPhoto),
  );
};

/** Adapta somente a cópia de apresentação; o slot continua salvo no modelo. */
export const adaptPastaTemplateForStudentPhoto = <T extends { absoluteFields?: any[] }>(
  template: T,
  photoUrl: unknown,
): T => {
  if (hasPastaStudentPhoto(photoUrl) || !Array.isArray(template?.absoluteFields)) return template;

  const fields = template.absoluteFields;
  const identity = fields.find(field => field?.id === 'pasta_identificacao');
  const photos = fields.filter(field => field?.id === 'student_photo' && field.type === 'image');
  if (!identity || photos.length !== 1) return template;

  const photo = photos[0];
  const photoX = asFiniteNumber(photo.x);
  const photoY = asFiniteNumber(photo.y);
  const photoWidth = asFiniteNumber(photo.width);
  const photoHeight = asFiniteNumber(photo.height);
  const identityX = asFiniteNumber(identity.x);
  const identityWidth = asFiniteNumber(identity.width);
  const canExpand = photoX !== null && photoY !== null
    && photoWidth !== null && photoWidth > 0
    && photoHeight !== null && photoHeight > 0
    && identityX !== null && identityWidth !== null && identityWidth > 0
    && photoX + photoWidth <= identityX
    && photoY === asFiniteNumber(identity.y)
    && photoHeight === asFiniteNumber(identity.height);

  return {
    ...template,
    absoluteFields: fields.filter(field => field !== photo).map(field => (
      field === identity && canExpand
        ? { ...field, x: photoX, width: identityX + identityWidth - photoX }
        : field
    )),
  };
};
