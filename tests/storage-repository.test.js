import assert from "node:assert/strict";
import test from "node:test";
import { createStorageRepository } from "../src/infrastructure/storage-repository.js";

test("provides a storage interface without exposing the browser storage API", () => {
  const values = new Map();
  const repository = createStorageRepository({
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  });

  repository.setItem("theme", "rosa");
  assert.equal(repository.getItem("theme"), "rosa");
  repository.removeItem("theme");
  assert.equal(repository.getItem("theme"), null);
});
