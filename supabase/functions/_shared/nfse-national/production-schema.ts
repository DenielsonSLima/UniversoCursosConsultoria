import { validateOfficialNationalSchema } from './schema-runtime.ts';
import { assertSafeFiscalXml } from './pilot-codec.ts';
import { NfseContractError, requireContract } from './xml.ts';
import type { ProductionSchemaValidator } from './production.types.ts';

/** Original production bytes remain intact. No HOMO fallback or ignored validation. */
export function createProductionSchemaValidator(): ProductionSchemaValidator {
  return {
    async validate(xml, name, environment) {
      requireContract(environment === 'PRODUCAO', 'SCHEMA_PRODUCTION_ONLY');
      assertSafeFiscalXml(xml);
      try { await validateOfficialNationalSchema(xml, name, 'production'); }
      catch (error) {
        // TSSerieDPS has literal ^/$ anchors under XSD regex semantics.
        // Keep the full validation failure visible; never transmit anchored text.
        if ((name === 'DPS_v1.01.xsd' || name === 'NFSe_v1.01.xsd') &&
          /<(?:\w+:)?serie>\d{1,5}<\/(?:\w+:)?serie>/.test(xml) &&
          error instanceof NfseContractError && error.code === 'OFFICIAL_XSD_VALIDATION_FAILED') {
          throw new NfseContractError('PRODUCTION_DPS_SERIES_SCHEMA_CONFLICT');
        }
        throw error;
      }
    },
  };
}

/** Explicit derived profile verified against a pinned authorized XML; the live gate remains separate. */
export function createProductionNumericSeriesCompatibilityValidator(): ProductionSchemaValidator {
  return { async validate(xml, name, environment) {
    requireContract(environment === 'PRODUCAO', 'SCHEMA_PRODUCTION_ONLY');
    await validateOfficialNationalSchema(xml, name, 'production-numeric-series-compatibility');
  } };
}
