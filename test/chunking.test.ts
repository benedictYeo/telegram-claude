import { describe, it, expect } from "vitest";
import { chunkMessage } from "../src/lib/telegram.js";

describe("chunkMessage", () => {
  it("returns single empty string for empty input", () => {
    expect(chunkMessage("")).toEqual([""]);
  });

  it("returns single chunk for single char", () => {
    expect(chunkMessage("x")).toEqual(["x"]);
  });

  it("returns single chunk for exactly max chars", () => {
    const text = "a".repeat(4000);
    const result = chunkMessage(text);
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(4000);
  });

  it("splits at max+1 chars into two chunks", () => {
    const text = "a".repeat(4001);
    const result = chunkMessage(text);
    expect(result).toHaveLength(2);
    expect(result[0]).toHaveLength(4000);
    expect(result[1]).toHaveLength(1);
  });

  it("splits 12000 chars into three equal chunks", () => {
    const text = "b".repeat(12000);
    const result = chunkMessage(text);
    expect(result).toHaveLength(3);
    expect(result.every((c) => c.length === 4000)).toBe(true);
  });

  it("respects custom max", () => {
    const text = "abcde";
    const result = chunkMessage(text, 2);
    expect(result).toEqual(["ab", "cd", "e"]);
  });
});
