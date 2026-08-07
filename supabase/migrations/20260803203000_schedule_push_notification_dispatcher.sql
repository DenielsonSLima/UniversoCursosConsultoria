begin;

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'dispatch-push-notifications'
  limit 1;

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  perform cron.schedule(
    'dispatch-push-notifications',
    '* * * * *',
    $cron$
      select net.http_post(
        url := 'https://kfekgwyqozhicpfuunpo.supabase.co/functions/v1/push-notification-dispatcher',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'push_notification_worker_secret'
            limit 1
          )
        ),
        body := jsonb_build_object('limit', 100),
        timeout_milliseconds := 50000
      );
    $cron$
  );
end;
$$;

commit;
