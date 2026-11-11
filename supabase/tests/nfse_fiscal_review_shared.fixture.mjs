import { readFile } from 'node:fs/promises';

const migration = name => readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
const definition = (source, name) => {
  const start = source.indexOf(`FUNCTION ${name}(`);
  if (start < 0) throw new Error(`Missing function: ${name}`);
  const end = source.indexOf('$function$;', start);
  if (end < 0) throw new Error(`Missing function terminator: ${name}`);
  return `CREATE OR REPLACE ${source.slice(start, end + '$function$;'.length)}`;
};

export async function installNfseSharedVisibility(db) {
  await db.exec(`ALTER TABLE public.polos ADD COLUMN IF NOT EXISTS is_matriz boolean DEFAULT false;
    -- Synthetic prerequisites: a model with a fixed person is not shared.
    CREATE OR REPLACE FUNCTION private.nfse_preset_partner_ids(jsonb) RETURNS TABLE(partner_id uuid)
      LANGUAGE sql IMMUTABLE AS $$ SELECT ($1#>>'{peopleOptions,destinationPartnerId}')::uuid
      WHERE $1#>>'{peopleOptions,destinationPartnerId}' IS NOT NULL $$;
    CREATE OR REPLACE FUNCTION private.nfse_model_partner_label(uuid,uuid) RETURNS text
      LANGUAGE sql STABLE AS $$ SELECT NULL::text $$;`);
  await db.exec(definition(await migration('20261111121000_nfse_shared_model_scope.sql'), 'private.nfse_model_visible_to_polo'));
}

export async function installNfseSharedAcademicConsumers(db) {
  const consumers = await migration('20261111121001_nfse_shared_model_consumers.sql');
  const preparation = await migration('20261111121002_nfse_shared_model_preparation.sql');
  for (const [sql, name] of [
    [consumers, 'private.nfse_fiscal_review_basis'],
    [consumers, 'private.nfse_queue_operation_basis'],
    [preparation, 'public.prepare_nfse_batch_secure'],
    [preparation, 'public.save_nfse_fiscal_review_secure'],
  ]) await db.exec(definition(sql, name));
}
