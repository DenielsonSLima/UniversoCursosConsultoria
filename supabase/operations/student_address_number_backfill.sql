-- ADMIN ONLY. Explicit owner authorization: provisional 00, only blank existing Aluno.
-- Locks candidates; preserves original value and xmin for conditional rollback.
begin;
with candidates as materialized (
 select id,numero from public.parceiros
 where tipo='Aluno' and nullif(btrim(numero),'') is null
 and not exists(select 1 from private.student_address_number_backfill a where a.batch='20261112_student_number_00' and a.parceiro_id=parceiros.id)
 for update
), saved as (
 insert into private.student_address_number_backfill(batch,parceiro_id,previous_numero,replacement_numero)
 select '20261112_student_number_00',id,numero,'00' from candidates returning parceiro_id
)
update public.parceiros p set numero='00' from saved s where p.id=s.parceiro_id;
update private.student_address_number_backfill a set row_version_after=p.xmin::text
from public.parceiros p where a.batch='20261112_student_number_00' and a.parceiro_id=p.id and a.row_version_after is null;
select count(*) as audited from private.student_address_number_backfill where batch='20261112_student_number_00';
commit;
