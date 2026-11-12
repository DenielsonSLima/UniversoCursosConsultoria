-- ADMIN ONLY. Reverts only records untouched since provisional backfill.
begin;
lock table public.parceiros in share row exclusive mode;
alter table public.parceiros disable trigger require_student_address_number;
update public.parceiros p set numero=a.previous_numero
from private.student_address_number_backfill a
where a.batch='20261112_student_number_sn' and a.parceiro_id=p.id
and p.tipo='Aluno' and p.numero=a.replacement_numero and p.xmin::text=a.row_version_after;
alter table public.parceiros enable trigger require_student_address_number;
commit;
