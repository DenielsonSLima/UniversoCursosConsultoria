-- LOCAL DRAFT. No production application or execution is authorized.
begin;
alter table internal_financial_correction.operations add column finalizing_xid bigint;

create function internal_financial_correction.reset_fields()
returns text[] language sql immutable set search_path='' as $$
 select array['gateway_payment_id','gateway_customer_id','gateway_payment_link_id',
 'gateway_installment_id','gateway_status','gateway_invoice_url','gateway_bank_slip_url',
 'gateway_pix_payload','gateway_pix_encoded_image','gateway_transaction_receipt_url',
 'gateway_fee_value','gateway_net_value','gateway_synced_at','gateway_last_error',
 'gateway_boleto_linha_digitavel','gateway_boleto_codigo_barras','gateway_boleto_nosso_numero',
 'gateway_boleto_issued_at','gateway_financial_terms_confirmed_at','gateway_creation_token',
 'gateway_submission_channel','gateway_submission_status','gateway_cnab_file_id'];
$$;

create function internal_financial_correction.finalizing(p_id uuid)
returns boolean language sql volatile security definer set search_path='' as $$
 select exists(select 1 from internal_financial_correction.items i
 join internal_financial_correction.operations o on o.id=i.operation_id
 where i.receivable_id=p_id and o.state='BANK_CONFIRMED'
 and o.execution_enabled and o.finalizing_xid=txid_current()
 and o.id::text=current_setting('app.bounded_financial_correction_id',true)
 and i.state in ('BANK_CONFIRMED','READY'));
$$;

-- Durable reviewed-date overlay, without mutating the old run or one-off overlay.
create function internal_financial_correction.corrected_receivable_valid(r public.contas_receber)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from internal_financial_correction.items i
 join internal_financial_correction.operations o on o.id=i.operation_id
 join internal_academic.technical_manual_cycle_runs run
 on run.matricula_id=i.matricula_id and run.cycle_number=1
 where i.receivable_id=r.id and i.kind='RESET_C1'
 and ((o.state='FINALIZED' and i.state='FINALIZED') or
   (o.state='BANK_CONFIRMED' and i.state='BANK_CONFIRMED' and
    o.finalizing_xid=txid_current() and o.id::text=current_setting('app.bounded_financial_correction_id',true)))
 and i.bank_evidence is not null and i.bank_evidence_hash=
 internal_financial_correction.sha256(i.bank_evidence::text)
 and to_jsonb(run)=i.run_snapshot and r.id=any(run.receivable_ids)
 and r.matricula_id=(i.receivable_snapshot->>'matricula_id')::uuid
 and r.turma_id=(i.receivable_snapshot->>'turma_id')::uuid
 and r.polo_id=(i.receivable_snapshot->>'polo_id')::uuid
 and r.cliente_id=(i.receivable_snapshot->>'cliente_id')::uuid
 and r.origem_cronograma_id=i.receivable_snapshot->>'origem_cronograma_id'
 and r.tipo_lancamento='PARCELA' and r.parcela_numero=(i.receivable_snapshot->>'parcela_numero')::integer
 and r.valor=(i.receivable_snapshot->>'valor')::numeric
 and r.regra_financeira_tecnica_snapshot=i.receivable_snapshot->'regra_financeira_tecnica_snapshot'
 and r.data_vencimento=i.corrected_due_date
 and exists(select 1 from public.matriculas m join public.turmas t on t.id=m.turma_id
 where m.id=r.matricula_id and m.turma_id=r.turma_id and m.aluno_id=r.cliente_id and t.polo_id=r.polo_id));
$$;

create function internal_financial_correction.reset_transition_valid(
 old_row public.contas_receber,new_row public.contas_receber)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare i internal_financial_correction.items%rowtype; key text;
begin
 if not internal_financial_correction.finalizing(old_row.id) then return false; end if;
 select * into i from internal_financial_correction.items where receivable_id=old_row.id;
 if i.kind<>'RESET_C1' or not internal_financial_correction.corrected_receivable_valid(new_row)
 or internal_financial_correction.has_payment_evidence(old_row)
 or new_row.gateway_financial_terms is distinct from i.corrected_terms
 or new_row.updated_at<=old_row.updated_at
 or (to_jsonb(new_row)-(internal_financial_correction.reset_fields()||array['updated_at','data_vencimento','gateway_financial_terms']))
 is distinct from (to_jsonb(old_row)-(internal_financial_correction.reset_fields()||array['updated_at','data_vencimento','gateway_financial_terms']))
 then return false; end if;
 foreach key in array internal_financial_correction.reset_fields() loop
   if to_jsonb(new_row)->key is distinct from 'null'::jsonb then return false; end if;
 end loop;
 return true;
end $$;

create function internal_financial_correction.live_consent(p_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from internal_financial_correction.items i
 join internal_financial_correction.operations o on o.id=i.operation_id
 join public.contas_receber r on r.id=i.receivable_id
 join internal_academic.technical_manual_receivable_issuance_authorizations a on a.receivable_id=r.id
 where i.receivable_id=p_id and i.kind='RESET_C1' and i.state='FINALIZED'
 and o.state='FINALIZED' and o.execution_enabled and i.consent_at is not null
 and i.consent_actor_id is not null and i.consent_request_id is not null
 and internal_financial_correction.actor_allowed(i.consent_actor_id,i.polo_id)
 and a.request_id=i.consent_request_id and a.authorized_by=i.consent_actor_id
 and a.receivable_fingerprint=internal_academic.technical_manual_receivable_issuance_fingerprint(r)
 and internal_financial_correction.corrected_receivable_valid(r)
 and not exists(select 1 from internal_financial_correction.items source
 join public.payment_gateway_transactions tx on tx.id=source.transaction_id
 where source.operation_id=o.id and source.kind<>'LOCAL_WAIVER' and tx.remote_status is distinct from 'CANCELED')
 and not exists(select 1 from internal_financial_correction.items source join public.contas_receber old_c2 on old_c2.id=source.receivable_id
 where source.operation_id=o.id and source.kind='CANCEL_C2' and internal_financial_correction.has_payment_evidence(old_c2))
 and (not internal_financial_correction.has_payment_evidence(r) or internal_academic.technical_manual_banese_receivable_paid_issued(r))); 
$$;

create function internal_financial_correction.guard_bounded_receivable()
returns trigger language plpgsql security definer set search_path='' as $$
declare i internal_financial_correction.items%rowtype; active_claim boolean;
begin
 select * into i from internal_financial_correction.items where receivable_id=old.id;
 if not found then if tg_op='DELETE' then return old; else return new; end if; end if;
 if tg_op='DELETE' then raise exception 'BOUNDED_HISTORY_IMMUTABLE'; end if;
 if internal_financial_correction.finalizing(old.id) then return new; end if;
 -- Never suppress real incoming payment evidence. Other guards still validate it;
 -- it blocks finalization/consent and cannot authorize a new bank identity.
 active_claim := (new.gateway_creation_token is not null and new.gateway_creation_token is distinct from old.gateway_creation_token)
 or (new.gateway_cnab_file_id is not null and new.gateway_cnab_file_id is distinct from old.gateway_cnab_file_id)
 or (new.gateway_submission_channel is not null and new.gateway_submission_channel is distinct from old.gateway_submission_channel)
 or (new.gateway_submission_status in ('API_AMBIGUOUS','API_REGISTERED','CNAB_GENERATED','CNAB_SENT','CNAB_REGISTERED')
 and new.gateway_submission_status is distinct from old.gateway_submission_status);
 if active_claim and (i.kind<>'RESET_C1' or not internal_financial_correction.live_consent(old.id)
   or (new.gateway_creation_token is not null and new.gateway_creation_token is distinct from i.consent_request_id))
 then raise exception 'BOUNDED_EXPLICIT_CONSENT_REQUIRED' using errcode='42501'; end if;
 if i.kind='CANCEL_C2' and i.state='FINALIZED' and not internal_financial_correction.has_payment_evidence(new)
 and (new.status is distinct from 'CANCELADO' or new.gateway_status is distinct from 'CANCELED')
 then raise exception 'BOUNDED_C2_HISTORY_CANNOT_REOPEN'; end if;
 if i.kind='RESET_C1' and i.state='FINALIZED'
 and not internal_financial_correction.corrected_receivable_valid(new)
 then raise exception 'BOUNDED_CORRECTED_IDENTITY_IMMUTABLE'; end if;
 return new;
end $$;
create trigger a00_bounded_correction_receivable before update or delete on public.contas_receber
for each row execute function internal_financial_correction.guard_bounded_receivable();

create function internal_financial_correction.guard_bounded_authorization()
returns trigger language plpgsql security definer set search_path='' as $$
declare i internal_financial_correction.items%rowtype;
begin
 select * into i from internal_financial_correction.items where receivable_id=coalesce(new.receivable_id,old.receivable_id);
 if not found then if tg_op='DELETE' then return old; else return new; end if; end if;
 if tg_op='DELETE' then raise exception 'BOUNDED_AUTH_HISTORY_REQUIRED'; end if;
 if i.kind<>'RESET_C1' or i.state<>'FINALIZED' or i.consent_request_id is null
 or new.request_id is distinct from i.consent_request_id or new.authorized_by is distinct from i.consent_actor_id
 or new.receivable_fingerprint is distinct from i.consent_fingerprint
 then raise exception 'BOUNDED_AUTH_REQUIRES_NEW_CONSENT' using errcode='42501'; end if;
 return new;
end $$;
create trigger a00_bounded_correction_authorization before insert or update or delete
on internal_academic.technical_manual_receivable_issuance_authorizations
for each row execute function internal_financial_correction.guard_bounded_authorization();
revoke all on all functions in schema internal_financial_correction from public,anon,authenticated,service_role;
commit;
