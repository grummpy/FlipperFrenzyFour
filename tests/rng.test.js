import assert from "node:assert/strict";
import { test } from "node:test";
import { deriveSeed, makeRng } from "../src/core/rng.js";

test("same seed yields the same stream", () => {
  const a = makeRng(42);
  const b = makeRng(42);
  const seqA = [a(), a(), a(), a(), a()];
  const seqB = [b(), b(), b(), b(), b()];
  assert.deepEqual(seqA, seqB);
  for (const value of seqA) {
    assert.ok(value >= 0 && value < 1);
  }
});

test("different seeds diverge", () => {
  assert.notEqual(makeRng(1)(), makeRng(2)());
});

test("derived round seeds are stable and distinct", () => {
  assert.equal(deriveSeed(5, 0), deriveSeed(5, 0));
  assert.notEqual(deriveSeed(5, 0), deriveSeed(5, 1));
  assert.notEqual(deriveSeed(5, 0), deriveSeed(6, 0));
});
