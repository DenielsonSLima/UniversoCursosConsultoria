drop policy if exists whatsapp_course_agent_settings_write
  on public.whatsapp_course_agent_settings;

create policy whatsapp_course_agent_settings_insert
on public.whatsapp_course_agent_settings
for insert
to authenticated
with check (
  (select public.is_gestor_global())
  and (select public.gestor_has_module('configuracoes'))
);

create policy whatsapp_course_agent_settings_update
on public.whatsapp_course_agent_settings
for update
to authenticated
using (
  (select public.is_gestor_global())
  and (select public.gestor_has_module('configuracoes'))
)
with check (
  (select public.is_gestor_global())
  and (select public.gestor_has_module('configuracoes'))
);

drop policy if exists whatsapp_course_agent_faq_write
  on public.whatsapp_course_agent_faq;

create policy whatsapp_course_agent_faq_insert
on public.whatsapp_course_agent_faq
for insert
to authenticated
with check (
  (select public.is_gestor_global())
  and (select public.gestor_has_module('configuracoes'))
);

create policy whatsapp_course_agent_faq_update
on public.whatsapp_course_agent_faq
for update
to authenticated
using (
  (select public.is_gestor_global())
  and (select public.gestor_has_module('configuracoes'))
)
with check (
  (select public.is_gestor_global())
  and (select public.gestor_has_module('configuracoes'))
);

create policy whatsapp_course_agent_faq_delete
on public.whatsapp_course_agent_faq
for delete
to authenticated
using (
  (select public.is_gestor_global())
  and (select public.gestor_has_module('configuracoes'))
);
