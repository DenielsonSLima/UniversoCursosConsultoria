import { createDocumentTemplateService } from '../modelos-documentos/shared/document-template.service';
import {
  fichaMatriculaDefaultTemplate,
  normalizeRegistrationTemplateTypography,
} from './document-layouts';
import { fichasMatriculaService } from './fichas-matricula.service';

const qrConfigService = createDocumentTemplateService(
  'ficha_matricula_aluno',
  fichaMatriculaDefaultTemplate,
  { sharedTemplate: true },
);

const cloneDefaultTemplate = () => JSON.parse(JSON.stringify(fichaMatriculaDefaultTemplate));

export const fichaMatriculaTemplateService = {
  async getTemplate(_poloId: string) {
    const model = await fichasMatriculaService.getGeneral();
    if (!model) {
      throw new Error('Nenhum modelo geral ativo de ficha de matrícula foi encontrado.');
    }

    const template = {
      ...cloneDefaultTemplate(),
      ...(model.templateConfig || {}),
      enrollmentFormTerm: model.textoContrato,
      enrollmentFormCustomFields: model.camposCustomizados,
      enrollmentFormRequiresSignature: model.requerAssinatura,
    };

    if (Number(template.v || 0) >= fichaMatriculaDefaultTemplate.v) {
      return template;
    }

    const defaultTemplate = cloneDefaultTemplate();
    const canonicalFieldIds = new Set(
      defaultTemplate.absoluteFields.map((field: any) => field.id),
    );
    const upgradedTemplate = normalizeRegistrationTemplateTypography(
      {
        ...template,
        absoluteFields: [
          ...defaultTemplate.absoluteFields,
          ...(Array.isArray(template.absoluteFields)
            ? template.absoluteFields.filter(
                (field: any) => !canonicalFieldIds.has(field.id),
              )
            : []),
        ],
      },
      fichaMatriculaDefaultTemplate.v,
    );

    await fichasMatriculaService.update({
      ...model,
      templateConfig: {
        ...(model.templateConfig || {}),
        ...upgradedTemplate,
      },
    }).catch(() => undefined);

    return upgradedTemplate;
  },

  async saveTemplate(_poloId: string, template: any): Promise<boolean> {
    const model = await fichasMatriculaService.getGeneral();
    if (!model) {
      throw new Error('O modelo geral da ficha de matrícula não foi encontrado.');
    }

    const enrollmentFormTerm = String(
      template.enrollmentFormTerm ?? model.textoContrato,
    );
    const enrollmentFormCustomFields = Array.isArray(template.enrollmentFormCustomFields)
      ? template.enrollmentFormCustomFields
      : model.camposCustomizados;
    const enrollmentFormRequiresSignature = template.enrollmentFormRequiresSignature !== false;

    await fichasMatriculaService.update({
      ...model,
      textoContrato: enrollmentFormTerm,
      camposCustomizados: enrollmentFormCustomFields,
      camposCount: enrollmentFormCustomFields.length,
      requerAssinatura: enrollmentFormRequiresSignature,
      templateConfig: {
        ...(model.templateConfig || {}),
        ...template,
        enrollmentFormTerm,
        enrollmentFormCustomFields,
        enrollmentFormRequiresSignature,
      },
    });

    return true;
  },

  getQrConfig: qrConfigService.getQrConfig,
  saveQrConfig: qrConfigService.saveQrConfig,
};
