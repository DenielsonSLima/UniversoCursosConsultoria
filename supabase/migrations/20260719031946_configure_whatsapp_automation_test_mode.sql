begin;

alter table public.mensageria_config
  add column if not exists wa_automation_test_mode boolean not null default false,
  add column if not exists wa_automation_test_aluno_id uuid references public.parceiros(id) on delete set null,
  add column if not exists wa_automation_test_recipient_phone text;

update public.mensageria_config
set wa_automation_test_mode = true,
    wa_automation_test_aluno_id = '210247bc-6212-4388-92cc-b63baf865e16',
    wa_automation_test_recipient_phone = '5579996916353'
where tipo = 'whatsapp';

comment on column public.mensageria_config.wa_automation_test_mode is
  'Quando ativo, restringe todos os agentes automaticos a um aluno e redireciona o envio ao telefone de teste.';

commit;
