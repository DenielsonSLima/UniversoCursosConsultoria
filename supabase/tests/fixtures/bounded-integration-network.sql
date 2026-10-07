-- Isolated recorder only. Never performs an HTTP request or accesses a real secret.
create schema net;
create table net.mock_requests(id bigint generated always as identity,url text,body jsonb,headers jsonb);
create function public.get_banese_reconciliation_worker_secret() returns text language sql as $$
 select 'synthetic-local-worker-auth-recorder-only';
$$;
create function net.http_post(url text,body jsonb,params jsonb,headers jsonb,timeout_milliseconds integer)
returns bigint language plpgsql as $$declare rid bigint;begin
 insert into net.mock_requests(url,body,headers) values(url,body,headers) returning id into rid;
 return rid;
end $$;
