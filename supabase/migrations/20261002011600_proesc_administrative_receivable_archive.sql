begin;

-- Administrative recovery archive, NOT a provider cancellation or settlement.
-- No row is archived by this migration. An exact, separately approved request
-- must be executed by the database administrator after a read-only preview.
create table internal_proesc.administrative_archive_requests (
  request_id uuid primary key,
  action text not null check(action in ('ARCHIVE','RESTORE')),
  payload jsonb not null check(jsonb_typeof(payload)='object'),
  payload_hash text not null check(payload_hash ~ '^[0-9a-f]{32}$'),
  approval_reference text not null check(length(approval_reference) between 8 and 200),
  reason text not null check(length(reason) between 20 and 1000),
  executed_by text not null,
  database_session text not null,
  transaction_id bigint not null,
  recorded_at timestamptz not null default now(),
  response jsonb
);
create table internal_proesc.administrative_receivable_archive (
  receivable_id uuid primary key,
  link_id uuid not null unique references internal_proesc.obligation_links(id),
  request_id uuid not null references internal_proesc.administrative_archive_requests(request_id),
  snapshot_id uuid not null references internal_proesc.financial_snapshots(id),
  receipt jsonb not null check(jsonb_typeof(receipt)='object'
    and receipt->>'id'=receivable_id::text),
  original_link jsonb not null check(jsonb_typeof(original_link)='object'
    and original_link->>'id'=link_id::text and original_link->>'receivable_id'=receivable_id::text),
  receipt_hash text not null check(receipt_hash=md5(receipt::text)),
  link_hash text not null check(link_hash=md5(original_link::text)),
  snapshot_hash text not null check(snapshot_hash ~ '^[0-9a-f]{32}$'),
  archived_at timestamptz not null default now(),
  restored_by_request uuid references internal_proesc.administrative_archive_requests(request_id),
  unique(receivable_id,link_id)
);
alter table internal_proesc.administrative_archive_requests enable row level security;
alter table internal_proesc.administrative_receivable_archive enable row level security;
revoke all on internal_proesc.administrative_archive_requests,
  internal_proesc.administrative_receivable_archive from public,anon,authenticated,service_role;

-- Keep the original external identity and every dependent observation/audit row.
-- The archive reference is paired to this exact link, never to another receipt.
alter table internal_proesc.obligation_links alter column receivable_id drop not null;
alter table internal_proesc.obligation_links add column archived_receivable_id uuid unique;
alter table internal_proesc.obligation_links add constraint obligation_links_archive_identity_fk
  foreign key(archived_receivable_id,id)
  references internal_proesc.administrative_receivable_archive(receivable_id,link_id);
alter table internal_proesc.obligation_links add constraint obligation_links_active_or_archived
  check((receivable_id is not null) <> (archived_receivable_id is not null));
alter table internal_proesc.obligation_links add constraint obligation_links_archive_automation_off
  check(archived_receivable_id is null or auto_enabled=false);

create function internal_proesc.require_archive_database_operator()
returns void language plpgsql stable security invoker set search_path='' as $operator$
begin
  -- No fabricated JWT/user identity. This private maintenance path is not a
  -- PostgREST endpoint and has no application-role EXECUTE grant.
  if current_user<>'postgres' then
    raise exception 'Operação administrativa de banco restrita.' using errcode='42501';
  end if;
end;
$operator$;

create function internal_proesc.assert_archive_no_receivable_dependencies(p_receivable_id uuid)
returns void language plpgsql stable security invoker set search_path='' as $dependencies$
declare v_fk record; v_found boolean;
begin
  -- Fail closed for every current/future FK, including CASCADE and SET NULL.
  -- obligation_links alone is intentionally preserved and detached atomically.
  for v_fk in
    select n.nspname schema_name,c.relname table_name,a.attname column_name,
      cardinality(k.conkey) key_count
    from pg_catalog.pg_constraint k
    join pg_catalog.pg_class c on c.oid=k.conrelid
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    join pg_catalog.pg_attribute a on a.attrelid=k.conrelid and a.attnum=k.conkey[1]
    where k.contype='f' and k.confrelid='public.contas_receber'::regclass
      and k.conrelid<>'internal_proesc.obligation_links'::regclass
  loop
    if v_fk.key_count<>1 then
      raise exception 'Nova dependência composta exige revisão.' using errcode='55000'; end if;
    execute format('select exists(select 1 from %I.%I where %I=$1)',
      v_fk.schema_name,v_fk.table_name,v_fk.column_name) into v_found using p_receivable_id;
    if v_found then
      raise exception 'O registro possui dependência financeira ou operacional.' using errcode='55000'; end if;
  end loop;
end;
$dependencies$;
revoke all on function internal_proesc.require_archive_database_operator(),
  internal_proesc.assert_archive_no_receivable_dependencies(uuid)
  from public,anon,authenticated,service_role;
commit;
