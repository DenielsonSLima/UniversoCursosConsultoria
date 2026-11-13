import {readFile} from 'node:fs/promises';
export const id=value=>`00000000-0000-0000-0000-${String(value).padStart(12,'0')}`;
export const scope={context:id(10),polo:id(1),environment:'PRODUCAO',month:'2026-11'};
export const definition={partnerId:id(20),modelId:id(30),modelVersion:1,serviceDate:'2026-11-12',
  serviceDescription:'Palestra contratada',amount:'120.00',generateReceivable:true,
  existingReceivableId:null,dueDate:'2026-11-30',categoryId:id(40)};
export const migrationNames=[
  '20261112221000_nfse_service_receivable_store.sql',
  '20261112221050_nfse_service_financial_calculator.sql',
  '20261112221100_nfse_service_financial_plan_save.sql',
  '20261112221200_nfse_service_receivable_authorization.sql',
  '20261112221300_nfse_service_receivable_reads.sql',
  '20261112221400_nfse_service_financial_routes.sql',
];
const read=name=>readFile(new URL(name,import.meta.url),'utf8');
const migration=name=>read(`../migrations/${name}`);
export async function prepareServiceReceivables(db){
  await db.exec(await read('nfse_partner_services.fixture.sql'));
  await db.exec(await read('nfse_service_receivables.fixture.sql'));
  await db.exec(await migration('20261108225453_nfse_models_private_store.sql'));
  await db.exec(await migration('20261108234843_nfse_partner_services_store.sql'));
  await db.exec(await migration('20261112203000_nfse_model_period_contract.sql'));
  await db.exec(await migration('20261112203003_nfse_service_period_prepare.sql'));
  await db.exec(await migration('20261014010500_other_credit_plans_schedule.sql'));
  await db.exec(`CREATE FUNCTION internal_finance.authorize_other_credit_plan(uuid,boolean DEFAULT true)
    RETURNS void LANGUAGE plpgsql AS $$BEGIN
      IF NOT public.gestor_has_effective_financeiro_tab('outros-creditos') THEN
        RAISE EXCEPTION 'denied' USING ERRCODE='42501'; END IF; END$$;
    INSERT INTO public.polos(id,status,nome) VALUES('${id(1)}','ativo','Polo teste'),('${id(2)}','ativo','Outro polo');
    INSERT INTO public.test_context VALUES('${id(10)}','${id(11)}',true,false,ARRAY['${id(1)}'::uuid]);
    INSERT INTO public.parceiros(id,nome,cpf_cnpj,tipo,status,polo_id,polo_ids)
      VALUES('${id(20)}','Parceiro teste','12345678901','PF','ativo','${id(1)}','{}');
    INSERT INTO public.categorias_financeiras VALUES('${id(40)}','Categoria teste','OUTRO_CREDITO','ativo');
    INSERT INTO private.nfse_models(id,polo_id,environment,definition,created_by,updated_by)
      VALUES('${id(30)}','${id(1)}','PRODUCAO','{"name":"Palestras","active":true,"modelType":"SERVICO","serviceDescription":"Palestra contratada"}','${id(11)}','${id(11)}');
    SET test.actor='${id(11)}'; SET test.polo='${id(1)}'; SET test.finance='true'; SET test.receber='true';
    INSERT INTO public.contas_receber(id,polo_id,cliente_id,descricao,valor,data_vencimento,status,categoria,valor_pago)
      VALUES('${id(200)}','${id(1)}','${id(20)}','Histórico pago',50,'2026-11-01','PAGO','OUTROS_CREDITOS',50);
    INSERT INTO private.nfse_partner_services(id,polo_id,environment,partner_id,model_id,service_date,
      service_description,amount,partner_snapshot,model_snapshot,receivable_id,receivable_action,created_by)
    VALUES('${id(100)}','${id(1)}','PRODUCAO','${id(20)}','${id(30)}','2026-11-01','Histórico pago',50,
      '{}','{}','${id(200)}','LINKED','${id(11)}'),
      ('${id(101)}','${id(1)}','PRODUCAO','${id(20)}','${id(30)}','2026-11-01','Histórico sem dívida',60,
      '{}','{}',null,'NONE','${id(11)}'),
      ('${id(102)}','${id(1)}','PRODUCAO','${id(20)}','${id(30)}','2026-11-02','Rascunho legado',70,
      '{}','{}',null,'NONE','${id(11)}');
    INSERT INTO private.nfse_individual_operations(id,polo_id,environment,state,snapshot,result)
      VALUES('${id(300)}','${id(1)}','PRODUCAO','AUTHORIZED','{"source":{"kind":"PARTNER_SERVICE","id":"${id(100)}"}}','{"number":"1"}'),
      ('${id(301)}','${id(1)}','PRODUCAO','AUTHORIZED','{"source":{"kind":"PARTNER_SERVICE","id":"${id(101)}"}}','{"number":"2"}');
    INSERT INTO private.nfse_queue_operation_links VALUES('PARTNER_SERVICE','${id(100)}','${id(300)}'),
      ('PARTNER_SERVICE','${id(101)}','${id(301)}');`);
  for(const name of migrationNames) await db.exec(await migration(name));
}
