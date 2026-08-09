import { createDocumentTemplateService } from '../modelos-documentos/shared/document-template.service';
import {
  fichaMatriculaDefaultTemplate,
  registrationTemplateNeedsVoterUpgrade,
  upgradeRegistrationVoterField,
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

    if (!registrationTemplateNeedsVoterUpgrade(
      template,
      'ficha_documentos',
      fichaMatriculaDefaultTemplate.v,
    )) {
      return template;
    }

    return upgradeRegistrationVoterField(
      template,
      cloneDefaultTemplate(),
      'ficha_documentos',
    );
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
