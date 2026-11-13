import type { Admin } from "./contract.ts";
import { processServiceBolepix } from "./worker.ts";
import { processServiceCancellation } from "./cancellation.ts";
export async function processNextServiceBankJob(admin:Admin,supabaseUrl:string){
  const cancellation=await processServiceCancellation(admin);
  return cancellation.handled?cancellation:processServiceBolepix(admin,supabaseUrl);
}
