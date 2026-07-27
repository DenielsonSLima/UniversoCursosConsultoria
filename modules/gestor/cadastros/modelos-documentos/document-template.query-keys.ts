export const documentTemplateQueryKeys = {
  all: ['documentos-templates'] as const,
  detail: (templateId: string) => [
    ...documentTemplateQueryKeys.all,
    'detail',
    templateId,
  ] as const,
};
