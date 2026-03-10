import { describe, it, expect, beforeEach } from "vitest";
import {
  addDefenseEvent,
  getDefenseEvents,
  getDefenseEventsByPositionId,
  getAllDefenseEvents,
  clearDefenseEvents,
} from "../services/defense-store";
import type { DefenseEvent } from "../../../shared/src/types";

const makeEvent = (overrides: Partial<DefenseEvent> = {}): DefenseEvent => ({
  positionId: "0xabc123",
  strategy: "COLLATERAL_TOPUP",
  defenseAmount: "1000000",
  defenseFee: "15000",
  healthBefore: 1.2,
  healthAfter: 1.6,
  timestamp: Date.now(),
  txHash: "0xtxhash",
  chainId: 421614,
  ...overrides,
});

beforeEach(() => {
  clearDefenseEvents();
});

describe("defense-store", () => {
  describe("addDefenseEvent", () => {
    it("adds an event to the store", () => {
      addDefenseEvent(makeEvent());
      expect(getAllDefenseEvents()).toHaveLength(1);
    });

    it("adds multiple events", () => {
      addDefenseEvent(makeEvent({ positionId: "0x1" }));
      addDefenseEvent(makeEvent({ positionId: "0x2" }));
      addDefenseEvent(makeEvent({ positionId: "0x3" }));
      expect(getAllDefenseEvents()).toHaveLength(3);
    });
  });

  describe("getDefenseEvents", () => {
    it("returns all events when no address filter", () => {
      addDefenseEvent(makeEvent({ positionId: "0xaaa" }));
      addDefenseEvent(makeEvent({ positionId: "0xbbb" }));
      expect(getDefenseEvents()).toHaveLength(2);
    });

    it("filters events by address inclusion in positionId", () => {
      addDefenseEvent(makeEvent({ positionId: "0xaaa111" }));
      addDefenseEvent(makeEvent({ positionId: "0xbbb222" }));
      addDefenseEvent(makeEvent({ positionId: "0xaaa333" }));

      const filtered = getDefenseEvents("aaa");
      expect(filtered).toHaveLength(2);
    });

    it("is case-insensitive", () => {
      addDefenseEvent(makeEvent({ positionId: "0xAbCd" }));
      const filtered = getDefenseEvents("abcd");
      expect(filtered).toHaveLength(1);
    });

    it("returns empty array when no match", () => {
      addDefenseEvent(makeEvent({ positionId: "0xaaa" }));
      expect(getDefenseEvents("zzz")).toHaveLength(0);
    });
  });

  describe("getDefenseEventsByPositionId", () => {
    it("returns events matching exact positionId", () => {
      addDefenseEvent(makeEvent({ positionId: "0xabc" }));
      addDefenseEvent(makeEvent({ positionId: "0xdef" }));
      addDefenseEvent(makeEvent({ positionId: "0xabc" }));

      expect(getDefenseEventsByPositionId("0xabc")).toHaveLength(2);
    });

    it("is case-insensitive", () => {
      addDefenseEvent(makeEvent({ positionId: "0xAbCd" }));
      expect(getDefenseEventsByPositionId("0xabcd")).toHaveLength(1);
    });

    it("returns empty when no match", () => {
      addDefenseEvent(makeEvent({ positionId: "0xabc" }));
      expect(getDefenseEventsByPositionId("0xzzz")).toHaveLength(0);
    });
  });

  describe("getAllDefenseEvents", () => {
    it("returns a copy, not the original array", () => {
      addDefenseEvent(makeEvent());
      const events = getAllDefenseEvents();
      events.push(makeEvent());
      // Original store should still have only 1
      expect(getAllDefenseEvents()).toHaveLength(1);
    });
  });

  describe("clearDefenseEvents", () => {
    it("removes all events", () => {
      addDefenseEvent(makeEvent());
      addDefenseEvent(makeEvent());
      clearDefenseEvents();
      expect(getAllDefenseEvents()).toHaveLength(0);
    });
  });
});
