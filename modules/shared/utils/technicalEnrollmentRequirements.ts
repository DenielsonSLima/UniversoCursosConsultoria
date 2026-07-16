export interface TechnicalEnrollmentRequirement {
  key: string;
  label: string;
  description: string;
}

export const TECHNICAL_DOCUMENT_TYPE_OPTIONS = [
  {
    value: 'CARTEIRA NACIONAL DE IDENTIFICAÇÃO',
    label: 'Carteira Nacional de Identificação (CIN)',
  },
  {
    value: 'CNH',
    label: 'CNH - Carteira Nacional de Habilitação',
  },
  {
    value: 'RG (ANTIGO)',
    label: 'RG - Registro Geral',
  },
] as const;

const REQUIRED_TECHNICAL_DOCUMENT_TYPES = new Set([
  'CARTEIRA NACIONAL DE IDENTIFICAÇÃO',
  'CIN',
  'CNI',
  'CNH',
  'RG',
  'RG ANTIGO',
  'RG (ANTIGO)',
]);

const hasText = (value?: unknown) => String(value || '').trim().length > 0;

const normalizeDocumentType = (value?: unknown) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

export const isAcceptedTechnicalDocumentType = (value?: unknown) => {
  const normalized = normalizeDocumentType(value);
  if (!normalized) return false;
  return Array.from(REQUIRED_TECHNICAL_DOCUMENT_TYPES).some((allowed) =>
    normalized === normalizeDocumentType(allowed) || normalized.includes(normalizeDocumentType(allowed))
  );
};

export const getTechnicalEnrollmentMissingFields = (profile: any): TechnicalEnrollmentRequirement[] => {
  const missing: TechnicalEnrollmentRequirement[] = [];
  const situacao = String(profile?.situacaoEnsinoMedio ?? profile?.situacao_ensino_medio ?? '').toUpperCase();
  const serie = Number(profile?.serieEnsinoMedioAtual ?? profile?.serie_ensino_medio_atual ?? 0);

  if (!['CURSANDO', 'CONCLUIDO'].includes(situacao)) {
    missing.push({
      key: 'situacaoEnsinoMedio',
      label: 'Situação do Ensino Médio',
      description: 'Informe se está cursando o 2º/3º ano ou se já concluiu.',
    });
  }

  if (!hasText(profile?.escolaEnsinoMedio ?? profile?.escola_ensino_medio)) {
    missing.push({
      key: 'escolaEnsinoMedio',
      label: 'Escola do Ensino Médio',
      description: 'Informe a escola atual ou onde concluiu o Ensino Médio.',
    });
  }

  if (situacao === 'CURSANDO') {
    if (![2, 3].includes(serie)) {
      missing.push({
        key: 'serieEnsinoMedioAtual',
        label: 'Série atual',
        description: 'Selecione o 2º ou o 3º ano do Ensino Médio.',
      });
    }
    if (!/^\d{4}$/.test(String(
      profile?.anoPrevisaoConclusaoEnsinoMedio
      ?? profile?.anoPrevistoConclusaoEnsinoMedio
      ?? profile?.ano_previsao_conclusao_ensino_medio
      ?? profile?.ano_previsto_conclusao_ensino_medio
      ?? '',
    ))) {
      missing.push({
        key: 'anoPrevisaoConclusaoEnsinoMedio',
        label: 'Previsão de conclusão',
        description: 'Informe o ano previsto para concluir o Ensino Médio.',
      });
    }
  } else if (situacao === 'CONCLUIDO' && !/^\d{4}$/.test(String(profile?.anoConclusaoEnsinoMedio ?? profile?.ano_conclusao_ensino_medio ?? ''))) {
    missing.push({
      key: 'anoConclusaoEnsinoMedio',
      label: 'Ano de conclusão',
      description: 'Informe o ano em que concluiu o Ensino Médio.',
    });
  }

  return missing;
};

export const formatTechnicalEnrollmentMissingFields = (profile: any) =>
  getTechnicalEnrollmentMissingFields(profile).map((item) => item.label).join(', ');
