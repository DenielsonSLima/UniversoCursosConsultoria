-- Avoid anonymous reads of polos evaluating authenticated-only gestor helpers.

drop policy if exists portal_polos_select on public.polos;

create policy portal_polos_public_select
on public.polos
for select
to anon, authenticated
using (lower(coalesce(status, 'ativo')) = 'ativo');

create policy portal_polos_gestor_select
on public.polos
for select
to authenticated
using (public.is_gestor());
