create index if not exists whatsapp_course_agent_events_faq_idx
  on public.whatsapp_course_agent_events (faq_id)
  where faq_id is not null;

create index if not exists whatsapp_course_agent_events_course_idx
  on public.whatsapp_course_agent_events (curso_id)
  where curso_id is not null;
