begin;

alter table public.push_notification_assets
  drop constraint if exists push_notification_assets_path_check;

alter table public.push_notification_assets
  add constraint push_notification_assets_path_check
  check (
    object_path ~ '^(campaigns|birthday)/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|jpeg|png)$'
  );

alter table public.aluno_notificacoes
  drop constraint if exists aluno_notificacoes_image_path_check;

alter table public.aluno_notificacoes
  add constraint aluno_notificacoes_image_path_check
  check (
    image_path is null
    or image_path ~ '^(campaigns|birthday)/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|jpeg|png)$'
  );

commit;
