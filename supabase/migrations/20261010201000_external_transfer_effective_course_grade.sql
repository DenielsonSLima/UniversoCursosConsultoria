begin;
-- The course matrix is the grade. Class rows only override teacher/completion.
create function internal_academic.transfer_course_grade_rows(p_turma_id uuid)
returns table(modulo_id uuid,modulo_nome text,modulo_ordem integer,
  disciplina_id uuid,disciplina_nome text,disciplina_ordem integer,carga_horaria integer)
language sql stable security definer set search_path='' as $function$
  with modules as (
    select m.id,m.nome,row_number() over(order by m.ordem nulls last,m.created_at,m.id)::integer position
    from public.turmas t join public.cursos c on c.id=t.curso_id
    join public.modulos m on m.curso_id=c.id
    where t.id=p_turma_id and upper(coalesce(c.modalidade,'')) in ('TECNICO','TÉCNICO')
  ), subjects as (
    select d.*,row_number() over(partition by d.modulo_id
      order by d.ordem nulls last,d.created_at,d.id)::integer position
    from public.disciplinas d join modules m on m.id=d.modulo_id
  )
  select m.id,m.nome,m.position,d.id,d.nome,d.position,coalesce(d.carga_horaria,0)
    from modules m left join subjects d on d.modulo_id=m.id
    order by m.position,d.position;
$function$;

create function public.get_grade_recebimento_transferencia_tecnica_secure(p_turma_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $function$
declare v_course uuid; v_name text; v_modules jsonb;
begin
  if auth.role() is distinct from 'authenticated' or auth.uid() is null
    or not (coalesce(public.gestor_can_read_enrollment_continuity(p_turma_id),false)
      or coalesce(public.can_write_turma(p_turma_id),false)) then
    raise exception 'Sem permissão para consultar a grade desta turma.' using errcode='42501'; end if;
  select c.id,c.nome into v_course,v_name from public.turmas t join public.cursos c on c.id=t.curso_id
    where t.id=p_turma_id and upper(coalesce(c.modalidade,'')) in ('TECNICO','TÉCNICO');
  if not found then raise exception 'Turma técnica não encontrada.' using errcode='22023'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',g.modulo_id,'nome',g.modulo_nome,'ordem',g.modulo_ordem,
    'disciplinas',g.subjects) order by g.modulo_ordem),'[]'::jsonb) into v_modules
  from (
    select r.modulo_id,r.modulo_nome,r.modulo_ordem,
      coalesce(jsonb_agg(jsonb_build_object('id',r.disciplina_id,'nome',r.disciplina_nome,
        'ordem',r.disciplina_ordem,'cargaHoraria',r.carga_horaria) order by r.disciplina_ordem)
        filter(where r.disciplina_id is not null),'[]'::jsonb) subjects
    from internal_academic.transfer_course_grade_rows(p_turma_id) r
    group by r.modulo_id,r.modulo_nome,r.modulo_ordem
  ) g;
  return jsonb_build_object('versao',1,'turmaId',p_turma_id,'cursoId',v_course,'cursoNome',v_name,'modulos',v_modules);
end;
$function$;

do $patch$
declare v_oid regprocedure:='internal_academic.p1_salvar_aproveitamentos_transferencia_externa_20260719(uuid,jsonb,text)'::regprocedure;
  v_definition text; v_from text;
begin
  v_definition:=pg_get_functiondef(v_oid);
  v_from:=$old$      FROM public.turmas_disciplinas td
      WHERE td.turma_id = v_matricula.turma_id
        AND td.disciplina_id = v_disciplina_id$old$;
  if length(v_definition)-length(replace(v_definition,v_from,''))<>length(v_from) then
    raise exception 'Aproveitamento: effective grade boundary changed.'; end if;
  execute replace(v_definition,v_from,$new$      FROM internal_academic.transfer_course_grade_rows(v_matricula.turma_id) grade
      WHERE grade.disciplina_id = v_disciplina_id
      UNION ALL
      SELECT 1 FROM public.turmas_disciplinas td
      JOIN public.turmas t ON t.id=td.turma_id JOIN public.cursos c ON c.id=t.curso_id
      WHERE td.turma_id=v_matricula.turma_id AND td.disciplina_id=v_disciplina_id
        AND upper(coalesce(c.modalidade,'')) NOT IN ('TECNICO','TÉCNICO')$new$);
end;
$patch$;
revoke all on function internal_academic.transfer_course_grade_rows(uuid),
  public.get_grade_recebimento_transferencia_tecnica_secure(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_grade_recebimento_transferencia_tecnica_secure(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
