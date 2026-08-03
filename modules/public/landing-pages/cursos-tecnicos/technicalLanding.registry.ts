import type {
  TechnicalLandingConfig,
  TechnicalLandingTemplateKey,
} from './technicalLanding.types';
import { analisesClinicasLandingConfig } from './analises-clinicas/analisesClinicas.config';
import { defaultTechnicalLandingConfig } from './default/defaultTechnical.config';
import { enfermagemLandingConfig } from './enfermagem/enfermagem.config';
import { radiologiaLandingConfig } from './radiologia/radiologia.config';
import { saudeBucalLandingConfig } from './saude-bucal/saudeBucal.config';
import { segurancaTrabalhoLandingConfig } from './seguranca-do-trabalho/segurancaTrabalho.config';

const landingConfigRegistry: Record<TechnicalLandingTemplateKey, TechnicalLandingConfig> = {
  enfermagem: enfermagemLandingConfig,
  'seguranca-do-trabalho': segurancaTrabalhoLandingConfig,
  radiologia: radiologiaLandingConfig,
  'analises-clinicas': analisesClinicasLandingConfig,
  'saude-bucal': saudeBucalLandingConfig,
  default: defaultTechnicalLandingConfig,
};

const normalize = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('pt-BR')
  .replace(/[^a-z0-9]+/g, '-');

export const resolveTechnicalLandingKey = (
  courseName: string,
  configuredKey?: string | null,
): TechnicalLandingTemplateKey => {
  const configured = normalize(configuredKey || '') as TechnicalLandingTemplateKey;
  if (configured && configured in landingConfigRegistry) return configured;

  const course = normalize(courseName);
  if (course.includes('enfermagem')) return 'enfermagem';
  if (course.includes('seguranca') && course.includes('trabalho')) return 'seguranca-do-trabalho';
  if (course.includes('radiologia')) return 'radiologia';
  if (course.includes('analises-clinicas')) return 'analises-clinicas';
  if (course.includes('saude-bucal')) return 'saude-bucal';
  return 'default';
};

export const getTechnicalLandingConfig = (
  courseName: string,
  configuredKey?: string | null,
) => landingConfigRegistry[resolveTechnicalLandingKey(courseName, configuredKey)];
