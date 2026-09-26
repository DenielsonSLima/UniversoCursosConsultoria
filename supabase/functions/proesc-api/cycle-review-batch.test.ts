import { reviewProescClassCycles, runProescCycleReviewWorker } from './cycle-review-batch.ts';

function assert(value: unknown, message = 'Assertion failed'): asserts value { if (!value) throw new Error(message); }
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const groups = [
  { representativeId:id(1),matriculaIds:Array.from({length:24},(_,n)=>id(n+1)),firstYear:2024,lastYear:2026 },
  { representativeId:id(25),matriculaIds:Array.from({length:25},(_,n)=>id(n+25)),firstYear:2025,lastYear:2027 },
];

function fakeAdmin(failRecord=false) {
  const calls: Array<{name:string;args:Record<string,unknown>}> = [];
  let completed = 0;
  return { calls, rpc: async (name:string,args:Record<string,unknown>) => {
    calls.push({name,args});
    const payload=args.p_payload as Record<string,unknown>;
    if(name==='proesc_cycle_review_runtime_service') return {data:args.p_action==='claim'
      ? {claimed:true,leaseId:id(90)} : {finished:true},error:null};
    if(name==='proesc_cycle_review_batch_service') {
      if(args.p_action==='targets') return {data:{groups},error:null};
      if(failRecord) return {data:null,error:{code:'42501'}};
      const size=(payload.matriculaIds as string[]).length;
      assert(size<=20);
      return {data:{success:true,reviewed:size,failed:0,c1:size,full:0,unknown:0,protected:0,eligible:size},error:null};
    }
    if (name === 'proesc_cycle_review_pages_service') return { data: args.p_action === 'read'
      ? { version: 1, unitId: '1', tokenRevision: 'revision', pages: [] }
      : { saved: true, reused: false, hash: 'a'.repeat(64) }, error: null };
    if(name==='proesc_workspace_service') return {data:{token:'a'.repeat(32),revision:'revision'},error:null};
    assert(name==='proesc_cycle_review_cache_service','Unexpected financial operation');
    if(args.p_action==='begin') {
      const group=groups.find(g=>g.representativeId===args.p_matricula_id)!;
      return {data:{cacheId:id(100+group.firstYear),lease:id(80),cached:false,tokenRevision:'revision',
        context:{unitId:'1',firstYear:group.firstYear,lastYear:group.lastYear,classIds:['2']}},error:null};
    }
    if(args.p_action==='complete') {
      completed++; assert(typeof payload.sourceObservedAt==='string');
    }
    return {data:{complete:true,completed},error:null};
  }};
}

Deno.test('automatic class batch shares overlapping source pages and records20 at a time', async()=>{
  const admin=fakeAdmin();let requests=0;
  const result=await reviewProescClassCycles(admin,'actor',id(500),async()=>{
    requests++;return Response.json({status:'success',data:[]});
  });
  assert(result.success&&result.reviewed===49&&result.eligible===49);
  assert(requests===48&&result.sourceRequests===48,'Overlapping years must not be fetched twice');
  assert(admin.calls.filter(x=>x.name==='proesc_cycle_review_batch_service'&&x.args.p_action==='record').length===4);
  assert(!admin.calls.some(x=>x.name.includes('emitir')||x.name.includes('gerar')));
});

Deno.test('partial batch keeps completed reviews explicit and never reports all reviewed', async()=>{
  const admin=fakeAdmin(true);
  const result=await reviewProescClassCycles(admin,'actor',id(500),async()=>Response.json({status:'success',data:[]}));
  assert(!result.success&&result.reviewed===0&&result.failed===49&&result.eligible===0);
});

Deno.test('existing worker lease runs the real batch and records durable completion', async()=>{
  const admin=fakeAdmin();
  const result=await runProescCycleReviewWorker(admin,'actor',async()=>Response.json({status:'success',data:[]}));
  assert(result.claimed&&'success' in result&&result.success===true);
  const finish=admin.calls.find(x=>x.name==='proesc_cycle_review_runtime_service'&&x.args.p_action==='finish');
  assert(finish&&(finish.args.p_payload as Record<string,unknown>).success===true);
  assert(admin.calls.find(x=>x.args.p_action==='targets')?.args.p_turma_id===null);
});

Deno.test('worker not due does not access API, credentials or enrollments', async()=>{
  let calls=0;
  const result=await runProescCycleReviewWorker({rpc:async(name)=>{
    calls++;assert(name==='proesc_cycle_review_runtime_service');return{data:{claimed:false},error:null};
  }},'actor',()=>{throw new Error('Unexpected request');});
  assert(!result.claimed&&calls===1);
});
