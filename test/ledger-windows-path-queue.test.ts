import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test, { type TestContext } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import {
  emptyLedger, LedgerStore, recordTransaction,
  type RecordTransactionInput, type Transaction,
} from "../src/ledger.js";

function signal(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function input(key: string): RecordTransactionInput {
  return {
    type: "expense", amountMinor: 1, currency: "USD", date: "2026-10-13",
    category: "authored queue fixture", note: "synthetic " + key,
    idempotencyKey: key,
  };
}

async function fixture(t: TestContext): Promise<string> {
  const root = await fs.mkdtemp(join(tmpdir(), "household-path-queue-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const dir = join(root, "CaseFolder-λ");
  await fs.mkdir(dir);
  const file = join(dir, "Ledger.json");
  await fs.writeFile(file, JSON.stringify(emptyLedger()) + "\n", { flag: "wx" });
  return file;
}

async function sameActualFile(t: TestContext, left: string, right: string): Promise<boolean> {
  try {
    const a = await fs.stat(left, { bigint: true });
    const b = await fs.stat(right, { bigint: true });
    if (a.dev === b.dev && a.ino === b.ino) return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  t.skip("The authored paths are not case aliases on this filesystem");
  return false;
}

/** Hold one actual Store callback while another Store tries to mutate. */
async function heldPair(firstStore: LedgerStore, secondStore: LedgerStore, failFirst = false) {
  const entered = signal(), release = signal(), secondEntered = signal();
  const first = firstStore.update(async (data) => {
    entered.resolve();
    await release.promise;
    if (failFirst) throw new Error("authored first-operation refusal");
    return recordTransaction(data, input("fixture:first"));
  });
  // Observe the failure below without an unhandled rejection while it is held.
  first.catch(() => undefined);
  let second: Promise<Transaction> | undefined;
  try {
    await Promise.race([
      entered.promise,
      first.then(() => { throw new Error("First operation completed without its callback"); }),
    ]);
    second = secondStore.update((data) => {
      secondEntered.resolve();
      return recordTransaction(data, input("fixture:second"));
    });
    second.catch(() => undefined);
    const overlapped = await Promise.race([
      secondEntered.promise.then(() => true),
      delay(500).then(() => false),
    ]);
    release.resolve();
    return { overlapped, outcomes: await Promise.allSettled([first, second]) };
  } finally {
    release.resolve();
    await Promise.allSettled(second ? [first, second] : [first]);
  }
}

async function retainedKeys(store: LedgerStore): Promise<Array<string | undefined>> {
  return (await store.load()).transactions.map((row) => row.idempotencyKey).sort();
}

test("same resolved ledger path retains existing two-instance serialization", { timeout: 5000 }, async (t) => {
  const file = await fixture(t);
  const store = new LedgerStore(file);
  const result = await heldPair(store, new LedgerStore(join(dirname(file), ".", "Ledger.json")));
  assert.equal(result.overlapped, false);
  assert.deepEqual(result.outcomes.map((outcome) => outcome.status), ["fulfilled", "fulfilled"]);
  assert.deepEqual(await retainedKeys(store), ["fixture:first", "fixture:second"]);
});

for (const kind of ["filename", "directory", "drive"] as const) {
  test("Windows " + kind + " case aliases serialize complete ledger updates",
    { skip: process.platform !== "win32", timeout: 5000 }, async (t) => {
      const file = await fixture(t);
      let alias: string;
      if (kind === "filename") alias = join(dirname(file), "ledger.json");
      else if (kind === "directory") alias = join(dirname(dirname(file)), "casefolder-λ", "Ledger.json");
      else {
        if (!/^[A-Za-z]:/.test(file)) { t.skip("Fixture has no drive-letter alias"); return; }
        const drive = file[0];
        alias = (drive === drive.toUpperCase() ? drive.toLowerCase() : drive.toUpperCase()) + file.slice(1);
      }
      if (!await sameActualFile(t, file, alias)) return;
      const store = new LedgerStore(file);
      const result = await heldPair(store, new LedgerStore(alias));
      assert.equal(result.overlapped, false, "The second alias entered before the first update completed");
      assert.deepEqual(result.outcomes.map((outcome) => outcome.status), ["fulfilled", "fulfilled"]);
      assert.deepEqual(await retainedKeys(store), ["fixture:first", "fixture:second"]);
    });
}

test("Windows alias queue recovers after a rejected callback", {
  skip: process.platform !== "win32", timeout: 5000,
}, async (t) => {
  const file = await fixture(t), alias = join(dirname(file), "ledger.json");
  if (!await sameActualFile(t, file, alias)) return;
  const store = new LedgerStore(file), other = new LedgerStore(alias);
  const result = await heldPair(store, other, true);
  assert.equal(result.overlapped, false);
  assert.deepEqual(result.outcomes.map((outcome) => outcome.status), ["rejected", "fulfilled"]);
  assert.equal((result.outcomes[0] as PromiseRejectedResult).reason.message, "authored first-operation refusal");
  assert.deepEqual(await retainedKeys(store), ["fixture:second"]);
  await new LedgerStore(alias).update((data) => recordTransaction(data, input("fixture:third")));
  assert.deepEqual(await retainedKeys(store), ["fixture:second", "fixture:third"]);
});

async function independentlyWritable(firstFile: string, secondFile: string): Promise<void> {
  const entered = signal(), release = signal();
  const firstStore = new LedgerStore(firstFile), secondStore = new LedgerStore(secondFile);
  const first = firstStore.update(async (data) => {
    entered.resolve();
    await release.promise;
    return recordTransaction(data, input("fixture:first"));
  });
  first.catch(() => undefined);
  let second: Promise<Transaction> | undefined;
  try {
    await Promise.race([entered.promise, first.then(() => { throw new Error("Missing held callback"); })]);
    second = secondStore.update((data) => recordTransaction(data, input("fixture:second")));
    second.catch(() => undefined);
    const completedWhileHeld = await Promise.race([second.then(() => true), delay(1000).then(() => false)]);
    assert.equal(completedWhileHeld, true, "An independent ledger waited for another ledger's held update");
    release.resolve();
    await Promise.all([first, second]);
    assert.deepEqual(await retainedKeys(firstStore), ["fixture:first"]);
    assert.deepEqual(await retainedKeys(secondStore), ["fixture:second"]);
  } finally {
    release.resolve();
    await Promise.allSettled(second ? [first, second] : [first]);
  }
}

test("different ledger files remain independently writable", { timeout: 5000 }, async (t) => {
  const file = await fixture(t), other = join(dirname(file), "Other.json");
  await fs.writeFile(other, JSON.stringify(emptyLedger()) + "\n", { flag: "wx" });
  await independentlyWritable(file, other);
});

test("case-distinct POSIX ledger paths retain separate queues and contents", {
  skip: process.platform === "win32", timeout: 5000,
}, async (t) => {
  const file = await fixture(t), other = join(dirname(file), "ledger.json");
  try {
    await fs.writeFile(other, JSON.stringify(emptyLedger()) + "\n", { flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    t.skip("The authored POSIX directory is not case-sensitive");
    return;
  }
  const a = await fs.stat(file, { bigint: true }), b = await fs.stat(other, { bigint: true });
  assert.ok(a.dev !== b.dev || a.ino !== b.ino, "Fixture paths must be distinct actual files");
  await independentlyWritable(file, other);
});
