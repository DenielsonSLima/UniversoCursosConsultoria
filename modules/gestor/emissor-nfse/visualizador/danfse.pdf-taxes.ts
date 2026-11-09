import { type DanfseDocument, dpsValue, xmlValue } from './danfse.types';
import type { DanfseLayout } from './danfse.pdf-layout';
import { codeLabel, danfseMoney, danfsePercent, joined, stateFromMunicipality } from './danfse.presentation';
import type { DanfseProjection } from './danfse.projection';

export function drawDanfseTaxes(layout: DanfseLayout, document: DanfseDocument, projection: DanfseProjection) {
  const value = (path: string) => xmlValue(document, path);
  const dps = (path: string) => dpsValue(document, path);
  const money = (label: string, path: string) => ({ label, value: danfseMoney(value(path)) });
  const percent = (label: string, path: string) => ({ label, value: danfsePercent(value(path)) });
  const fed = 'DPS/infDPS/valores/trib/tribFed/';
  const ibs = 'IBSCBS/';
  layout.line();
  layout.row([
    { label: 'TRIBUTAÇÃO MUNICIPAL (ISSQN)', title: true },
    { label: 'Tipo de Tributação do ISSQN', value: codeLabel(dps('valores/trib/tribMun/tribISSQN'), {
      1: 'Operação Tributável', 2: 'Imunidade', 3: 'Exportação de Serviço', 4: 'Não incidência',
    }) },
    { label: 'Município / Sigla UF / País de Incidência do ISSQN', span: 2,
      value: joined([value('xLocIncid'), stateFromMunicipality(value('cLocIncid')), dps('valores/trib/tribMun/cPaisResult')]) },
  ]);
  const special = dps('prest/regTrib/regEspTrib');
  if ((special && special !== '0') || dps('valores/trib/tribMun/tpImunidade') || dps('valores/trib/tribMun/exigSusp/tpSusp')) {
    layout.row([
      { label: 'Regime Especial de Tributação do ISSQN', value: special },
      { label: 'Tipo de Imunidade do ISSQN', value: dps('valores/trib/tribMun/tpImunidade') },
      { label: 'Suspensão da Exigibilidade do ISSQN', value: dps('valores/trib/tribMun/exigSusp/tpSusp') },
      { label: 'Número Processo Suspensão', value: dps('valores/trib/tribMun/exigSusp/nProcesso') },
    ]);
  }
  if (value('valores/tpBM') || value('valores/vCalcDR') || dps('valores/vDedRed/vDR')) layout.row([
    { label: 'Benefício Municipal', value: value('valores/tpBM') },
    { label: 'Cálculo do BM', value: danfseMoney(value('valores/vCalcBM') || dps('valores/trib/tribMun/BM/vRedBCBM')) },
    { label: 'Total Deduções/Reduções', value: danfseMoney(value('valores/vCalcDR') || dps('valores/vDedRed/vDR')) },
    { label: 'Desconto Incondicionado', value: danfseMoney(dps('valores/vDescCondIncond/vDescIncond')) },
  ]);
  layout.row([
    money('BC ISSQN', 'valores/vBC'), percent('Alíquota Aplicada', 'valores/pAliqAplic'),
    { label: 'Retenção do ISSQN', value: codeLabel(dps('valores/trib/tribMun/tpRetISSQN'), {
      1: 'Não Retido', 2: 'Retido pelo Tomador', 3: 'Retido pelo Intermediário',
    }) }, money('ISSQN Apurado', 'valores/vISSQN'),
  ]);
  layout.line();
  layout.row([{ label: 'TRIBUTAÇÃO FEDERAL (EXCETO CBS)', title: true },
    money('IRRF', `${fed}vRetIRRF`), money('Contribuição Previdenciária - Retida', `${fed}vRetCP`),
    { label: 'Contribuições Sociais - Retidas', value: danfseMoney(projection.socialRetentions || '') }]);
  layout.row([{ label: 'PIS - Débito Apuração Própria', value: danfseMoney(projection.pisOwn || '') },
    { label: 'COFINS - Débito Apuração Própria', value: danfseMoney(projection.cofinsOwn || '') },
    { label: 'Descrição Contrib. Sociais - Retidas', value: codeLabel(dps('valores/trib/tribFed/piscofins/tpRetPisCofins'), {
      0: 'PIS/COFINS/CSLL Não Retidos', 1: 'PIS/COFINS Retidos', 2: 'PIS/COFINS Não Retidos',
      3: 'PIS/COFINS/CSLL Retidos', 4: 'PIS/COFINS Retidos, CSLL Não Retido',
      5: 'PIS Retido, COFINS/CSLL Não Retido', 6: 'COFINS Retido, PIS/CSLL Não Retido',
      7: 'PIS Não Retido, COFINS/CSLL Retidos', 8: 'PIS/COFINS Não Retidos, CSLL Retido',
      9: 'COFINS Não Retido, PIS/CSLL Retidos',
    }), span: 2 }]);
  layout.line();
  layout.row([
    { label: 'TRIBUTAÇÃO IBS/CBS', title: true },
    { label: 'CST / cClassTrib', value: joined([dps('IBSCBS/valores/trib/gIBSCBS/CST'), dps('IBSCBS/valores/trib/gIBSCBS/cClassTrib')]) },
    { label: 'Indicador de Operação / Código IBGE Incidência / Município Incidência / Sigla UF', span: 2,
      value: joined([dps('IBSCBS/cIndOp'), value(`${ibs}cLocalidadeIncid`), value(`${ibs}xLocalidadeIncid`), stateFromMunicipality(value(`${ibs}cLocalidadeIncid`))]) },
  ]);
  layout.row([
    { label: 'Exclusões e Reduções da Base de Cálculo', value: danfseMoney(projection.exclusions || '') },
    money('Base de Cálculo Após Exclusões e Reduções', `${ibs}valores/vBC`),
    { label: 'Red. Alíquota IBS / Red. Alíquota CBS', value: joined(['uf/pRedAliqUF', 'mun/pRedAliqMun', 'fed/pRedAliqCBS'].map(path => danfsePercent(value(`${ibs}valores/${path}`)))) },
    { label: 'Alíquota - IBS UF / IBS Mun', value: joined(['uf/pIBSUF', 'mun/pIBSMun'].map(path => danfsePercent(value(`${ibs}valores/${path}`)))) },
  ]);
  layout.row([
    percent('Alíq. Efetiva Municipal - IBS', `${ibs}valores/mun/pAliqEfetMun`),
    money('Valor Apurado Municipal - IBS', `${ibs}totCIBS/gIBS/gIBSMunTot/vIBSMun`),
    percent('Alíq. Efetiva Estadual - IBS', `${ibs}valores/uf/pAliqEfetUF`),
    money('Valor Apurado Estadual - IBS', `${ibs}totCIBS/gIBS/gIBSUFTot/vIBSUF`),
  ]);
  layout.row([
    money('Valor Total Apurado - IBS', `${ibs}totCIBS/gIBS/vIBSTot`), percent('Alíquota - CBS', `${ibs}valores/fed/pCBS`),
    percent('Alíquota Efetiva - CBS', `${ibs}valores/fed/pAliqEfetCBS`), money('Valor Total Apurado - CBS', `${ibs}totCIBS/gCBS/vCBS`),
  ]);
  layout.line();
  layout.row([
    { label: 'VALOR TOTAL DA NFS-e', title: true },
    { label: 'VALOR DA OPERAÇÃO / SERVIÇO', value: danfseMoney(dps('valores/vServPrest/vServ')) },
    { label: 'Desconto Incondicionado', value: danfseMoney(dps('valores/vDescCondIncond/vDescIncond')) },
    { label: 'Desconto Condicionado', value: danfseMoney(dps('valores/vDescCondIncond/vDescCond')) },
  ]);
  layout.row([
    money('Total das Retenções (ISSQN / Federais)', 'valores/vTotalRet'), money('VALOR LÍQUIDO DA NFS-e', 'valores/vLiq'),
    { label: 'Total do IBS/CBS', value: danfseMoney(projection.totalIBSCBS || '') },
    { ...money('VALOR LÍQUIDO DA NFS-e + IBS/CBS', `${ibs}totCIBS/vTotNF`), shade: true },
  ]);
}
