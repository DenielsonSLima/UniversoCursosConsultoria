export interface PersonNameSource {
  nome?: string | null;
  nomeCompleto?: string | null;
  nomeSocial?: string | null;
  nome_social?: string | null;
}

const normalizedName = (value: unknown) => String(value || '').trim();

export const getPersonLegalName = (person: PersonNameSource | null | undefined) =>
  normalizedName(person?.nomeCompleto) || normalizedName(person?.nome);

export const getPersonSocialName = (person: PersonNameSource | null | undefined) =>
  normalizedName(person?.nomeSocial) || normalizedName(person?.nome_social);

export const getPersonDisplayName = (person: PersonNameSource | null | undefined) =>
  getPersonSocialName(person) || getPersonLegalName(person);

export const hasDistinctSocialName = (person: PersonNameSource | null | undefined) => {
  const socialName = getPersonSocialName(person);
  const legalName = getPersonLegalName(person);
  return Boolean(socialName && socialName.localeCompare(legalName, 'pt-BR', { sensitivity: 'base' }) !== 0);
};
