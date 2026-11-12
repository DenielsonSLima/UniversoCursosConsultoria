-- Confiança permite estudo por 24h, sem alterar matrícula ou estado financeiro.
alter table public.matriculas add column acesso_temporario_ate timestamptz;
create table internal_academic.ead_trust_access_audit (
  matricula_id uuid primary key references public.matriculas(id),
  granted_at timestamptz not null,
  expires_at timestamptz not null,
  granted_by uuid,
  database_actor text not null,
  check (expires_at = granted_at + interval '24 hours')
);
revoke all on internal_academic.ead_trust_access_audit from public, anon, authenticated;

create function internal_academic.guard_ead_trust_access()
returns trigger language plpgsql set search_path='' as $$
begin
  if (TG_OP='INSERT' and new.acesso_temporario_ate is not null)
    or (TG_OP='UPDATE' and new.acesso_temporario_ate is distinct from old.acesso_temporario_ate) then
    if current_user not in ('postgres','supabase_admin') then
      raise exception 'Use a liberação por confiança autorizada.' using errcode='42501';
    end if;
  end if;
  return new;
end $$;
create trigger protect_ead_trust_access before insert or update on public.matriculas
for each row execute function internal_academic.guard_ead_trust_access();

create function internal_academic.ead_has_trust_access(p_matricula_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.matriculas m
    join public.turmas t on t.id=m.turma_id join public.cursos c on c.id=t.curso_id
    where m.id=p_matricula_id and c.modalidade='EAD'
      and upper(m.status) in ('PENDENTE','AGUARDANDO_PAGAMENTO','AGUARDANDO_CONFIRMACAO')
      and m.acesso_temporario_ate > statement_timestamp());
$$;
revoke all on function internal_academic.ead_has_trust_access(uuid) from public,anon,authenticated;

create function public.ead_liberar_por_confianca(p_matricula_id uuid)
returns timestamptz language plpgsql security definer set search_path='' as $$
declare v_m public.matriculas%rowtype; v_expiry timestamptz; v_now timestamptz := statement_timestamp();
begin
  if auth.uid() is null or not coalesce(public.gestor_has_module('gestao'),false) then
    raise exception 'Acesso à gestão EAD obrigatório.' using errcode='42501';
  end if;
  select m.* into v_m from public.matriculas m
    join public.turmas t on t.id=m.turma_id join public.cursos c on c.id=t.curso_id
    where m.id=p_matricula_id and c.modalidade='EAD' for update of m;
  if not found or not coalesce(public.can_write_turma(v_m.turma_id),false) then
    raise exception 'Matrícula fora do escopo autorizado.' using errcode='42501';
  end if;
  if coalesce(upper(v_m.status),'') not in ('PENDENTE','AGUARDANDO_PAGAMENTO','AGUARDANDO_CONFIRMACAO') then
    raise exception 'A confiança exige matrícula aguardando pagamento.' using errcode='23514';
  end if;
  select expires_at into v_expiry from internal_academic.ead_trust_access_audit
    where matricula_id=p_matricula_id;
  if found then
    if v_expiry <= v_now then
      raise exception 'As 24 horas de confiança já expiraram; confirme o pagamento.' using errcode='PT409';
    end if;
    return v_expiry;
  end if;
  v_expiry := v_now + interval '24 hours';
  insert into internal_academic.ead_trust_access_audit
    values(p_matricula_id,v_now,v_expiry,auth.uid(),session_user);
  update public.matriculas set acesso_temporario_ate=v_expiry where id=p_matricula_id;
  return v_expiry;
end $$;
revoke all on function public.ead_liberar_por_confianca(uuid) from public,anon;
grant execute on function public.ead_liberar_por_confianca(uuid) to authenticated;
