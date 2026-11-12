import {fixture,migration,uid} from './nfse-reconciliation-fixture.mjs';

export async function continuationFixture(module) {
  const db=await fixture(module);
  await db.exec(`CREATE SCHEMA extensions; CREATE SCHEMA net; CREATE SCHEMA cron;
    CREATE FUNCTION extensions.gen_random_bytes(n int) RETURNS bytea LANGUAGE sql AS $$SELECT decode(repeat('ab',n),'hex')$$;
    CREATE FUNCTION vault.create_secret(secret text,name text) RETURNS uuid LANGUAGE plpgsql AS $$DECLARE id uuid:=gen_random_uuid(); BEGIN
      INSERT INTO vault.secrets(id,name,decrypted_secret) VALUES(id,name,secret); RETURN id; END$$;
    CREATE TABLE net.calls(id bigint GENERATED ALWAYS AS IDENTITY,url text,headers jsonb,body jsonb,timeout integer);
    CREATE FUNCTION net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) RETURNS bigint LANGUAGE plpgsql AS $$DECLARE id bigint; BEGIN
      IF current_setting('test.fail_net',true)='true' THEN RAISE EXCEPTION 'synthetic network unavailable'; END IF;
      INSERT INTO net.calls(url,headers,body,timeout) VALUES(url,headers,body,timeout_milliseconds)
        RETURNING net.calls.id INTO id; RETURN id; END$$;
    CREATE TABLE cron.jobs(name text,schedule text,command text);
    CREATE FUNCTION cron.schedule(name text,schedule text,command text) RETURNS bigint LANGUAGE plpgsql AS $$BEGIN
      INSERT INTO cron.jobs VALUES(name,schedule,command); RETURN 1; END$$;`);
  await migration(db,'20261112220300_nfse_reconciliation_scheduler.sql');
  await migration(db,'20261112220400_nfse_reconciliation_continuation.sql');
  const jwt=`eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({role:'anon',ref:'kfekgwyqozhicpfuunpo',exp:4102444800})).toString('base64url')}.synthetic_signature`;
  await db.query(`INSERT INTO vault.secrets(name,decrypted_secret) VALUES('nfse_reconciliation_gateway_jwt',$1)`,[jwt]);
  return db;
}

export async function addSubmitted(db,n) {
  await db.query(`INSERT INTO private.nfse_individual_operations(id,polo_id,environment,month,state,signed_dps_xml)
    VALUES($1,$2,'PRODUCAO','2026-11','PROCESSING','synthetic-signed')`,[uid(n),uid(100)]);
}

export const calls=async db=>(await db.query('SELECT * FROM net.calls ORDER BY id')).rows;
export const kick=db=>db.exec('SELECT private.kick_nfse_reconciliation_worker()');
export const enable=db=>db.exec('UPDATE private.nfse_reconciliation_control SET enabled=true');
