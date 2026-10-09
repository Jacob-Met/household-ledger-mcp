# Terminal budget reallocation

After building the accepted service with its existing `npm run build`, run:

```sh
node dist/src/household-reallocate.js --endpoint http://127.0.0.1:3000/mcp
```

Use an already running local service that includes the reviewed budget-reallocation tools. Both input and output must be interactive terminals. The command asks for a YYYY-MM month and explicit three-letter currency, reads all explicitly denominated budgets for that scope, and lists their exact minor-unit limits. Choose the source and destination by their displayed numbers, then enter a positive integer amount. The literal category strings are retained; names with spaces, newlines, terminal escapes or Unicode format characters are displayed as escaped JSON strings. The command does not trim them or infer a matching name.

The service then prepares a fresh preview. Review the complete month, currency, amount, both category names, both before/after limits, pair total, content token and endpoint. Type exactly REALLOCATE to send this unchanged preview once. Any other answer, EOF or Ctrl-C cancels. The initially listed limits may have changed; the final preview contains the actual values being reviewed. A changed pair between preview and commit is refused by the unchanged producer. Fresh unrelated changes remain intact.

For example, moving2500 minor units from a12000 allowance to a3300 allowance produces9500 and5800, retaining15300. These are integer minor units, interpreted using the selected currency convention; no decimal conversion is performed. This changes planned allowance only. It creates no budget, changes no transaction or recorded spending, and moves no money.

## Results and uncertain acknowledgement

Applied means the actual service reported persistence of the exact reviewed pair. Already-matching means the current pair equals the proposed final limits and the service performed no write; it does not prove who set those values or that this request ran previously. A malformed/mismatched response, native refusal, cancellation during a request, transport failure or lost acknowledgement remains UNCONFIRMED. Details are escaped for display.

There is no automatic retry, saved review or resume mode. Each connected run attempts at most one commit. After an uncertain result, inspect the current budgets through the service before deciding on another action. A new run obtains a fresh preview; repeating the old amount may move allowance a second time. Issue11's token is a content digest, not authorization, a lock, an idempotency key or durable execution history. If some later action restores the earlier before-values, an old review could apply again; this client never persists or resubmits an old review across runs.

Exit0 reports applied or matching,2 is cancellation before commit,3 is not-sent/unconfirmed after confirmation, and1 is local/read/preview refusal. Only explicit127.0.0.1 or[::1] HTTP /mcp URLs are accepted; credentials/query/fragment and redirects are refused. A URL does not establish which ledger is configured. Use the existing one-server-process-per-ledger rule.

## Source and receiving boundary

This five-path consumer contribution builds after the frozen issue11 producer c83f0a6aee72df86eed17272ee8be6a79b7f941e. Producer module, server, Store, schema, calculations, dependencies and existing tests remain unchanged. Month-copy, single-entry recovery, CSV and planned-expense workflows retain their owners. The numbered selection and review consume existing get_budgets/preview_budget_reallocation/commit_budget_reallocation tools through the typed MCP SDK.

Maintained tests use actual native producer reviews and HTTP tools, synthetic private ledgers and a real upstream commit followed by dropped acknowledgement. Independent terminal receiving is kept separately from authored tests. No installed service/client, live-ledger, account integration or hosted Actions pass is implied.
