import assert from "node:assert/strict";
import test from "node:test";
import { createDemoState, createDemoStorage } from "../src/infrastructure/demo-storage.js";

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

test("creates deterministic demo data when a timestamp is provided", () => {
  const first = createDemoState(1_800_000_000_000);
  const second = createDemoState(1_800_000_000_000);

  assert.deepEqual(first, second);
  assert.equal(first.members.length, 2);
  assert.equal(first.incomes.length, 2);
});

test("persists demo records and restores the demo identity", () => {
  const storage = createMemoryStorage();
  const demoStorage = createDemoStorage(storage);
  const state = createDemoState(1_800_000_000_000);

  demoStorage.saveDemoState(state);
  demoStorage.setActive(true);

  const restored = demoStorage.readDemoState();
  assert.equal(demoStorage.isActive(), true);
  assert.equal(restored.user.id, "demo-member-1");
  assert.equal(restored.wallet.id, state.wallet.id);
  assert.deepEqual(restored.goals, state.goals);

  demoStorage.setActive(false);
  assert.equal(demoStorage.isActive(), false);
});

test("rejects malformed saved JSON and incomplete demo state", () => {
  const storage = createMemoryStorage();
  const demoStorage = createDemoStorage(storage);

  storage.setItem("billetera-demo-state-v1", "{");
  assert.throws(() => demoStorage.readDemoState(), SyntaxError);

  storage.setItem("billetera-demo-state-v1", JSON.stringify({ wallet: {}, members: [] }));
  assert.throws(() => demoStorage.readDemoState(), /datos guardados de la demo están incompletos/);
});
