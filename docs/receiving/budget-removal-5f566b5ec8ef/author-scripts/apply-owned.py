from pathlib import Path
import json
r=Path('D:/HAMON/household-budget-removal-5f566b5ec8ef');s=r/'source';p=s/'src/index.ts';t=p.read_text()
needle='import { commitTransactionImport, previewTransactionImport, TRANSACTION_IMPORT_TOOL_DEFS } from "./transaction-import.js";'
assert t.count(needle)==1
t=t.replace(needle,needle+'\nimport { commitBudgetRemoval, previewBudgetRemoval, BUDGET_REMOVAL_TOOL_DEFS } from "./budget-removal.js";')
t=t.replace('  ...TRANSACTION_IMPORT_TOOL_DEFS,','  ...TRANSACTION_IMPORT_TOOL_DEFS,\n  ...BUDGET_REMOVAL_TOOL_DEFS,')
needle='      switch (request.params.name) {\n'
assert t.count(needle)==1
t=t.replace(needle,needle+'''        case "preview_budget_removal": {
          const result = await previewBudgetRemoval(store, args);
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }
        case "commit_budget_removal": {
          const result = await commitBudgetRemoval(store, args);
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }
''')
p.write_text(t,newline='\n')
for name in ['mcp.test.ts','transaction-import-http.test.ts']:
 p=s/'test'/name;t=p.read_text();needle='["cashflow_trend", "commit_transaction_import", "get_budgets", "list_transactions", "monthly_summary", "preview_transaction_import", "record_transaction", "set_budget"]'
 assert t.count(needle)==1
 t=t.replace(needle,'["cashflow_trend", "commit_budget_removal", "commit_transaction_import", "get_budgets", "list_transactions", "monthly_summary", "preview_budget_removal", "preview_transaction_import", "record_transaction", "set_budget"]')
 t=t.replace('exposes the eight ledger tools','exposes the ten ledger tools')
 p.write_text(t,newline='\n')
print('Applied only additive tool dispatch/definition/import and two complete roster assertions.')
