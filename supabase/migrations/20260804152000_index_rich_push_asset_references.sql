begin;

create index if not exists idx_comunicacao_push_campanhas_image_asset
  on public.comunicacao_push_campanhas (image_asset_id);

create index if not exists idx_push_notification_jobs_image_asset
  on public.push_notification_jobs (image_asset_id);

create index if not exists idx_aluno_notificacoes_image_asset
  on public.aluno_notificacoes (image_asset_id);

create index if not exists idx_push_birthday_settings_image_asset
  on public.push_birthday_settings (image_asset_id);

commit;
