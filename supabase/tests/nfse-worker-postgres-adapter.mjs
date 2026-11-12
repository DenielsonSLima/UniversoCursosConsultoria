// Runs the same structural SQL fixtures against a disposable PostgreSQL CI database.
import {pathToFileURL} from 'node:url';
const module=await import(pathToFileURL(process.env.NFSE_PG_MODULE).href);
const {Client}=module.default??module;
export class PGlite {
 constructor(){
  const url=new URL(process.env.NFSE_TEST_DATABASE_URL);
  if(!['localhost','127.0.0.1'].includes(url.hostname)||url.pathname!=='/nfse_worker_test')throw Error('Disposable local test database required');
  this.client=new Client({connectionString:url.href});this.ready=this.client.connect();
 }
 async exec(sql){await this.ready;return this.client.query(sql);}
 async query(sql,args){await this.ready;return this.client.query(sql,args);}
 async close(){await this.ready;await this.client.end();}
}
