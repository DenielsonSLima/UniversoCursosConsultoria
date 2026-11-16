import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export const fixture = {
  actor:id(1),otherActor:id(2),polo:id(10),child:id(11),account:id(20),category:id(30),
  variableCategory:id(31),supplier:id(32),turma:id(33),
};
const read = path => readFileSync(new URL(path,import.meta.url),'utf8');
const routine = (file,name) => {
  const source=read(`../migrations/${file}`),start=source.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  if(start<0) throw new Error(`Routine ${name} absent in ${file}`);
  return source.slice(start,source.indexOf('$function$;',start)+11);
};

export async function createExpenseWorkspaceTestDatabase() {
  const { PGlite }=await import(process.env.PGLITE_MODULE_PATH
    ? pathToFileURL(resolve(process.env.PGLITE_MODULE_PATH)).href : '@electric-sql/pglite');
  const db=new PGlite();
  try {
    for(const file of ['other_credit_cancellation.fixture.sql','financial_payment.fixture.sql',
      'financial_payment_reads.fixture.sql','estimated_expense.fixture.sql']) await db.exec(read(file));
    await db.exec('DROP FUNCTION public.listar_despesas_economicas_secure(text,uuid,uuid,text,date,date,text,uuid)');
    await db.exec(routine('20260807035500_add_expense_rateio_reads_and_caixa_costs.sql','listar_despesas_economicas_secure'));
    await db.exec(read('expense_workspace.fixture.sql'));
    await db.query('insert into auth.users values($1),($2)',[fixture.actor,fixture.otherActor]);
    await db.query(`insert into public.polos(id,nome,company_id,is_matriz) values
      ($1,'Matriz sintética',$3,true),($2,'Polo sintético',$3,false)`,[fixture.polo,fixture.child,id(40)]);
    await db.query(`insert into public.usuarios_sistema(auth_user_id,perfil,status,permissoes,polo_ids)
      values($1,'financeiro','ativo',$3,ARRAY[$4::uuid,$5::uuid]),
        ($2,'financeiro','ativo',$3,ARRAY[$5::uuid])`,[fixture.actor,fixture.otherActor,
      JSON.stringify({modules:['financeiro'],tabs:{financeiro:['despesas','outros-debitos']}}),fixture.polo,fixture.child]);
    await db.query(`insert into public.categorias_financeiras values
      ($1,'Categoria fixa','DESPESA_FIXA','ativo'),($2,'Categoria variável','DESPESA_VARIAVEL','ativo')`,
    [fixture.category,fixture.variableCategory]);
    await db.query("insert into public.parceiros(id,nome,nome_fantasia,tipo) values($1,'Fornecedor sintético','Fantasia sintética','PJ')",[fixture.supplier]);
    await db.query("insert into public.turmas values($1,'Turma sintética')",[fixture.turma]);
    await db.query("insert into public.contas_bancarias(id,nome) values($1,'Caixa sintético')",[fixture.account]);
    await db.query('insert into public.contas_bancarias_polos values($1,$2)',[fixture.account,fixture.polo]);
    for(const [key,value] of Object.entries({uid:fixture.actor,role:'authenticated',identity:true,polo:fixture.polo,tab:true}))
      await db.query('select set_config($1,$2,false)',[`test.${key}`,String(value)]);
    for(const file of ['20261014183502_financial_payment_ledger.sql','20261014183505_financial_payment_preview.sql',
      '20261014183509_financial_payment_append.sql','20261014183512_financial_payment_source_guards.sql',
      '20261014183515_financial_payment_expense_reads.sql','20261014194245_financial_payment_automatic_single_amount.sql',
      '20261109021100_expense_explicit_payment_date.sql','20261109021200_expense_rateio_explicit_payment_date.sql',
      '20261109021300_expense_rateio_replay_payment_date.sql']) await db.exec(read(`../migrations/${file}`));
    await db.exec(routine('20260806224000_create_patrimonio_and_financial_loans.sql','financeiro_dividir_centavos'));
    const rateio=read('../migrations/20260807035000_create_expense_rateio_core.sql');
    await db.exec(rateio.slice(rateio.indexOf('CREATE OR REPLACE FUNCTION public.sincronizar_despesa_lancamento_rateios()'),
      rateio.indexOf('ALTER TABLE public.despesas_lancamentos_rateios REPLICA IDENTITY')));
    await db.exec(`create trigger despesas_calcular_ajustes_trigger before insert or update of
      valor_base,juros_valor,multa_valor,desconto_valor,status on public.despesas_lancamentos
      for each row execute function public.calcular_ajustes_despesa();`);
    await db.exec(routine('20260811123901_harden_expense_corrections_and_detail_reads.sql','cancelar_ou_estornar_despesa_secure'));
    for(const file of ['20261116031717_expense_estimate_metadata_and_guards.sql',
      '20261116031731_create_estimated_expenses.sql','20261116031733_confirm_estimated_expense_payment.sql',
      '20261116031736_read_estimated_expenses.sql','20261116031738_resolve_estimated_expense_without_charge.sql',
      '20261116031740_overdue_expenses_workspace.sql','20261116091311_expense_workspace.sql'])
      await db.exec(read(`../migrations/${file}`));
    return db;
  } catch(error) { await db.close(); throw error; }
}
