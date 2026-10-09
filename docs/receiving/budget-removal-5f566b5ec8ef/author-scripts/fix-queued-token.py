from pathlib import Path
import shutil
r=Path('D:/HAMON/household-budget-removal-5f566b5ec8ef');s=r/'source';e=r/'evidence/queued-token-before';e.mkdir(exist_ok=False)
p=s/'src/budget-removal.ts';shutil.copy2(p,e/p.name)
t=p.read_text();needle='  return store.update(data => {\n'
assert t.count(needle)==1;t=t.replace(needle,'  const reviewedToken = args.reviewToken; // detach before waiting on the Store queue\n'+needle)
assert t.count('preview.reviewToken === args.reviewToken')==1
t=t.replace('preview.reviewToken === args.reviewToken','preview.reviewToken === reviewedToken')
p.write_text(t,newline='\n')
p=s/'test/budget-removal.test.ts';t=p.read_text();t+='''
test("a caller cannot replace the reviewed token while commit waits behind another update",async t=>{
  const {store,path}=await fixture(t);const original=await previewBudgetRemoval(store,selector);
  const nextData=data();nextData.budgets[0].limitMinor=99;
  const future=await fixture(t,nextData);const fresh=await previewBudgetRemoval(future.store,selector);
  let release!:()=>void;let entered!:()=>void;
  const held=new Promise<void>(resolve=>{release=resolve;});
  const started=new Promise<void>(resolve=>{entered=resolve;});
  const update=store.update(async d=>{d.budgets[0].limitMinor=99;entered();await held;});
  await started;
  const mutableArgs=args(original.reviewToken);
  const queued=commitBudgetRemoval(new LedgerStore(path),mutableArgs);
  const refused=assert.rejects(queued,/changed/);
  mutableArgs.reviewToken=fresh.reviewToken;
  release();await update;await refused;
  assert.deepEqual(await store.load(),nextData);
});
'''
p.write_text(t,newline='\n')
print('Preserved84b and captured validated reviewedToken before Store queue. One meaningful async input-lifetime regression added.')
