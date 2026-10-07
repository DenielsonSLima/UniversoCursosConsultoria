-- EXPLICIT local doubles only for external access predicates, never production.
-- The tested functions below use real synthetic user IDs, actor_allowed, and
-- current-setting claims confined to this isolated fixture database.
create function auth.uid() returns uuid language sql stable as $$
 select nullif(current_setting('test.actor',true),'')::uuid;
$$;
create function auth.role() returns text language sql stable as $$
 select current_setting('test.jwt.role',true);
$$;
create function public.gestor_has_financeiro_tab(p_tab text) returns boolean language sql stable as $$
 select p_tab='receber' and exists(select 1 from public.usuarios_sistema u
 where u.auth_user_id=auth.uid() and u.status='ATIVO' and u.permissoes#>'{tabs,financeiro}' ? p_tab);
$$;
create function public.is_gestor_for_polo(p_polo uuid) returns boolean language sql stable as $$
 select exists(select 1 from public.usuarios_sistema u where u.auth_user_id=auth.uid()
 and u.status='ATIVO' and p_polo=any(u.polo_ids));
$$;
-- No synthetic imported/protected enrollment: these deliberately do not grant
-- an exception to a protected account or emulate any actual protected identity.
create function internal_academic.is_technical_manual_cycle_protected(uuid)
returns boolean language sql stable as $$select false;$$;
create function internal_academic.technical_imported_c1_receivable_is_local_c2(uuid,uuid)
returns boolean language sql stable as $$select false;$$;
create function public.banese_ead_replacement_bypass_valid(uuid)
returns boolean language sql stable as $$select false;$$;
create table public.payment_gateway_routes(modalidade text,payment_method text,environment text,provider_code text,enabled boolean);
create table public.cursos(id uuid primary key,modalidade text);
-- Legacy cycle-state/imported-history inputs are explicit synthetic boundaries.
-- Real canonical state wrapper + correction projection remain loaded unchanged.
create function internal_academic.technical_manual_cycle_state_before_durable_imported_history(p_id uuid)
returns jsonb language sql stable as $$
 select jsonb_build_object('estado','JA_GERADO','podeGerar',false,'matriculaId',p_id,
 'proximoCicloNumero',null,'ciclos',coalesce(jsonb_agg(jsonb_build_object('numero',r.cycle_number,
 'quantidadeItens',r.item_count,'total',r.total_amount) order by r.cycle_number),'[]'::jsonb))
 from internal_academic.technical_manual_cycle_runs r where r.matricula_id=p_id;
$$;
create function internal_academic.technical_imported_cycle_exists(uuid,integer)
returns boolean language sql stable as $$select false;$$;
create function internal_academic.technical_imported_cycle_has_conflict(uuid)
returns boolean language sql stable as $$select false;$$;
create function internal_academic.technical_imported_cycle_generation_permitted(uuid)
returns boolean language sql stable as $$select false;$$;
create function internal_academic.technical_imported_banese_cycle_is_durable(uuid,integer)
returns boolean language sql stable as $$select false;$$;
