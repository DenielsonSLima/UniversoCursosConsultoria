import { Buffer } from 'node:buffer';
import { ParseOption, XmlDocument, XsdValidator, XmlBufferInputProvider,
  xmlRegisterInputProvider } from 'npm:libxml2-wasm@0.7.2';
import { HOMOLOGATION_SCHEMAS } from './schemas/homologation.generated.ts';
import { PRODUCTION_SCHEMAS } from './schemas/production.generated.ts';
import { deriveProductionNumericSeriesSchemas } from './production-series-compatibility.ts';
import { assertSafeFiscalXml } from './pilot-codec.ts';
import { NfseContractError, requireContract } from './xml.ts';

const packages = { homologation: HOMOLOGATION_SCHEMAS, production: PRODUCTION_SCHEMAS,
  'production-numeric-series-compatibility': deriveProductionNumericSeriesSchemas() };
const options = ParseOption.XML_PARSE_NONET | ParseOption.XML_PARSE_NO_XXE;
const validators = new Map<string, XsdValidator>();
let initialized: Promise<void> | undefined;

function initialize() {
  return initialized ??= (async () => {
    const sources: Record<string, Uint8Array> = {};
    for (const [profile, schemas] of Object.entries(packages)) {
      for (const [name, resource] of Object.entries(schemas)) {
        const bytes = new Uint8Array(Buffer.from(resource.base64, 'base64'));
        const digest = Buffer.from(await crypto.subtle.digest('SHA-256', bytes)).toString('hex');
        requireContract(digest === resource.sha256, 'OFFICIAL_XSD_INTEGRITY_FAILED');
        sources[`nfse-schema://${profile}/${name}`] = bytes;
      }
    }
    const provider = new XmlBufferInputProvider(sources);
    // One provider avoids one environment's catch-all shadowing the other.
    // Unknown imports never reach disk, network, catalogs or caller-chosen schemas.
    requireContract(xmlRegisterInputProvider({ match: () => true, open: filename => {
      requireContract(Object.hasOwn(sources, filename), 'UNEXPECTED_XSD_IMPORT');
      return provider.open(filename);
    }, read: (fd, bytes) => provider.read(fd, bytes), close: fd => provider.close(fd) }),
    'XSD_PROVIDER_UNAVAILABLE');
  })();
}

export async function validateOfficialNationalSchema(xml: string, name: string,
  profile: keyof typeof packages): Promise<void> {
  assertSafeFiscalXml(xml);
  const resources: Readonly<Record<string, { base64: string }>> = packages[profile];
  requireContract(Object.hasOwn(resources, name), 'UNSUPPORTED_FISCAL_SCHEMA');
  await initialize();
  const url = `nfse-schema://${profile}/${name}`;
  try {
    let validator = validators.get(url);
    if (!validator) {
      const schema = XmlDocument.fromBuffer(Buffer.from(resources[name].base64, 'base64'), { url, option: options });
      try { validator = XsdValidator.fromDoc(schema); validators.set(url, validator); }
      finally { schema.dispose(); }
    }
    const document = XmlDocument.fromString(xml, { option: options });
    try { validator.validate(document); } finally { document.dispose(); }
  } catch { throw new NfseContractError('OFFICIAL_XSD_VALIDATION_FAILED'); }
}
