import { Buffer } from 'node:buffer';
import { ParseOption, XmlDocument, XsdValidator, XmlBufferInputProvider,
  xmlRegisterInputProvider } from 'npm:libxml2-wasm@0.7.2';
import { HOMOLOGATION_SCHEMAS } from './schemas/homologation.generated.ts';
import { assertSafeFiscalXml } from './pilot-codec.ts';
import { NfseContractError, requireContract } from './xml.ts';
import type { HomologationSchemaValidator } from './pilot.types.ts';

const base = 'nfse-schema://homologation/';
const parseOptions = ParseOption.XML_PARSE_NONET | ParseOption.XML_PARSE_NO_XXE;
const validators = new Map<string, XsdValidator>();
let initialized: Promise<void> | undefined;

function initialize() {
  return initialized ??= (async () => {
    const sources: Record<string, Uint8Array> = {};
    for (const [name, resource] of Object.entries(HOMOLOGATION_SCHEMAS)) {
      const bytes = new Uint8Array(Buffer.from(resource.base64, 'base64'));
      const digest = Buffer.from(await crypto.subtle.digest('SHA-256', bytes)).toString('hex');
      requireContract(digest === resource.sha256, 'OFFICIAL_XSD_INTEGRITY_FAILED');
      sources[`${base}${name}`] = bytes;
    }
    const provider = new XmlBufferInputProvider(sources);
    // Claim every external URI and serve only the immutable official in-memory allowlist.
    // This provider never opens a file, socket, DTD, catalog or caller-selected schema.
    xmlRegisterInputProvider({ match: () => true, open: filename => {
      requireContract(Object.hasOwn(sources, filename), 'UNEXPECTED_XSD_IMPORT');
      return provider.open(filename);
    }, read: (fd, bytes) => provider.read(fd, bytes), close: fd => provider.close(fd) });
  })();
}

/** Full official XSD validation in WASM; no subprocess and no runtime schema download. */
export function createHomologationSchemaValidator(): HomologationSchemaValidator {
  return {
    async validate(xml, name, environment) {
      requireContract(environment === 'HOMOLOGACAO', 'SCHEMA_HOMOLOGATION_ONLY');
      requireContract(['DPS_v1.01.xsd', 'NFSe_v1.01.xsd', 'pedRegEvento_v1.01.xsd'].includes(name),
        'UNSUPPORTED_FISCAL_SCHEMA');
      assertSafeFiscalXml(xml);
      await initialize();
      try {
        let validator = validators.get(name);
        if (!validator) {
          const schema = XmlDocument.fromBuffer(Buffer.from(HOMOLOGATION_SCHEMAS[name].base64, 'base64'),
            { url: `${base}${name}`, option: parseOptions });
          try { validator = XsdValidator.fromDoc(schema); validators.set(name, validator); }
          finally { schema.dispose(); }
        }
        const doc = XmlDocument.fromString(xml, { option: parseOptions });
        try { validator.validate(doc); } finally { doc.dispose(); }
      } catch { throw new NfseContractError('OFFICIAL_XSD_VALIDATION_FAILED'); }
    },
  };
}
