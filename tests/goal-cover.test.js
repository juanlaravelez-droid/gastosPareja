import assert from "node:assert/strict";
import test from "node:test";
import {
  GOAL_COVER_JPEG_QUALITY,
  GOAL_COVER_MAX_WIDTH,
  MAX_GOAL_COVER_INPUT_SIZE,
  validateGoalCoverFile,
} from "../src/application/goal-cover.js";

test("compresses shared goal covers to the supported width and quality", () => {
  assert.equal(GOAL_COVER_MAX_WIDTH, 800);
  assert.equal(GOAL_COVER_JPEG_QUALITY, 0.75);
});

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
