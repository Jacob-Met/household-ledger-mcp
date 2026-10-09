from pathlib import Path
import shutil
r=Path('D:/HAMON/household-budget-removal-5f566b5ec8ef');s=r/'source';p=s/'src/budget-removal.ts'
shutil.copy2(p,r/'evidence/nonfinite-before/budget-removal.ts')
t=p.read_text();needle='function previewIn(data: LedgerData, selector: BudgetSelector): BudgetRemovalPreview {\n'
assert t.count(needle)==1
guard='''/** The existing reader admits 1e400 in unknown fields; JSON.stringify would
 * change that parsed Infinity to null. Refuse before any reviewed removal. */
function requireFiniteJsonNumbers(data: LedgerData): void {
  const pending: unknown[] = [data];
  while (pending.length) {
    const value = pending.pop();
    if (typeof value === "number") {
      requireValue(Number.isFinite(value), "ledger has a non-finite JSON number; removal would alter an unrelated value");
    } else if (value !== null && typeof value === "object") {
      for (const child of Object.values(value)) pending.push(child);
    }
  }
}
'''
t=t.replace(needle,guard+needle+'  requireFiniteJsonNumbers(data);\n')
p.write_text(t,newline='\n')
p=s/'test/budget-removal.test.ts';t=p.read_text();t+='''

test("non-finite numbers in any current unknown field refuse before JSON normalization",async t=>{
  for(const place of ["root","transaction","other-budget"]){
    const {path,store}=await fixture(t);
    const p=await previewBudgetRemoval(store,selector);
    const d=data() as unknown as Record<string,unknown>;
    const target=place==="root"?d:place==="transaction"?(d.transactions as Array<Record<string,unknown>>)[0]:(d.budgets as Array<Record<string,unknown>>)[2];
    target.overflow="NONFINITE_MARKER";
    const raw=JSON.stringify(d).replace('"NONFINITE_MARKER"',"1e400");
    await writeFile(path,raw);
    await assert.rejects(previewBudgetRemoval(store,selector),/non-finite/);
    await assert.rejects(commitBudgetRemoval(store,args(p.reviewToken)),/non-finite/);
    assert.equal(await readFile(path,"utf8"),raw);
  }
});
'''
p.write_text(t,newline='\n')
print('Preserved original core; finite-value refusal added before preview and fresh commit. One new three-location regression.')
