begin;

drop policy if exists comunicacao_push_campanhas_client_deny on public.comunicacao_push_campanhas;
create policy comunicacao_push_campanhas_client_deny
on public.comunicacao_push_campanhas for all to authenticated
using (false) with check (false);

drop policy if exists comunicacao_push_previews_client_deny on public.comunicacao_push_previews;
create policy comunicacao_push_previews_client_deny
on public.comunicacao_push_previews for all to authenticated
using (false) with check (false);

drop policy if exists push_notification_jobs_client_deny on public.push_notification_jobs;
create policy push_notification_jobs_client_deny
on public.push_notification_jobs for all to authenticated
using (false) with check (false);

drop policy if exists push_notification_deliveries_client_deny on public.push_notification_deliveries;
create policy push_notification_deliveries_client_deny
on public.push_notification_deliveries for all to authenticated
using (false) with check (false);

revoke all on function public.enqueue_chat_push_notification() from public, anon, authenticated;
revoke all on function public.push_notification_touch_updated_at() from public, anon, authenticated;

commit;
