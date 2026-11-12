import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_GOAL_COVER_INPUT_SIZE,
  validateGoalCoverFile,
} from "../src/application/goal-cover.js";

test("accepts supported goal cover formats under the upload limit", () => {
  for (const type of ["image/jpeg", "image/png", "image/webp"]) {
    assert.equal(validateGoalCoverFile({ type, size: 1024 }), null);
  }
});

test("rejects unsupported, empty, and oversized goal cover files", () => {
  assert.match(validateGoalCoverFile({ type: "image/gif", size: 1024 }), /JPG, PNG o WebP/);
  assert.match(validateGoalCoverFile({ type: "image/jpeg", size: 0 }), /superar 20 MB/);
  assert.match(
    validateGoalCoverFile({ type: "image/jpeg", size: MAX_GOAL_COVER_INPUT_SIZE + 1 }),
    /superar 20 MB/,
  );
  assert.match(validateGoalCoverFile(null), /JPG, PNG o WebP/);
});
