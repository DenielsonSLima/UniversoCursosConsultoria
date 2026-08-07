begin;

-- A função só combina verificações já protegidas por RLS e identidade da sessão.
-- SECURITY INVOKER evita expô-la como RPC privilegiada sem alterar o contrato das policies.
alter function public.biblioteca_document_folder_write_allowed(uuid, uuid)
  security invoker;

commit;
