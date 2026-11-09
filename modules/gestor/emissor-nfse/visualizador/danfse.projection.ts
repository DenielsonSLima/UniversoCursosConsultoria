import { type DanfseDocument, dpsValue, xmlValue } from './danfse.types';

export interface DanfseProjection {
  exclusions: string | null;
  totalIBSCBS: string | null;
  socialRetentions: string | null;
  pisOwn: string | null;
  cofinsOwn: string | null;
}

export interface DanfseComponents {
  vDescIncond: string | null;
  vCalcReeRepRes: string | null;
  vISSQN: string | null;
  vPis: string | null;
  vCofins: string | null;
  vIBSTot: string | null;
  vCBS: string | null;
  vRetCSLL: string | null;
  tpRetPisCofins: string | null;
  hasIbsCbs: boolean;
}

const absentProjection: DanfseProjection = {
  exclusions: null, totalIBSCBS: null, socialRetentions: null, pisOwn: null, cofinsOwn: null,
};

/** Explicit decimal components only: no XML, key, name, document, address or provider URL is sent. */
export function danfseComponents(document: DanfseDocument): DanfseComponents {
  return {
    vDescIncond: dpsValue(document, 'valores/vDescCondIncond/vDescIncond') || null,
    vCalcReeRepRes: xmlValue(document, 'IBSCBS/valores/vCalcReeRepRes') || null,
    vISSQN: xmlValue(document, 'valores/vISSQN') || null,
    vPis: dpsValue(document, 'valores/trib/tribFed/piscofins/vPis') || null,
    vCofins: dpsValue(document, 'valores/trib/tribFed/piscofins/vCofins') || null,
    vIBSTot: xmlValue(document, 'IBSCBS/totCIBS/gIBS/vIBSTot') || null,
    vCBS: xmlValue(document, 'IBSCBS/totCIBS/gCBS/vCBS') || null,
    vRetCSLL: dpsValue(document, 'valores/trib/tribFed/vRetCSLL') || null,
    tpRetPisCofins: dpsValue(document, 'valores/trib/tribFed/piscofins/tpRetPisCofins') || null,
    hasIbsCbs: Object.keys(document.fields).some(path => path === 'IBSCBS' || path.startsWith('IBSCBS/') || path.startsWith('DPS/infDPS/IBSCBS/')),
  };
}

export function needsDanfseProjection(components: DanfseComponents): boolean {
  return Object.entries(components).some(([key, value]) => key === 'hasIbsCbs' ? value === true : value !== null);
}

/** No tax arithmetic in the renderer. Incomplete projections fail rather than hide existing values. */
export function requireDanfseProjection(document: DanfseDocument, projection?: DanfseProjection): DanfseProjection {
  const components = danfseComponents(document);
  if (!needsDanfseProjection(components)) return absentProjection;
  if (!projection) throw new Error('Este XML precisa da projeção fiscal para gerar o DANFSe. Tente novamente.');
  for (const key of Object.keys(absentProjection) as (keyof DanfseProjection)[]) {
    const value = projection[key];
    if (value !== null && (typeof value !== 'string' || !/^(0|[1-9]\d{0,17})\.\d{2}$/.test(value))) {
      throw new Error('A projeção dos valores fiscais deste XML está inválida.');
    }
  }
  const incomplete = (present: boolean, value: string | null) => present && value === null;
  if (incomplete(components.hasIbsCbs && [components.vDescIncond, components.vCalcReeRepRes, components.vISSQN, components.vPis, components.vCofins].some(value => value !== null), projection.exclusions)
    || incomplete(components.vIBSTot !== null || components.vCBS !== null, projection.totalIBSCBS)
    || incomplete(components.vRetCSLL !== null || (components.tpRetPisCofins === '1' && (components.vPis !== null || components.vCofins !== null)), projection.socialRetentions)
    || incomplete(components.vPis !== null || components.tpRetPisCofins === '1', projection.pisOwn)
    || incomplete(components.vCofins !== null || components.tpRetPisCofins === '1', projection.cofinsOwn)) {
    throw new Error('Não foi possível obter todos os valores fiscais deste XML para o DANFSe.');
  }
  return projection;
}
