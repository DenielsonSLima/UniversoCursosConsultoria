begin;

alter table public.mensageria_config
  add column if not exists wa_connection_mode text not null default 'cloud_api',
  add column if not exists wa_business_portfolio_id text,
  add column if not exists wa_coexistence_verified_at timestamptz,
  add column if not exists wa_contacts_sync_status text not null default 'not_requested',
  add column if not exists wa_contacts_sync_request_id text,
  add column if not exists wa_history_sync_status text not null default 'not_requested',
  add column if not exists wa_history_sync_request_id text,
  add column if not exists wa_history_sync_progress integer,
  add column if not exists wa_last_account_event text,
  add column if not exists wa_last_account_event_at timestamptz;

alter table public.whatsapp_webhook_events
  add column if not exists processing_started_at timestamptz,
  add column if not exists processing_attempts integer not null default 0;

alter table public.mensageria_config
  drop constraint if exists mensageria_config_wa_connection_mode_check,
  add constraint mensageria_config_wa_connection_mode_check
    check (wa_connection_mode in ('cloud_api', 'coexistence')),
  drop constraint if exists mensageria_config_wa_contacts_sync_status_check,
  add constraint mensageria_config_wa_contacts_sync_status_check
    check (wa_contacts_sync_status in ('not_requested', 'requested', 'receiving', 'completed', 'error')),
  drop constraint if exists mensageria_config_wa_history_sync_status_check,
  add constraint mensageria_config_wa_history_sync_status_check
    check (wa_history_sync_status in ('not_requested', 'requested', 'receiving', 'completed', 'declined', 'error')),
  drop constraint if exists mensageria_config_wa_history_sync_progress_check,
  add constraint mensageria_config_wa_history_sync_progress_check
    check (wa_history_sync_progress is null or wa_history_sync_progress between 0 and 100);

create unique index if not exists idx_whatsapp_webhook_events_payload_hash
  on public.whatsapp_webhook_events (event_key)
  where event_key like 'sha256:%';

alter table public.whatsapp_webhook_events
  drop constraint if exists whatsapp_webhook_events_processing_attempts_check,
  add constraint whatsapp_webhook_events_processing_attempts_check
    check (processing_attempts >= 0);

comment on column public.mensageria_config.wa_connection_mode is
  'Modo confirmado da conexao oficial Meta: Cloud API exclusiva ou coexistencia com WhatsApp Business App.';
comment on column public.mensageria_config.wa_coexistence_verified_at is
  'Instante em que a Meta confirmou is_on_biz_app=true e platform_type=CLOUD_API.';
comment on column public.mensageria_config.wa_history_sync_status is
  'Estado operacional da importacao unica do historico do WhatsApp Business App.';

commit;
