begin;

-- Source identity is independent of the settlement channel. Imported history
-- without an exact Proesc link is never promoted to Proesc by its origin label.
create function internal_proesc.reconciliation_source_system(p_row public.contas_receber)
returns text language sql stable security definer set search_path='' as $$
  select case
    when p_row.origem_pagamento='SISTEMA_ANTERIOR'
      and p_row.gateway_provider is null and p_row.gateway_payment_id is null
      and p_row.gateway_creation_token is null and p_row.asaas_payment_id is null
      and p_row.gateway_submission_status is null and p_row.gateway_submission_channel is null
      and p_row.nosso_numero_asaas is null and p_row.manual_settlement_id is null
      and p_row.gateway_boleto_nosso_numero is null and p_row.gateway_boleto_linha_digitavel is null
      and p_row.gateway_boleto_codigo_barras is null and p_row.gateway_pix_payload is null
      and p_row.gateway_pix_encoded_image is null
      and exists (
        select 1 from internal_proesc.obligation_links l
        join internal_proesc.class_scopes s on s.turma_id=l.turma_id
          and s.source_unit_id=l.source_unit_id and s.source_class_id=l.source_class_id
          and s.phase='CONFIRMED'
        where l.receivable_id=p_row.id and l.matricula_id=p_row.matricula_id
          and l.turma_id=p_row.turma_id and s.polo_id=p_row.polo_id
          and exists(select 1 from public.matriculas m join public.turmas t on t.id=m.turma_id
            where m.id=p_row.matricula_id and m.aluno_id=p_row.cliente_id
              and t.id=p_row.turma_id and t.polo_id=p_row.polo_id)
      ) then 'PROESC'
    when lower(coalesce(p_row.gateway_provider,'')) in ('banese','banese_card')
      or upper(coalesce(p_row.origem_pagamento,''))='BANESE'
      or exists (
        select 1 from public.payment_gateway_cnab_records r
        where r.receivable_id=p_row.id and r.provider_code in ('banese','banese_card')
          and r.status in ('RECORDED','ACTIVATION_PENDING','ACTIVATED')
      ) then 'BANESE'
    else 'OTHER' end;
$$;

-- Hydrates only the selected page. Monetary components use the existing
-- canonical resolver; pending obligations never manufacture paid components.
create function internal_proesc.reconciliation_item(p_id uuid,p_source text,p_origin text)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'id',c.id,'status',case when p_source='PROESC' and c.status='VENCIDO'
      and (coalesce(evidence.verification,'REVIEW')<>'VERIFIED' or coalesce(evidence.source_status,'UNKNOWN')<>'OPEN')
      then 'PENDENTE' else c.status end,'source_system',p_source,
    'source_label',case p_source when 'PROESC' then 'Proesc' when 'BANESE' then 'Banese' else 'Outra origem' end,
    'source_verification',case when p_source='PROESC' then coalesce(evidence.verification,'REVIEW') end,
    'status_label',case when c.status='PAGO' then 'Pago'
      when c.status='CANCELADO' then 'Cancelado' when c.status='SUSPENSO' then 'Suspenso'
      when p_source='PROESC' and (coalesce(evidence.verification,'REVIEW')<>'VERIFIED'
        or coalesce(evidence.source_status,'UNKNOWN')<>'OPEN') then 'Pendente de conferência'
      when c.status='VENCIDO' then 'Vencido' when c.status='CANCELADO' then 'Cancelado'
      else 'Pendente' end,
    'proesc_evidence',case when p_source='PROESC' then jsonb_build_object(
      'sourceStatus',coalesce(evidence.source_status,'UNKNOWN'),
      'verification',coalesce(evidence.verification,'REVIEW'),'observedAt',evidence.observed_at,
      'obligationLabel',coalesce(evidence.obligation_label,'Obrigação Proesc')) end,
    'empresa_id',p.company_id,'empresa_nome',coalesce(nullif(btrim(company.nome_fantasia),''),
      nullif(btrim(company.razao_social),''),'Empresa não informada'),
    'polo_id',c.polo_id,'polo_nome',coalesce(nullif(btrim(p.nome),''),'Polo não informado'),
    'cliente_nome',coalesce(nullif(btrim(payer.nome),''),'Pagador não identificado'),
    'cliente_cpf_cnpj',case length(regexp_replace(coalesce(payer.cpf_cnpj,''),'[^0-9]','','g'))
      when 11 then '***.***.***-'||right(regexp_replace(payer.cpf_cnpj,'[^0-9]','','g'),2)
      when 14 then '**.***.***/****-'||right(regexp_replace(payer.cpf_cnpj,'[^0-9]','','g'),2)
      else case when nullif(regexp_replace(coalesce(payer.cpf_cnpj,''),'[^0-9]','','g'),'') is not null
        then '***'||right(regexp_replace(payer.cpf_cnpj,'[^0-9]','','g'),2) end end,
    'descricao',coalesce(nullif(btrim(c.descricao),''),'Cobrança'),'curso_nome',course.nome,
    'turma_nome',nullif(btrim(concat_ws(' · ',t.codigo,t.nome)),''),
    'matricula_codigo',coalesce(nullif(btrim(student.matricula_acesso),''),nullif(btrim(payer.matricula_acesso),'')),
    'parcela_label',case when p_source='PROESC' then coalesce(evidence.obligation_label,'Obrigação Proesc')
      when c.parcela_numero is not null then concat('Parcela ',c.parcela_numero,
        case when coalesce(c.gateway_installments,0)>1 then '/'||c.gateway_installments
          when coalesce(t.qtd_parcelas,0)>0 then '/'||t.qtd_parcelas else '' end)
      else coalesce(nullif(initcap(replace(c.tipo_lancamento,'_',' ')),''),'Cobrança') end,
    'data_vencimento',c.data_vencimento,'data_pagamento',c.data_pagamento,
    'valor_nominal',c.valor,'valor_pago',case when c.status='PAGO' then coalesce(composition.valor_recebido,c.valor_pago) else c.valor_pago end,
    'origem',p_origin,'nosso_numero',case when p_source='BANESE' then c.gateway_boleto_nosso_numero end,
    'gateway_provider',c.gateway_provider,'gateway_status',c.gateway_status,
    'gateway_synced_at',c.gateway_synced_at,'gateway_last_error',c.gateway_last_error,
    'baixa_registrada_em',case when c.status<>'PAGO' then null
      when p_origin='MANUAL' then manual.completed_at
      when p_origin in ('PROESC','HISTORICO_MIGRADO') then null else c.gateway_settlement_recorded_at end,
    'baixa_tempo_proveniencia',case when c.status<>'PAGO' then null
      when p_origin in ('PROESC','HISTORICO_MIGRADO') then 'HISTORICO_SEM_HORA'
      when p_origin='MANUAL' and manual.completed_at is not null then 'MANUAL_CONCLUSAO'
      when c.gateway_settlement_recorded_at is not null then 'SISTEMA_REGISTRO' else 'FINANCEIRO_SEM_HORA' end,
    'operador_nome',case p_origin when 'PROESC' then 'Proesc' when 'HISTORICO_MIGRADO' then 'Histórico migrado'
      when 'MANUAL' then coalesce(nullif(btrim(actor.nome),''),'Operador não identificado') else 'Sistema' end,
    'forma_pagamento',coalesce(nullif(btrim(manual.payment_method),''),
      case when upper(btrim(coalesce(c.gateway_settlement_channel,''))) not in ('','NAO_IDENTIFICADO','NÃO IDENTIFICADO','UNKNOWN')
        then c.gateway_settlement_channel end,
      nullif(btrim(c.gateway_payment_method),''),nullif(btrim(c.forma_pagamento),''),'Não informada'),
    'conta_recebedora_nome',case when account.id is null then 'Conta não informada'
      else coalesce(nullif(concat_ws(' · ',nullif(btrim(account.banco),''),
        case when nullif(btrim(account.agencia),'') is not null then 'Ag. '||btrim(account.agencia) end,
        case when nullif(btrim(account.conta),'') is not null then 'Conta '||btrim(account.conta) end),''),'Conta não informada') end,
    'comprovante_url',case when c.status='PAGO' and (p_origin in ('AUTOMATICA_BANESE','CNAB240')
      or (p_origin='OUTRO' and (upper(coalesce(c.gateway_provider,'')) like '%MERCADO%PAGO%'
        or upper(coalesce(c.origem_pagamento,''))='MERCADO_PAGO')))
      then coalesce(nullif(btrim(c.gateway_transaction_receipt_url),''),nullif(btrim(c.asaas_transaction_receipt_url),'')) end
  ) || jsonb_build_object(
    'juros_aplicados',case when c.status='PAGO' and detail.disclose then composition.juros end,
    'multa_aplicada',case when c.status='PAGO' and detail.disclose then composition.multa end,
    'acrescimo_aplicado',case when c.status='PAGO' and detail.disclose then composition.acrescimo end,
    'desconto_aplicado',case when c.status='PAGO' and detail.disclose then composition.desconto end,
    'diferenca_nao_discriminada',case when c.status<>'PAGO' then null
      when not detail.disclose then c.valor_pago-c.valor else composition.diferenca_nao_discriminada end,
    'composicao_status',case when c.status<>'PAGO' then 'SEM_PAGAMENTO_CONFIRMADO'
      when not detail.disclose then 'HISTORICO_SEM_COMPOSICAO'
      else coalesce(composition.composicao_status,'NAO_DISCRIMINADA_PELO_GATEWAY') end,
    'composicao_proveniencia',case when c.status<>'PAGO' then 'SEM_PAGAMENTO_CONFIRMADO'
      when composition.composicao_status='CONCILIADO_POR_CONFERENCIA_PROESC' then 'CONFERENCIA_PROESC'
      when p_origin in ('PROESC','HISTORICO_MIGRADO') then 'HISTORICO_SEM_DETALHAMENTO'
      when composition.composicao_status='COMPOSICAO_EXPLICITA' then 'BAIXA_MANUAL_EXPLICITA'
      when composition.composicao_status='SEM_DIFERENCA_FINANCEIRA' then 'VALOR_EXATO_SEM_AJUSTES'
      when composition.composicao_status='CONCILIADO_POR_FORMULA_BANESE' then 'FORMULA_CONTRATUAL_BANESE'
      else 'DIFERENCA_NAO_DISCRIMINADA' end
  )
  from public.contas_receber c
  join public.polos p on p.id=c.polo_id
  left join public.empresas company on company.id=p.company_id
  left join public.matriculas m on m.id=c.matricula_id
  left join public.parceiros student on student.id=m.aluno_id
  left join public.parceiros payer on payer.id=coalesce(c.cliente_id,student.id)
  left join public.turmas t on t.id=coalesce(c.turma_id,m.turma_id)
  left join public.cursos course on course.id=t.curso_id
  left join public.receivable_manual_settlements manual on manual.id=c.manual_settlement_id
    and manual.receivable_id=c.id and c.manual_settlement_reversed_at is null and manual.reversed_at is null
  left join public.usuarios_sistema actor on actor.id=manual.actor_id
  left join public.contas_bancarias account on account.id=coalesce(manual.account_id,c.conta_bancaria_id)
    and exists(select 1 from public.contas_bancarias_polos ap where ap.conta_bancaria_id=account.id and ap.polo_id=c.polo_id)
  left join lateral (
    select f.source_status,f.verification,f.observed_at,
      case i.obligation_kind when 'REENROLLMENT_FEE' then 'Rematrícula'
        when 'TUITION' then case when i.source_ordinal is not null then 'Parcela '||i.source_ordinal else 'Mensalidade' end
        else 'Obrigação Proesc' end obligation_label
    from internal_proesc.obligation_links l
    left join internal_proesc.obligation_imports i on i.link_id=l.id
    left join lateral(select f.source_status,f.verification,f.observed_at from internal_proesc.financial_snapshots f
      where f.link_id=l.id order by f.observed_at desc,f.recorded_at desc,f.id desc limit 1) f on true
    where l.receivable_id=c.id and p_source='PROESC' limit 1
  ) evidence on true
  left join lateral public.resolve_integrated_receivable_financial_composition(c.id,c.valor,c.valor_pago,
    c.data_vencimento,c.data_pagamento,c.gateway_financial_terms,c.manual_settlement_id,c.manual_settlement_reversed_at,
    c.manual_settlement_principal_cents,c.manual_settlement_interest_cents,c.manual_settlement_penalty_cents,
    c.manual_settlement_addition_cents,c.manual_settlement_discount_cents,c.manual_settlement_received_cents
  ) composition on c.status='PAGO' and (p_origin<>'HISTORICO_MIGRADO' or p_source='PROESC')
  cross join lateral(select p_origin not in ('PROESC','HISTORICO_MIGRADO')
    or coalesce(composition.composicao_status='CONCILIADO_POR_CONFERENCIA_PROESC',false) disclose) detail
  where c.id=p_id;
$$;

revoke all on function internal_proesc.reconciliation_source_system(public.contas_receber),
  internal_proesc.reconciliation_item(uuid,text,text) from public,anon,authenticated,service_role;
commit;
