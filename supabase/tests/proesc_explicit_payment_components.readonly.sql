-- Read-only assertions after the migration. No receipt or snapshot is modified.
do $components$
declare
  v_lines jsonb := '[
    {"blockCode":"3","amountCents":9,"paymentDate":"2026-09-12","cancelled":false,"renegotiation":false},
    {"blockCode":"4","amountCents":559,"paymentDate":"2026-09-12","cancelled":false,"renegotiation":false},
    {"blockCode":"7","amountCents":250,"paymentDate":"2026-09-12","cancelled":false,"renegotiation":false}
  ]';
  v_row jsonb;
  v_receipt public.contas_receber%rowtype;
  v_result record;
  v_function regprocedure := 'internal_proesc.explicit_payment_component(jsonb,text,date)'::regprocedure;
  v_discount_line jsonb := '[{"blockCode":"10482","amountCents":1990,"paymentDate":"2026-09-12","cancelled":false,"renegotiation":false}]';
  v_calculated record;
begin
  assert not has_function_privilege('anon',v_function,'EXECUTE'), 'Anonymous component access';
  assert not has_function_privilege('authenticated',v_function,'EXECUTE'), 'Public component access';
  assert not has_function_privilege('service_role',v_function,'EXECUTE'), 'Helper exposed directly';
  assert not has_function_privilege('anon','internal_proesc.explicit_discount_component(jsonb,text,date)','EXECUTE');
  assert not has_function_privilege('authenticated','internal_proesc.explicit_discount_component(jsonb,text,date)','EXECUTE');
  assert not has_function_privilege('service_role','internal_proesc.explicit_discount_component(jsonb,text,date)','EXECUTE');
  assert not has_function_privilege('authenticated','internal_proesc.calculate_confirmed_payment_rule(numeric,date,date)','EXECUTE');
  select * into strict v_calculated from internal_proesc.calculate_confirmed_payment_rule(279.9,'2026-08-01','2026-08-31');
  assert v_calculated.juros=5.60 and v_calculated.multa=5.60 and v_calculated.desconto=0;
  assert 279.90+v_calculated.juros+v_calculated.multa-v_calculated.desconto=291.10,
    'Monthly 2% and one-time 2% diverge from the confirmed 30-day example';
  select * into strict v_calculated from internal_proesc.calculate_confirmed_payment_rule(279.9,'2026-08-01','2026-08-02');
  assert v_calculated.juros=0.19 and v_calculated.multa=5.60;
  select * into strict v_calculated from internal_proesc.calculate_confirmed_payment_rule(279.9,'2026-08-01','2026-08-01');
  assert v_calculated.juros=0 and v_calculated.multa=0 and v_calculated.desconto=19.90;
  select * into strict v_calculated from internal_proesc.calculate_confirmed_payment_rule(100,'2026-08-01','2026-07-31');
  assert v_calculated.desconto=0 and v_calculated.juros=0 and v_calculated.multa=0;
  select * into strict v_calculated from internal_proesc.calculate_confirmed_payment_rule(200,'2026-08-01','2026-08-31');
  assert v_calculated.desconto=0 and v_calculated.juros=4 and v_calculated.multa=4;
  assert not exists(select 1 from internal_proesc.calculate_confirmed_payment_rule(229.90,'2026-08-01','2026-08-31'));
  assert not exists(select 1 from internal_proesc.calculate_confirmed_payment_rule(279.90,null,'2026-08-31'));
  assert internal_proesc.explicit_discount_component(v_discount_line,'3145','2026-09-12')=1990;
  assert internal_proesc.explicit_discount_component(v_discount_line,'9999','2026-09-12') is null,
    'Custom discount category leaked to another unit';
  assert internal_proesc.explicit_discount_component(v_discount_line,'3145','2026-09-11') is null;
  assert internal_proesc.explicit_discount_component(v_discount_line || v_discount_line,'3145','2026-09-12') is null;
  assert internal_proesc.explicit_discount_component('[]','3145','2026-09-12') is null;
  assert internal_proesc.explicit_payment_component(v_lines,'3','2026-09-12')=9;
  assert internal_proesc.explicit_payment_component(v_lines,'4','2026-09-12')=559;
  assert internal_proesc.explicit_payment_component(v_lines,'7','2026-09-12') is null,
    'Tariff incorrectly treated as a receipt component';
  assert internal_proesc.explicit_payment_component('[]','3','2026-09-12') is null;
  assert internal_proesc.explicit_payment_component(v_lines,'3','2026-09-11') is null;
  assert internal_proesc.explicit_payment_component(v_lines || (v_lines->0),'3','2026-09-12') is null;
  for v_row in select item from jsonb_array_elements('[
    {"blockCode":"3","amountCents":9,"paymentDate":"2026-09-12","cancelled":true,"renegotiation":false},
    {"blockCode":"3","amountCents":9,"paymentDate":"2026-09-12","cancelled":false,"renegotiation":true},
    {"blockCode":"3","amountCents":9,"paymentDate":"2026-09-12"},
    {"blockCode":"3","amountCents":"9","paymentDate":"2026-09-12","cancelled":false,"renegotiation":false},
    {"blockCode":"3","amountCents":-1,"paymentDate":"2026-09-12","cancelled":false,"renegotiation":false}
  ]') item loop
    assert internal_proesc.explicit_payment_component(jsonb_build_array(v_row),'3','2026-09-12') is null;
  end loop;
  for v_row in select item from jsonb_array_elements('[
    {"blockCode":"10482","amountCents":1990,"paymentDate":"2026-09-12","cancelled":true,"renegotiation":false},
    {"blockCode":"10482","amountCents":1990,"paymentDate":"2026-09-12","cancelled":false,"renegotiation":true},
    {"blockCode":"10482","amountCents":1990,"paymentDate":"2026-09-12"},
    {"blockCode":"10482","amountCents":"1990","paymentDate":"2026-09-12","cancelled":false,"renegotiation":false}
  ]') item loop
    assert internal_proesc.explicit_discount_component(jsonb_build_array(v_row),'3145','2026-09-12') is null;
  end loop;
  for v_receipt in select r.* from public.contas_receber r
    join internal_proesc.obligation_links link on link.receivable_id=r.id
    where r.status='PAGO' and r.origem_pagamento='SISTEMA_ANTERIOR'
      and r.gateway_provider is null and r.gateway_payment_id is null
      and r.manual_settlement_id is null
  loop
    select * into strict v_result from public.resolve_integrated_receivable_financial_composition(
      v_receipt.id,v_receipt.valor,v_receipt.valor_pago,v_receipt.data_vencimento,
      v_receipt.data_pagamento,null,null,null,null,null,null,null,null,null);
    assert v_result.valor_recebido=v_receipt.valor_pago, 'Received amount changed';
    assert v_result.valor_base+coalesce(v_result.juros,0)+coalesce(v_result.multa,0)
      +coalesce(v_result.acrescimo,0)-coalesce(v_result.desconto,0)
      +v_result.diferenca_nao_discriminada=v_receipt.valor_pago,
      'Partial components and residual do not reconcile';
  end loop;
end;
$components$;
