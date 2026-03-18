// ============================================
// Create Account Calldata Validation Tests
// Generates a throwaway wallet, signs the create-account message,
// calls the API, and verifies the returned calldata is valid.
// ============================================

import { describe, it, expect, mock } from "bun:test";
import {
  keccak256,
  encodePacked,
  decodeFunctionData,
  recoverMessageAddress,
  type Address,
  type Hex,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { AccountFactoryAbi } from "../../contracts/abis";

// Mock deployment addresses — same pattern as calldata.test.ts
const MOCK_FACTORY =
  "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc" as Address;

const MOCK_ADDRESSES = {
  accountFactory: MOCK_FACTORY,
  accountImpl: "0x976EA74026E726554dB657fA54763abd0C3a0aa9" as Address,
  aqua: "0x14dC79964da2C08dda4c80b5d9F26331e4B3A7A4" as Address,
  aquaAdapter: "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f" as Address,
  beacon: "0xa0Ee7A142d267C1f36714E4a8F75612F20a79720" as Address,
  composer: "0xBcd4042DE499D14e55001CcbB24a551F3b954096" as Address,
  deployer: "0x71bE63f3384f5fb98995898A86B02Fb2426c5788" as Address,
  lzEndpoint: "0xFABB0ac9d68B0B445fB7357272Ff202C5651694a" as Address,
  rebalancer: "0x1CBd3b2770909D4e10f157cABC84C7264073C9Ec" as Address,
  rebalancerImpl:
    "0xdF3e18d64BC6A983f673Ab319CCaE4f1a57C7097" as Address,
  sampleAccount:
    "0xcd3B766CCDd6AE721141F452C550Ca635964ce71" as Address,
  stargateAdapter:
    "0x2546BcD3c84621e976D8185a91A922aE77ECEc30" as Address,
  stargateEth: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address,
  swapVMRouter: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Address,
  swapper: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" as Address,
  usdc: "0x90F79bf6EB2c4f870365E785982E1f101E93b906" as Address,
  weth: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65" as Address,
  wethStrategyHash:
    "0x0000000000000000000000000000000000000000000000000000000000000001" as Hex,
};

mock.module("../../contracts/client", () => ({
  getDeploymentAddresses: (_chainId: number) => MOCK_ADDRESSES,
  getPublicClient: (_chainId: number) => ({}),
  resetClients: () => {},
  CHAIN_ID_TO_LZ_EID: { 8453: 30184, 130: 30320 },
  LZ_EID_TO_CHAIN_ID: { 30184: 8453, 30320: 130 },
}));

// Set API key before importing app (middleware checks process.env.API_KEY)
const API_KEY = "test-api-key";
process.env.API_KEY = API_KEY;

// Import app after mock + env are in place
const { app } = await import("../../index");

describe("Create Account — Calldata Validation", () => {
  it("should generate valid createAccount calldata from a throwaway wallet signature", async () => {
    // 1. Generate a throwaway wallet
    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);
    const ownerAddress = account.address;

    // 2. Sign the create-account message (matches AccountFactory.sol verification)
    //    message = keccak256(abi.encodePacked("aqua0.create-account:", factoryAddress))
    const messageHash = keccak256(
      encodePacked(
        ["string", "address"],
        ["aqua0.create-account:", MOCK_FACTORY],
      ),
    );
    const signature = await account.signMessage({
      message: { raw: messageHash },
    });

    // 3. Call the API endpoint
    const res = await app.request(
      "/api/v1/lp/accounts/prepare-create?chainId=8453",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": API_KEY,
        },
        body: JSON.stringify({ owner: ownerAddress, signature }),
      },
    );

    expect(res.status).toBe(200);

    const body = await res.json();

    // 4. Verify the calldata targets the correct factory address
    expect(body.calldata.to).toBe(MOCK_FACTORY);
    expect(body.calldata.data).toStartWith("0x");

    // 5. Decode the calldata and verify function + args
    const decoded = decodeFunctionData({
      abi: AccountFactoryAbi,
      data: body.calldata.data as Hex,
    });

    expect(decoded.functionName).toBe("createAccount");
    expect(decoded.args[0]).toBe(signature);

    // 6. Recover the signer from the signature to confirm it matches the owner
    //    This mirrors what SignatureChecker.isValidSignatureNow does on-chain
    const recoveredAddress = await recoverMessageAddress({
      message: { raw: messageHash },
      signature: signature as Hex,
    });

    expect(recoveredAddress.toLowerCase()).toBe(ownerAddress.toLowerCase());
  });

  it("should produce different calldata for different wallets", async () => {
    const wallet1 = privateKeyToAccount(generatePrivateKey());
    const wallet2 = privateKeyToAccount(generatePrivateKey());

    const messageHash = keccak256(
      encodePacked(
        ["string", "address"],
        ["aqua0.create-account:", MOCK_FACTORY],
      ),
    );

    const sig1 = await wallet1.signMessage({ message: { raw: messageHash } });
    const sig2 = await wallet2.signMessage({ message: { raw: messageHash } });

    const res1 = await app.request(
      "/api/v1/lp/accounts/prepare-create?chainId=8453",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": API_KEY,
        },
        body: JSON.stringify({ owner: wallet1.address, signature: sig1 }),
      },
    );

    const res2 = await app.request(
      "/api/v1/lp/accounts/prepare-create?chainId=8453",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": API_KEY,
        },
        body: JSON.stringify({ owner: wallet2.address, signature: sig2 }),
      },
    );

    const body1 = await res1.json();
    const body2 = await res2.json();

    // Same target (factory), different calldata (different signatures)
    expect(body1.calldata.to).toBe(body2.calldata.to);
    expect(body1.calldata.data).not.toBe(body2.calldata.data);
  });

  it("should produce deterministic calldata for the same signature", async () => {
    const wallet = privateKeyToAccount(generatePrivateKey());

    const messageHash = keccak256(
      encodePacked(
        ["string", "address"],
        ["aqua0.create-account:", MOCK_FACTORY],
      ),
    );

    const signature = await wallet.signMessage({
      message: { raw: messageHash },
    });

    const res1 = await app.request(
      "/api/v1/lp/accounts/prepare-create?chainId=8453",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": API_KEY,
        },
        body: JSON.stringify({ owner: wallet.address, signature }),
      },
    );

    const res2 = await app.request(
      "/api/v1/lp/accounts/prepare-create?chainId=8453",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": API_KEY,
        },
        body: JSON.stringify({ owner: wallet.address, signature }),
      },
    );

    const body1 = await res1.json();
    const body2 = await res2.json();

    expect(body1.calldata.data).toBe(body2.calldata.data);
  });

  it("should reject request with missing signature", async () => {
    const wallet = privateKeyToAccount(generatePrivateKey());

    const res = await app.request(
      "/api/v1/lp/accounts/prepare-create?chainId=8453",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": API_KEY,
        },
        body: JSON.stringify({ owner: wallet.address }),
      },
    );

    expect(res.status).toBe(400);
  });

  it("should reject request with missing owner", async () => {
    const res = await app.request(
      "/api/v1/lp/accounts/prepare-create?chainId=8453",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": API_KEY,
        },
        body: JSON.stringify({ signature: "0xdeadbeef" }),
      },
    );

    expect(res.status).toBe(400);
  });

  it("should reject request with missing chainId", async () => {
    const wallet = privateKeyToAccount(generatePrivateKey());

    const messageHash = keccak256(
      encodePacked(
        ["string", "address"],
        ["aqua0.create-account:", MOCK_FACTORY],
      ),
    );

    const signature = await wallet.signMessage({
      message: { raw: messageHash },
    });

    const res = await app.request("/api/v1/lp/accounts/prepare-create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
      },
      body: JSON.stringify({ owner: wallet.address, signature }),
    });

    expect(res.status).toBe(400);
  });

  it("should reject request with unsupported chainId", async () => {
    const wallet = privateKeyToAccount(generatePrivateKey());

    const messageHash = keccak256(
      encodePacked(
        ["string", "address"],
        ["aqua0.create-account:", MOCK_FACTORY],
      ),
    );

    const signature = await wallet.signMessage({
      message: { raw: messageHash },
    });

    const res = await app.request(
      "/api/v1/lp/accounts/prepare-create?chainId=999",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": API_KEY,
        },
        body: JSON.stringify({ owner: wallet.address, signature }),
      },
    );

    expect(res.status).toBe(400);
  });

  it("should work with chainId=130 (Unichain)", async () => {
    const wallet = privateKeyToAccount(generatePrivateKey());

    const messageHash = keccak256(
      encodePacked(
        ["string", "address"],
        ["aqua0.create-account:", MOCK_FACTORY],
      ),
    );

    const signature = await wallet.signMessage({
      message: { raw: messageHash },
    });

    const res = await app.request(
      "/api/v1/lp/accounts/prepare-create?chainId=130",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": API_KEY,
        },
        body: JSON.stringify({ owner: wallet.address, signature }),
      },
    );

    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.calldata.to).toBe(MOCK_FACTORY);

    const decoded = decodeFunctionData({
      abi: AccountFactoryAbi,
      data: body.calldata.data as Hex,
    });
    expect(decoded.functionName).toBe("createAccount");
    expect(decoded.args[0]).toBe(signature);
  });

  it("signature should recover to the correct owner address (ERC-4337 verification)", async () => {
    // This test specifically validates the ERC-4337 flow:
    // The owner (smart account) signs the message, and we verify
    // that on-chain signature recovery would match msg.sender.
    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);

    const messageHash = keccak256(
      encodePacked(
        ["string", "address"],
        ["aqua0.create-account:", MOCK_FACTORY],
      ),
    );

    const signature = await account.signMessage({
      message: { raw: messageHash },
    });

    // Verify ECDSA recovery matches the signer
    // On-chain: SignatureChecker.isValidSignatureNow(msg.sender, ethSignedHash, signature)
    const recovered = await recoverMessageAddress({
      message: { raw: messageHash },
      signature: signature as Hex,
    });

    expect(recovered.toLowerCase()).toBe(account.address.toLowerCase());

    // Also verify the salt derivation is deterministic
    // On-chain: bytes32 salt = keccak256(signature)
    const salt = keccak256(signature as Hex);
    expect(salt).toMatch(/^0x[a-f0-9]{64}$/);

    // Same signature always produces same salt
    const salt2 = keccak256(signature as Hex);
    expect(salt).toBe(salt2);
  });
});
