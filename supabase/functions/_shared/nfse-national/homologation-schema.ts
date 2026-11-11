import { validateOfficialNationalSchema } from './schema-runtime.ts';
import { requireContract } from './xml.ts';
import type { HomologationSchemaValidator } from './pilot.types.ts';

/** Full official XSD validation in WASM; no subprocess or runtime schema download. */
export function createHomologationSchemaValidator(): HomologationSchemaValidator {
  return {
    async validate(xml, name, environment) {
      requireContract(environment === 'HOMOLOGACAO', 'SCHEMA_HOMOLOGATION_ONLY');
      requireContract(['DPS_v1.01.xsd', 'NFSe_v1.01.xsd', 'pedRegEvento_v1.01.xsd'].includes(name),
        'UNSUPPORTED_FISCAL_SCHEMA');
      await validateOfficialNationalSchema(xml, name, 'homologation');
    },
  };
}
