import { CursoVacinasConfig } from './vacinas.types';

export const REQUIRED_HEALTH_VACCINES: CursoVacinasConfig = {
  exigirCarteiraEstagio: true,
  observacao: 'Obrigatorio para liberacao de estagio em cursos da area da saude.',
  vacinas: [
    {
      codigo: 'hepatite_b',
      nome: 'Hepatite B',
      obrigatoria: true,
      doses: [
        { numero: 1, label: '1a dose' },
        { numero: 2, label: '2a dose' },
        { numero: 3, label: '3a dose' },
      ],
    },
    {
      codigo: 'tetano_dt',
      nome: 'Tetano / dT',
      obrigatoria: true,
      doses: [
        { numero: 1, label: '1a dose' },
        { numero: 2, label: '2a dose' },
        { numero: 3, label: '3a dose' },
        { numero: 4, label: 'Reforco' },
      ],
    },
    {
      codigo: 'covid_19',
      nome: 'COVID-19',
      obrigatoria: true,
      doses: [
        { numero: 1, label: '1a dose' },
        { numero: 2, label: '2a dose' },
      ],
    },
  ],
};

export const EMPTY_VACCINE_CONFIG: CursoVacinasConfig = {
  exigirCarteiraEstagio: false,
  vacinas: [],
};

export const isHealthTechnicalCourseName = (nome?: string | null) => {
  const normalized = String(nome || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return normalized.includes('enfermagem') || normalized.includes('radiologia') || normalized.includes('radiol');
};

export const getDefaultCursoVacinasConfig = (cursoNome?: string | null): CursoVacinasConfig => (
  isHealthTechnicalCourseName(cursoNome)
    ? REQUIRED_HEALTH_VACCINES
    : EMPTY_VACCINE_CONFIG
);

export const normalizeCursoVacinasConfig = (
  config?: Partial<CursoVacinasConfig> | null,
  cursoNome?: string | null
): CursoVacinasConfig => {
  const base = config && Array.isArray(config.vacinas)
    ? config as CursoVacinasConfig
    : getDefaultCursoVacinasConfig(cursoNome);

  return {
    exigirCarteiraEstagio: Boolean(base.exigirCarteiraEstagio),
    observacao: base.observacao || '',
    vacinas: (base.vacinas || []).map((vacina) => ({
      codigo: vacina.codigo,
      nome: vacina.nome,
      obrigatoria: vacina.obrigatoria !== false,
      doses: (vacina.doses || []).map((dose) => ({
        numero: Number(dose.numero || 0),
        label: dose.label || `${dose.numero}a dose`,
      })).filter((dose) => dose.numero > 0),
    })).filter((vacina) => vacina.codigo && vacina.nome && vacina.doses.length > 0),
  };
};

export const getVacinaDoseKey = (cursoId: string, vacinaCodigo: string, doseNumero: number) =>
  `${cursoId}:${vacinaCodigo}:${doseNumero}`;
