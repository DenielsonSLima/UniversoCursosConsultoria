create index if not exists idx_whatsapp_automation_deliveries_receivable
  on public.whatsapp_automation_deliveries (receivable_id)
  where receivable_id is not null;
