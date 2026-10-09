# Household expense-plan preview

Create a local HTML comparison of a recorded household ledger and a proposed expense plan. The command reads the two JSON inputs and creates a new report; it does not record the planned expenses or change either input.

## Run the included fictional example

Use an existing Node.js 20 or newer installation. Extract the ZIP, open a terminal inside the `household-expense-plan` folder, and run:

```sh
node dist/src/household-plan.js --ledger examples/fictional-ledger.json --plan examples/fictional-plan.json --month 2026-10 --currency USD --out expense-preview.html
```

Open `expense-preview.html` in a browser. No package installation, MCP server or network connection is required for this command. The original package metadata is included for module loading; use the direct command above.

The included ledger and plan are entirely fictional, unchanged examples from an accepted receiving case. That captured example adds 6,600 USD minor units: recorded expenses of 20,000 become 26,600, and the monthly net changes from 182,000 to 175,400. The report retains all five planned occurrences and shows the grocery-budget crossing.

The command refuses to replace an existing output. Choose a new report filename for another preview. An output that is the ledger, plan or an existing alias of either input is also refused.

## Use your own saved inputs

Supply paths to your saved ledger JSON and a separate expense-plan JSON, the selected month, currency and a new report path. Keep the two source files separate. The complete input format and limits are in [docs/EXPENSE_PLAN.md](docs/EXPENSE_PLAN.md); the fictional plan is a small editable example.

All amounts are integer minor units in the selected currency. No currency conversion is performed. The monthly net is income minus expenses, not an account balance. Repeated plan rows count separately; a missing budget is different from a zero limit. The report is a calculation from the captured inputs, not a prediction.

## Provenance and qualification

This bundle contains the exact three JavaScript modules emitted by the accepted Linux build, the original package.json, the original guide and the original fictional input bytes. No compiled file was regenerated for delivery. Product tree: `4da046012fb5b0007005204d624dc8b495e79c1c`, based on PR8 commit `591ab6f5a2d65bf596aeb707dbb635ee981ec926`.

The captured runtime qualification used Node.js 22.22.1 on Linux. Node.js 20+ is the project's stated requirement; it is not a claim that this package was rerun on every supported version. Windows receiving remains prepared and unrun. Delivery verification checks source hashes, the complete static import closure and ZIP byte roundtrip; it does not add a new application or browser qualification.

`SHA256SUMS` covers every other file in this folder. `PROVENANCE.json` records the exact source and fixture identities.

The repository's original MIT license and copyright notice are included in `LICENSE`.

## Download integrity

Archive: [household-expense-plan-node.zip](household-expense-plan-node.zip)

SHA-256: `e7504692186ab1e7643a015b2add924761c8ca0616690fa02c936dcde4140a98`

The archive has eleven regular files under one household-expense-plan folder. CHECKSUMS.json records archive and member identities. This delivery is separate from the frozen Household35 and Windows receiving capsules.
