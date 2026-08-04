begin;

drop policy if exists aluno_notificacoes_select_own
on public.aluno_notificacoes;

create policy aluno_notificacoes_select_own
on public.aluno_notificacoes
for select
to authenticated
using (
  aluno_id = (select public.current_aluno_id())
  and visible_at <= now()
);

-- O arquivamento e filtro de produto, nao fronteira de autorizacao. Manter a
-- linha legivel pelo proprio aluno permite que o Realtime entregue o UPDATE
-- de arquivamento a outras sessoes; todas as APIs abaixo excluem arquivadas.

create or replace function public.aluno_notificacoes_listar_pagina(
  p_filter text default 'all',
  p_limit integer default 20,
  p_snapshot_at timestamptz default null,
  p_cursor_visible_at timestamptz default null,
  p_cursor_id uuid default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_aluno_id uuid := public.current_aluno_id();
  v_filter text := lower(btrim(coalesce(p_filter, 'all')));
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 50));
  v_snapshot_at timestamptz;
  v_rows jsonb := '[]'::jsonb;
  v_items jsonb := '[]'::jsonb;
  v_has_more boolean := false;
  v_last jsonb;
begin
  if v_aluno_id is null then
    raise exception 'ALUNO_IDENTITY_REQUIRED' using errcode = '42501';
  end if;

  if v_filter not in ('all', 'unread', 'financial', 'academic', 'institutional') then
    raise exception 'INVALID_NOTIFICATION_FILTER' using errcode = '22023';
  end if;

  if (p_cursor_visible_at is null) <> (p_cursor_id is null)
     or (p_cursor_visible_at is not null and p_snapshot_at is null)
     or (p_cursor_visible_at is null and p_snapshot_at is not null) then
    raise exception 'INVALID_NOTIFICATION_CURSOR' using errcode = '22023';
  end if;

  v_snapshot_at := least(coalesce(p_snapshot_at, now()), now());

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', page.id,
        'aluno_id', page.aluno_id,
        'source_job_id', page.source_job_id,
        'source_type', page.source_type,
        'category', page.category,
        'title', page.title,
        'body', page.body,
        'deep_link', page.deep_link,
        'visible_at', page.visible_at,
        'read_at', page.read_at,
        'created_at', page.created_at
      )
      order by page.visible_at desc, page.id desc
    ),
    '[]'::jsonb
  )
  into v_rows
  from (
    select notification.*
    from public.aluno_notificacoes notification
    where notification.aluno_id = v_aluno_id
      and notification.archived_at is null
      and notification.visible_at <= v_snapshot_at
      and (
        p_cursor_visible_at is null
        or (notification.visible_at, notification.id) < (p_cursor_visible_at, p_cursor_id)
      )
      and case v_filter
        when 'unread' then notification.read_at is null
        when 'financial' then notification.category = 'financial'
        when 'academic' then notification.category in ('academic', 'calendar')
        when 'institutional' then notification.category in ('institutional', 'service', 'marketing')
        else true
      end
    order by notification.visible_at desc, notification.id desc
    limit v_limit + 1
  ) page;

  v_has_more := jsonb_array_length(v_rows) > v_limit;

  select coalesce(jsonb_agg(entry.value order by entry.ordinality), '[]'::jsonb)
  into v_items
  from jsonb_array_elements(v_rows) with ordinality as entry(value, ordinality)
  where entry.ordinality <= v_limit;

  if jsonb_array_length(v_items) > 0 then
    v_last := v_items -> (jsonb_array_length(v_items) - 1);
  end if;

  return jsonb_build_object(
    'items', v_items,
    'snapshotAt', v_snapshot_at,
    'nextCursor', case
      when v_has_more and v_last is not null then jsonb_build_object(
        'snapshotAt', v_snapshot_at,
        'visibleAt', v_last ->> 'visible_at',
        'id', v_last ->> 'id'
      )
      else null
    end
  );
end;
$$;

revoke all on function public.aluno_notificacoes_listar_pagina(
  text,
  integer,
  timestamptz,
  timestamptz,
  uuid
) from public, anon;

grant execute on function public.aluno_notificacoes_listar_pagina(
  text,
  integer,
  timestamptz,
  timestamptz,
  uuid
) to authenticated;

commit;
