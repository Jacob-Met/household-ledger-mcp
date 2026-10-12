#!/usr/bin/env python3
"""Receive a built Household Ledger package through real JSON-RPC stdin.

Only newly created synthetic files are used. This consumer imports no service
modules and needs only Python's standard library plus the package's Node runtime.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import os
from pathlib import Path
import queue
import subprocess
import sys
import threading
import traceback


SOURCE = "591ab6f5a2d65bf596aeb707dbb635ee981ec926"
TOOLS = sorted(["record_transaction", "list_transactions", "monthly_summary",
                "cashflow_trend", "set_budget", "get_budgets",
                "preview_transaction_import", "commit_transaction_import"])
HEADERS = ["idempotencyKey", "type", "amountMinor", "currency", "date", "category", "note"]
ROWS = [
    ["stdio-oct-pay", "income", 210000, "usd", "2026-10-01", "wages", "October fixture"],
    ["stdio-market", "expense", 3125, "USD", "2026-10-02", "groceries", "market, aisle 2"],
    ["stdio-topup", "expense", 875, "USD", "2026-10-03", "groceries", "line one\nline two"],
    ["stdio-home", "expense", 4999, "USD", "2026-10-04", "Home & café", 'literal "quote" 🧪'],
    ["stdio-nov-pay", "income", 220000, "USD", "2026-11-01", "wages", "November fixture"],
    ["stdio-nov-food", "expense", 6500, "USD", "2026-11-02", "groceries", "November food"],
    ["stdio-eur-food", "expense", 2500, "EUR", "2026-10-05", "groceries", "Separate currency"],
    ["stdio-eur-bus", "expense", 1000, "EUR", "2026-11-03", "transport", "Separate currency"],
]
BUDGETS = [
    {"category": "groceries", "month": "2026-10", "limitMinor": 4500, "currency": "USD"},
    {"category": "Home & café", "month": "2026-10", "limitMinor": 4500, "currency": "USD"},
    {"category": "groceries", "month": "2026-11", "limitMinor": 6000, "currency": "USD"},
    {"category": "groceries", "month": "2026-10", "limitMinor": 3000, "currency": "EUR"},
    {"category": "transport", "month": "2026-11", "limitMinor": 900, "currency": "EUR"},
]


def digest(data):
    return hashlib.sha256(data).hexdigest()


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def saved_state(path):
    stat = path.stat()
    return {"sha256": digest(path.read_bytes()), "bytes": stat.st_size,
            "mtime_ns": stat.st_mtime_ns, "inode": stat.st_ino}


class StdioClient:
    def __init__(self, node, package, ledger, output, label):
        env = os.environ.copy()
        env.pop("NODE_OPTIONS", None)
        env.pop("NODE_PATH", None)
        env["HOUSEHOLD_LEDGER_DATA_PATH"] = str(ledger)
        self.stderr = (output / (label + ".stderr.log")).open("w", encoding="utf-8")
        self.process = subprocess.Popen(
            [node, str(package / "dist/src/stdio.js")], cwd=output, env=env,
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=self.stderr,
            text=True, encoding="utf-8", bufsize=1,
        )
        self.output, self.label = output, label
        self.pending = queue.Queue()
        self.messages = []
        self.exchanges = []
        self.number = 0

        def read_lines():
            for line in self.process.stdout:
                self.messages.append(line)
                self.pending.put(line)
            self.pending.put(None)

        self.reader = threading.Thread(target=read_lines, daemon=True)
        self.reader.start()

    def send(self, message):
        self.process.stdin.write(json.dumps(message, ensure_ascii=False) + "\n")
        self.process.stdin.flush()

    def request(self, method, params):
        self.number += 1
        message = {"jsonrpc": "2.0", "id": self.number, "method": method, "params": params}
        self.send(message)
        line = self.pending.get(timeout=10)
        require(line is not None, "stdio process ended before " + method)
        reply = json.loads(line)
        self.exchanges.append({"request": message, "response": reply})
        require(reply.get("jsonrpc") == "2.0" and reply.get("id") == self.number,
                "response did not match the request")
        require("error" not in reply, "JSON-RPC error: " + str(reply.get("error")))
        return reply["result"]

    def initialize(self):
        result = self.request("initialize", {
            "protocolVersion": "2025-11-25", "capabilities": {},
            "clientInfo": {"name": "household-package-receiver", "version": "1"},
        })
        require(result["serverInfo"]["name"] == "household-ledger-mcp", "wrong server")
        require(result["protocolVersion"] == "2025-11-25", "unexpected protocol")
        self.send({"jsonrpc": "2.0", "method": "notifications/initialized"})
        listed = self.request("tools/list", {})
        require(sorted(t["name"] for t in listed["tools"]) == TOOLS, "tool roster differs")
        return result

    def tool(self, name, arguments, error=False):
        result = self.request("tools/call", {"name": name, "arguments": arguments})
        require(bool(result.get("isError", False)) == error, "unexpected tool result: " + name)
        require(len(result["content"]) == 1 and result["content"][0]["type"] == "text",
                "unexpected tool content")
        text = result["content"][0]["text"]
        return text if error else json.loads(text)

    def close(self):
        self.process.stdin.close()
        try:
            self.process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self.process.terminate()
            try:
                self.process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait(timeout=3)
            raise AssertionError("stdio process did not exit after stdin closed")
        finally:
            self.reader.join(timeout=2)
            self.stderr.close()
            (self.output / (self.label + ".stdout.jsonl")).write_text(
                "".join(self.messages), encoding="utf-8")
            (self.output / (self.label + ".exchanges.json")).write_text(
                json.dumps(self.exchanges, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        require(self.process.returncode == 0, "stdio process exit was nonzero")
        require(not self.reader.is_alive(), "stdout reader did not finish")


def run(node, package, output, receipt):
    ledger = output / "synthetic-ledger.json"
    buffer = io.StringIO(newline="")
    writer = csv.writer(buffer, lineterminator="\r\n")
    writer.writerow(HEADERS)
    writer.writerows(ROWS)
    csv_text = buffer.getvalue()
    csv_path = output / "authored-import.csv"
    csv_path.write_bytes(csv_text.encode("utf-8"))
    inputs = [dict(zip(HEADERS, row)) for row in ROWS]
    for row in inputs:
        row["currency"] = row["currency"].upper()
    receipt["csv_sha256"] = digest(csv_path.read_bytes())
    receipt["sessions"] = []
    receipt["checks"] = []

    def checked(name, condition):
        require(condition, name)
        receipt["checks"].append(name)

    def reports(client):
        values = {}
        for currency in ["USD", "EUR"]:
            values[currency] = {
                "monthly": client.tool("monthly_summary", {"year": 2026, "month": 10, "currency": currency}),
                "cashflow": client.tool("cashflow_trend", {"fromMonth": "2026-10", "toMonth": "2026-12", "currency": currency}),
            }
        return values

    first = StdioClient(node, package, ledger, output, "initial")
    try:
        first.initialize()
        seed_input = {"type": "income", "amountMinor": 777, "currency": "SEK",
                      "date": "2026-09-30", "category": "untouched",
                      "note": "Outside the received interval", "idempotencyKey": "stdio-unrelated"}
        seed = first.tool("record_transaction", seed_input)
        before_preview = saved_state(ledger)
        preview = first.tool("preview_transaction_import", {"csv": csv_text})
        checked("preview is read-only", saved_state(ledger) == before_preview)
        checked("preview retains exact authored values", [r["input"] for r in preview["rows"]] == inputs)
        checked("preview includes all eight rows", preview["counts"] == {
            "total": 8, "add": 8, "alreadyRecorded": 0, "conflict": 0})
        checked("CSV digest matches protocol preview", preview["sourceSha256"] == receipt["csv_sha256"])
        failure = first.tool("commit_transaction_import", {"csv": csv_text, "reviewToken": "0" * 64}, error=True)
        checked("unreviewed token refuses without writing", "reviewToken" in failure and saved_state(ledger) == before_preview)
        imported = first.tool("commit_transaction_import", {"csv": csv_text, "reviewToken": preview["reviewToken"]})
        checked("reviewed batch imports eight records", imported["added"] == 8 and imported["alreadyRecorded"] == 0)
        transactions = imported["transactions"]
        checked("import returns eight distinct recording identities", len(transactions) == 8
                and len({tx["id"] for tx in transactions}) == 8)
        checked("import retains literal notes and normalized currencies", all(
            {k: tx[k] for k in HEADERS} == item for tx, item in zip(transactions, inputs)))
        for budget in BUDGETS:
            checked("set budget " + budget["month"] + " " + budget["currency"] + " " + budget["category"],
                    first.tool("set_budget", budget) == budget)
        october = [b for b in BUDGETS if b["month"] == "2026-10"]
        checked("all October budget denominations are visible",
                first.tool("get_budgets", {"month": "2026-10"}) == october)
        checked("budget currency selection is explicit", first.tool("get_budgets", {
            "month": "2026-10", "currency": "USD"}) == [b for b in october if b["currency"] == "USD"])
        original_reports = reports(first)
        expected = json.loads((Path(__file__).with_name("stdio-package-expected.json")).read_text(encoding="utf-8"))
        checked("monthly and complete cashflow results match the independent oracle", original_reports == expected)
        failure = first.tool("cashflow_trend", {"fromMonth": "2026-10", "toMonth": "2026-12"}, error=True)
        checked("mixed currencies require an explicit selector", "currenc" in failure)
        listed = first.tool("list_transactions", {"limit": 100})
        checked("unrelated receipt and complete imported records survive", listed["total"] == 9
                and {t["id"]: t for t in listed["transactions"]} == {t["id"]: t for t in [seed, *transactions]})
        before_retry = saved_state(ledger)
        saved_document = json.loads(ledger.read_text(encoding="utf-8"))
        checked("saved ledger includes explicit budgets", saved_document["version"] == 2 and saved_document["budgets"] == BUDGETS)
    finally:
        first.close()
        receipt["sessions"].append({"label": "initial", "pid": first.process.pid,
                                     "rpc_requests": len(first.exchanges), "exit_code": first.process.returncode})

    second = StdioClient(node, package, ledger, output, "reopened")
    try:
        second.initialize()
        repeated_preview = second.tool("preview_transaction_import", {"csv": csv_text})
        checked("fresh process finds all original recordings", repeated_preview["counts"] == {
            "total": 8, "add": 0, "alreadyRecorded": 8, "conflict": 0})
        repeated = second.tool("commit_transaction_import", {"csv": csv_text, "reviewToken": preview["reviewToken"]})
        checked("fresh-process retry returns exact original receipts", repeated["added"] == 0
                and repeated["alreadyRecorded"] == 8 and repeated["transactions"] == transactions)
        checked("fresh-process reports preserve exact JSON values", reports(second) == original_reports)
        checked("fresh-process listing retains every receipt", second.tool("list_transactions", {"limit": 100}) == listed)
        checked("retry and reads do not rewrite saved ledger", saved_state(ledger) == before_retry)
        checked("authored CSV stays unchanged", digest(csv_path.read_bytes()) == receipt["csv_sha256"])
        receipt["ledger"] = saved_state(ledger)
        receipt["reports"] = original_reports
        receipt["recording_ids"] = [t["id"] for t in transactions]
    finally:
        second.close()
        receipt["sessions"].append({"label": "reopened", "pid": second.process.pid,
                                     "rpc_requests": len(second.exchanges), "exit_code": second.process.returncode})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--package", type=Path, required=True)
    parser.add_argument("--work-dir", type=Path, required=True, help="new directory for synthetic data and retained evidence")
    parser.add_argument("--node", default="node")
    args = parser.parse_args()
    package, output = args.package.resolve(), args.work_dir.resolve()
    require((package / "dist/src/stdio.js").is_file(), "package has no built stdio entrypoint")
    output.mkdir(mode=0o700, parents=False, exist_ok=False)
    receipt = {"source_commit": SOURCE, "package": str(package), "status": "running",
               "receiver_sha256": digest(Path(__file__).read_bytes()),
               "node_version": subprocess.check_output([args.node, "--version"], text=True).strip(),
               "scope": "Two sequential actual stdin MCP processes on one newly created synthetic ledger; no service activation or live data."}
    try:
        run(args.node, package, output, receipt)
        receipt["status"] = "passed"
        code = 0
    except Exception as error:
        receipt.update(status="failed", error=str(error), traceback=traceback.format_exc())
        code = 1
    (output / "receipt.json").write_text(json.dumps(receipt, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"status": receipt["status"], "checks": len(receipt.get("checks", [])),
                      "receipt": str(output / "receipt.json")}), flush=True)
    return code


if __name__ == "__main__":
    raise SystemExit(main())
