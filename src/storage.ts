import { openDB } from "idb";
import { emptyLedger, validateLedger, type Ledger } from "./core";
const db = openDB("primeledger", 1, {
  upgrade(db) {
    db.createObjectStore("workspace");
  },
});
export async function load(): Promise<Ledger> {
  const value = await (await db).get("workspace", "ledger");
  return value ? validateLedger(value) : emptyLedger();
}
export async function save(ledger: Ledger) {
  await (await db).put("workspace", ledger, "ledger");
}
