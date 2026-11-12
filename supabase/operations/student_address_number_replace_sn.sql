-- ADMIN ONLY. Explicit owner correction; do not touch genuine 00 or edited records.
begin;
with candidates as materialized (
 select p.id,p.numero from public.parceiros p
 join private.student_address_number_backfill a on a.parceiro_id=p.id and a.batch='20261112_student_number_00'
 where p.tipo='Aluno' and p.numero='00' and p.xmin::text=a.row_version_after
 and not exists(select 1 from private.student_address_number_backfill b where b.batch='20261112_student_number_sn' and b.parceiro_id=p.id)
 for update of p
), saved as (
 insert into private.student_address_number_backfill(batch,parceiro_id,previous_numero,replacement_numero)
 select '20261112_student_number_sn',id,numero,'S/N' from candidates returning parceiro_id
)
update public.parceiros p set numero='S/N' from saved s where p.id=s.parceiro_id;
update private.student_address_number_backfill a set row_version_after=p.xmin::text
from public.parceiros p where a.batch='20261112_student_number_sn' and a.parceiro_id=p.id and a.row_version_after is null;
select count(*) as audited from private.student_address_number_backfill where batch='20261112_student_number_sn';
commit;
