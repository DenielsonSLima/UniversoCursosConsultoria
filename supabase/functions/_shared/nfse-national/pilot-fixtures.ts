import { SignedXml } from 'npm:xml-crypto@6.4.0';
import type { NationalDpsInput } from './dps.types.ts';

/** Synthetic-only identities. This fixture must never be sent to a fiscal service. */
export function pilotFixture(): NationalDpsInput {
  return {
    environment: 'HOMOLOGACAO', purpose: 'REGULAR', issuedAt: '2026-11-10T12:00:00-03:00',
    applicationVersion: 'Universo_TEST_ONLY', series: '1', number: '123', competence: '2026-11-10',
    issuerMunicipalityCode: '2803401',
    issuer: { taxId: { type: 'CNPJ', value: '00000000000000' }, simpleNationalOption: '1', specialTaxRegime: '0' },
    recipient: { taxId: { type: 'CNPJ', value: '00000000000000' }, name: 'Tomador Sintetico Sem Valor Fiscal' },
    service: { municipalityCode: '2803401', nationalTaxCode: '080101', nbs: '122020000',
      description: 'Teste tecnico sintetico sem valor fiscal' },
    values: { serviceAmount: '1.00', issTaxation: '1', issRetention: '1',
      totalTaxes: { mode: 'AMOUNTS', federal: '0.00', state: '0.00', municipal: '0.00' } },
    review: { recipientConfirmed: true, competenceConfirmed: true, classificationConfirmed: true,
      ibscbs: 'SYNTHETIC_PILOT_OMISSION', federalRetentions: 'NONE_CONFIRMED', deductionsAndDiscounts: 'NONE_CONFIRMED' },
  };
}

export const pilotAccessKey = `280340122${'0'.repeat(14)}${'9'.padStart(13, '0')}2611${'0'.repeat(10)}`;

export function syntheticAuthorizedNote(signedDps: string,
  material: { privateKeyPem: string; certificatePem: string }): string {
  const dps = signedDps.replace(/^<\?xml[^?]*\?>/, '');
  const xml = `<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01"><infNFSe Id="NFS${pilotAccessKey}">` +
    '<xLocEmi>Japoata</xLocEmi><xLocPrestacao>Japoata</xLocPrestacao><nNFSe>9</nNFSe>' +
    '<xTribNac>Servico sintetico</xTribNac><verAplic>TEST</verAplic><ambGer>2</ambGer><tpEmis>1</tpEmis>' +
    '<cStat>100</cStat><dhProc>2026-11-10T12:00:01-03:00</dhProc><nDFSe>9</nDFSe>' +
    '<emit><CNPJ>00000000000000</CNPJ><xNome>Emitente Sintetico</xNome><enderNac>' +
    '<xLgr>Rua Teste</xLgr><nro>1</nro><xBairro>Centro</xBairro><cMun>2803401</cMun><UF>SE</UF>' +
    '<CEP>00000000</CEP></enderNac></emit><valores><vLiq>1.00</vLiq></valores>' + dps + '</infNFSe></NFSe>';
  const signer = new SignedXml({ privateKey: material.privateKeyPem, publicCert: material.certificatePem,
    signatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
    canonicalizationAlgorithm: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315' });
  signer.addReference({ xpath: "//*[local-name()='infNFSe']", digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
    transforms: ['http://www.w3.org/2000/09/xmldsig#enveloped-signature',
      'http://www.w3.org/TR/2001/REC-xml-c14n-20010315'] });
  signer.computeSignature(xml, { location: { reference: "//*[local-name()='infNFSe']", action: 'after' } });
  return signer.getSignedXml();
}
