CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA private;
CREATE FUNCTION private.authorize_nfse_model_scope(c uuid,p uuid,e text,m text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF c<>'00000000-0000-0000-0000-000000000010'::uuid OR p<>'00000000-0000-0000-0000-000000000001'::uuid
  OR e<>'PRODUCAO' OR m !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN RAISE insufficient_privilege; END IF;
END$$;
CREATE TABLE private.nfse_individual_operations(id uuid PRIMARY KEY,authorized_xml text);
CREATE TABLE private.nfse_operation_source_projection(operation_id uuid PRIMARY KEY,source_id uuid,source_kind text,
 polo_id uuid,environment text,month text,issue_state text,state text,snapshot jsonb,command jsonb,result jsonb,
 number text,access_key text,message text,created_at timestamptz DEFAULT '2026-11-11T12:00:00Z');
CREATE TABLE private.nfse_confirmed_cancellations(operation_id uuid PRIMARY KEY);
CREATE TABLE private.nfse_error_archives(operation_id uuid PRIMARY KEY,archived_at timestamptz);
CREATE FUNCTION private.nfse_error_archivable(private.nfse_individual_operations) RETURNS boolean LANGUAGE sql AS $$SELECT true$$;
CREATE FUNCTION private.nfse_authorized_xml_emitted_at(text) RETURNS timestamptz LANGUAGE sql AS $$SELECT nullif($1,'')::timestamptz$$;
CREATE FUNCTION private.nfse_operation_fields(text,uuid) RETURNS jsonb LANGUAGE sql AS $$SELECT '{}'::jsonb$$;
