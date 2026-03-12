import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock viem before importing the module under test
const mockGetBlockNumber = vi.fn();
const mockGetLogs = vi.fn();
const mockGetTransaction = vi.fn();

vi.mock("viem", () => ({
  createPublicClient: vi.fn(() => ({
    getBlockNumber: mockGetBlockNumber,
    getLogs: mockGetLogs,
    getTransaction: mockGetTransaction,
  })),
  http: vi.fn(() => "mock-transport"),
  parseAbiItem: vi.fn((item: string) => item),
  decodeFunctionData: vi.fn(() => ({
    args: [
      "0xaabb000000000000000000000000000000000000000000000000000000000001", // positionId
      "0x1111111111111111111111111111111111111111",  // collateralAsset
      1000000000000000000n,                          // amount (1e18)
      421614n,                                       // sourceChainId
      "0x2222222222222222222222222222222222222222",  // lendingAdapter
      0,                                             // strategy
      "0x3333333333333333333333333333333333333333",  // user
    ],
  })),
}));

import { createWatcher } from "../watcher";

describe("createWatcher", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns an object with start() and on() methods", () => {
    const watcher = createWatcher();
    expect(watcher).toHaveProperty("start");
    expect(watcher).toHaveProperty("on");
    expect(typeof watcher.start).toBe("function");
    expect(typeof watcher.on).toBe("function");
  });

  it("initializes lastProcessedBlock to the current block on start()", async () => {
    mockGetBlockNumber.mockResolvedValue(100n);
    mockGetLogs.mockResolvedValue([]);

    const watcher = createWatcher();
    await watcher.start();

    // The first getBlockNumber call initializes lastProcessedBlock
    expect(mockGetBlockNumber).toHaveBeenCalledTimes(1);
  });

  it("emits newIntent with orderId parsed from logs", async () => {
    // First call: start() initialization returns block 100
    // Second call: interval poll returns block 101
    mockGetBlockNumber
      .mockResolvedValueOnce(100n)
      .mockResolvedValueOnce(101n);

    mockGetLogs.mockResolvedValueOnce([
      {
        topics: [
          "0xeventSignature",
          "0xccdd000000000000000000000000000000000000000000000000000000000099",
        ],
        transactionHash: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      },
    ]);

    mockGetTransaction.mockResolvedValueOnce({
      input: "0xfakedata",
    });

    const watcher = createWatcher();
    const intentPromise = new Promise<any>((resolve) => {
      watcher.on("newIntent", resolve);
    });

    await watcher.start();

    // Advance the interval timer to trigger the first poll
    await vi.advanceTimersByTimeAsync(2000);

    const intent = await intentPromise;
    expect(intent.orderId).toBe(
      "0xccdd000000000000000000000000000000000000000000000000000000000099"
    );
    expect(intent.positionId).toBe(
      "0xaabb000000000000000000000000000000000000000000000000000000000001"
    );
    expect(intent.sourceChainId).toBe(421614);
    expect(intent.strategy).toBe(0);
    expect(intent.amount).toBe(1000000000000000000n);
  });

  it("advances lastProcessedBlock after processing logs", async () => {
    mockGetBlockNumber
      .mockResolvedValueOnce(100n)   // start() init
      .mockResolvedValueOnce(105n)   // first poll
      .mockResolvedValueOnce(105n);  // second poll (no new blocks)

    mockGetLogs.mockResolvedValue([]);

    const watcher = createWatcher();
    await watcher.start();

    // First poll: block advances from 100 to 105
    await vi.advanceTimersByTimeAsync(2000);

    // getLogs should have been called with fromBlock: 101n, toBlock: 105n
    expect(mockGetLogs).toHaveBeenCalledWith(
      expect.objectContaining({
        fromBlock: 101n,
        toBlock: 105n,
      })
    );

    // Second poll: no new blocks (still 105), should not call getLogs again
    await vi.advanceTimersByTimeAsync(2000);

    // getLogs should still only have been called once total
    expect(mockGetLogs).toHaveBeenCalledTimes(1);
  });

  it("handles empty log results gracefully", async () => {
    mockGetBlockNumber
      .mockResolvedValueOnce(50n)
      .mockResolvedValueOnce(55n);

    mockGetLogs.mockResolvedValueOnce([]);

    const watcher = createWatcher();
    const intentHandler = vi.fn();
    watcher.on("newIntent", intentHandler);

    await watcher.start();
    await vi.advanceTimersByTimeAsync(2000);

    // No intents should be emitted
    expect(intentHandler).not.toHaveBeenCalled();
    // getLogs was still called
    expect(mockGetLogs).toHaveBeenCalledTimes(1);
  });

  it("skips logs with missing orderId or transactionHash", async () => {
    mockGetBlockNumber
      .mockResolvedValueOnce(10n)
      .mockResolvedValueOnce(12n);

    mockGetLogs.mockResolvedValueOnce([
      // Missing orderId (topics[1])
      {
        topics: ["0xeventSignature"],
        transactionHash: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      },
      // Missing transactionHash
      {
        topics: [
          "0xeventSignature",
          "0xdddd000000000000000000000000000000000000000000000000000000000001",
        ],
        transactionHash: undefined,
      },
    ]);

    const watcher = createWatcher();
    const intentHandler = vi.fn();
    watcher.on("newIntent", intentHandler);

    await watcher.start();
    await vi.advanceTimersByTimeAsync(2000);

    // Neither log should produce an intent
    expect(intentHandler).not.toHaveBeenCalled();
  });
});
