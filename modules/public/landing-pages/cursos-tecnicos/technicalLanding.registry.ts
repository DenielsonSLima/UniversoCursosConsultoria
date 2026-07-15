import React from 'react';
import type {
  TechnicalLandingLazyComponent,
  TechnicalLandingTemplateKey,
} from './technicalLanding.types';

const landingRegistry: Record<TechnicalLandingTemplateKey, TechnicalLandingLazyComponent> = {
  enfermagem: React.lazy(() => import('./enfermagem/EnfermagemLandingPage')),
  'seguranca-do-trabalho': React.lazy(() => import('./seguranca-do-trabalho/SegurancaTrabalhoLandingPage')),
  radiologia: React.lazy(() => import('./radiologia/RadiologiaLandingPage')),
  'analises-clinicas': React.lazy(() => import('./analises-clinicas/AnalisesClinicasLandingPage')),
  'saude-bucal': React.lazy(() => import('./saude-bucal/SaudeBucalLandingPage')),
  default: React.lazy(() => import('./default/DefaultTechnicalLandingPage')),
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
  if (configured && configured in landingRegistry) return configured;

  const course = normalize(courseName);
  if (course.includes('enfermagem')) return 'enfermagem';
  if (course.includes('seguranca') && course.includes('trabalho')) return 'seguranca-do-trabalho';
  if (course.includes('radiologia')) return 'radiologia';
  if (course.includes('analises-clinicas')) return 'analises-clinicas';
  if (course.includes('saude-bucal')) return 'saude-bucal';
  return 'default';
};

export const getTechnicalLandingComponent = (
  courseName: string,
  configuredKey?: string | null,
) => landingRegistry[resolveTechnicalLandingKey(courseName, configuredKey)];
