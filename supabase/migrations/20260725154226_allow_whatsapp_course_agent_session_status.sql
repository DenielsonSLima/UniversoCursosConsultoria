alter table public.whatsapp_flow_sessions
  drop constraint if exists whatsapp_flow_sessions_status_check;

alter table public.whatsapp_flow_sessions
  add constraint whatsapp_flow_sessions_status_check
  check (
    status in (
      'awaiting_cpf',
      'menu',
      'course_agent',
      'choosing_receivable',
      'choosing_irpf_year',
      'handoff',
      'closed'
    )
  );
