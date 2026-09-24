import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { splitPivot } from "./pivot.ts";
import {
  easeOutCubic,
  instantaneousWpm,
  skipWordCount,
  startRamp,
} from "./timing.ts";
import { tokenize } from "./tokenize.ts";

describe("splitPivot", () => {
  it("highlights d in reading", () => {
    assert.deepEqual(splitPivot("reading"), {
      before: "rea",
      pivot: "d",
      after: "ing",
    });
  });

  it("highlights l in hello, and keeps the comma", () => {
    assert.deepEqual(splitPivot("hello,"), {
      before: "he",
      pivot: "l",
      after: "lo,",
    });
  });

  it("ignores wrapping punctuation", () => {
    assert.deepEqual(splitPivot("(reading)"), {
      before: "(rea",
      pivot: "d",
      after: "ing)",
    });
  });

  it("counts digits and skips the decimal point", () => {
    assert.deepEqual(splitPivot("3.14"), {
      before: "3.",
      pivot: "1",
      after: "4",
    });
  });

  it("uses every character when a token has no letters or digits", () => {
    assert.deepEqual(splitPivot("..."), {
      before: ".",
      pivot: ".",
      after: ".",
    });
  });

  it("keeps a combining mark on its letter", () => {
    assert.deepEqual(splitPivot("e\u0301"), {
      before: "",
      pivot: "e\u0301",
      after: "",
    });
  });

  it("pivots it's on t", () => {
    assert.deepEqual(splitPivot("it's"), {
      before: "i",
      pivot: "t",
      after: "'s",
    });
  });
});

describe("ramp", () => {
  it("eases out from half speed to the target over 3 seconds", () => {
    const ramp = startRamp(1_000, 300);
    assert.equal(instantaneousWpm(1_000, ramp, 300), 150);
    const mid = instantaneousWpm(2_500, ramp, 300);
    assert.ok(mid > 250 && mid < 300);
    assert.equal(easeOutCubic(0.5), 1 - 0.5 ** 3);
    assert.equal(instantaneousWpm(4_000, ramp, 300), 300);
  });
});

describe("skipWordCount", () => {
  it("uses seconds times target wpm over 60", () => {
    assert.equal(skipWordCount(10, 300), 50);
    assert.equal(skipWordCount(1, 80), 1);
    assert.equal(skipWordCount(60, 1000), 1000);
  });
});

describe("tokenize", () => {
  it("drops empty tokens and soft hyphens", () => {
    assert.deepEqual(tokenize("  hello,\n\nread\u00ading  "), [
      "hello,",
      "reading",
    ]);
  });
});
