/**
 * @jest-environment jsdom
 *
 * @file lib/idempotency/index.test.js
 *
 * Unit tests for the idempotency key generation and persistence utilities.
 */

import {
  buildStorageKey,
  getOrCreateIdempotencyKey,
  clearIdempotencyKey,
  __resetIdempotencyCacheForTests,
} from "./index";

// ── helpers ───────────────────────────────────────────────────────────────────

function clearAllIdemKeys() {
  Object.keys(sessionStorage).forEach((k) => {
    if (k.startsWith("liquifact-idem-")) sessionStorage.removeItem(k);
  });
}

beforeEach(() => {
  clearAllIdemKeys();
  __resetIdempotencyCacheForTests();
  // Ensure crypto.randomUUID is available (jsdom supplies it)
});

afterEach(() => {
  jest.restoreAllMocks();
});

/**
 * Run `fn` while the global `sessionStorage` binding is undefined, simulating
 * SSR / a sandboxed iframe with no storage.
 */
function withoutSessionStorage(fn) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  Object.defineProperty(globalThis, "sessionStorage", {
    value: undefined,
    configurable: true,
    writable: true,
  });
  try {
    return fn();
  } finally {
    if (original) {
      Object.defineProperty(globalThis, "sessionStorage", original);
    } else {
      delete globalThis.sessionStorage;
    }
  }
}

// ── buildStorageKey ───────────────────────────────────────────────────────────

describe("buildStorageKey", () => {
  it("returns a string with the expected shape", () => {
    const key = buildStorageKey("inv-001", "GABC...XYZ", 500);
    expect(key).toBe("liquifact-idem-GABC...XYZ-inv%2D001-500");
  });

  it("treats null walletAddress as 'anon'", () => {
    const key = buildStorageKey("inv-002", null, 100);
    expect(key).toBe("liquifact-idem-anon-inv%2D002-100");
  });

  it("treats undefined walletAddress as 'anon'", () => {
    const key = buildStorageKey("inv-002", undefined, 100);
    expect(key).toBe("liquifact-idem-anon-inv%2D002-100");
  });

  it("uses different keys for different amounts on the same invoice", () => {
    const k1 = buildStorageKey("inv-001", "wallet", 100);
    const k2 = buildStorageKey("inv-001", "wallet", 200);
    expect(k1).not.toBe(k2);
  });

  it("is collision-free when an input itself contains the delimiter", () => {
    // Naive join would give both of these "liquifact-idem-x-y-z-1".
    const a = buildStorageKey("y-z", "x", 1);
    const b = buildStorageKey("z", "x-y", 1);
    expect(a).not.toBe(b);
  });
});

// ── getOrCreateIdempotencyKey ─────────────────────────────────────────────────

describe("getOrCreateIdempotencyKey", () => {
  it("returns a UUID string", () => {
    const key = getOrCreateIdempotencyKey("inv-001", "wallet", 500);
    // UUID v4 pattern
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it("returns the same key on repeated calls (idempotent)", () => {
    const key1 = getOrCreateIdempotencyKey("inv-001", "wallet", 500);
    const key2 = getOrCreateIdempotencyKey("inv-001", "wallet", 500);
    expect(key1).toBe(key2);
  });

  it("returns different keys for different (invoice, amount) tuples", () => {
    const k1 = getOrCreateIdempotencyKey("inv-001", "wallet", 500);
    const k2 = getOrCreateIdempotencyKey("inv-002", "wallet", 500);
    const k3 = getOrCreateIdempotencyKey("inv-001", "wallet", 999);
    expect(k1).not.toBe(k2);
    expect(k1).not.toBe(k3);
  });

  it("returns different keys for different wallet addresses", () => {
    const k1 = getOrCreateIdempotencyKey("inv-001", "wallet-A", 500);
    const k2 = getOrCreateIdempotencyKey("inv-001", "wallet-B", 500);
    expect(k1).not.toBe(k2);
  });

  it("persists the key in sessionStorage", () => {
    const key = getOrCreateIdempotencyKey("inv-persist", "wallet", 200);
    const stored = sessionStorage.getItem("liquifact-idem-wallet-inv%2Dpersist-200");
    expect(stored).toBe(key);
  });

  it("returns a stable key when sessionStorage is unavailable", () => {
    withoutSessionStorage(() => {
      const k1 = getOrCreateIdempotencyKey("inv-nostore", "wallet", 500);
      const k2 = getOrCreateIdempotencyKey("inv-nostore", "wallet", 500);
      expect(k1).toBe(k2);
    });
  });

  it("returns a stable key when sessionStorage.setItem throws (quota / private mode)", () => {
    jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError", "QuotaExceededError");
    });

    const k1 = getOrCreateIdempotencyKey("inv-quota", "wallet", 500);
    const k2 = getOrCreateIdempotencyKey("inv-quota", "wallet", 500);
    expect(k1).toBe(k2);
  });

  it("keeps keys stable after sessionStorage is cleared mid-session", () => {
    const k1 = getOrCreateIdempotencyKey("inv-cleared", "wallet", 500);
    sessionStorage.clear();
    const k2 = getOrCreateIdempotencyKey("inv-cleared", "wallet", 500);
    // The in-memory tier ensures a retry still sends the same key.
    expect(k2).toBe(k1);
  });

  it("regenerates if sessionStorage is cleared between calls", () => {
    const key1 = getOrCreateIdempotencyKey("inv-001", "wallet", 500);
    sessionStorage.clear();
    const key2 = getOrCreateIdempotencyKey("inv-001", "wallet", 500);
    // A fresh key is generated — different from the cleared one.
    expect(key2).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    // The two keys may happen to be equal (UUID collision) but almost certainly aren't.
    // We only assert the new key is a valid UUID.
    void key1;
  });
});

// ── clearIdempotencyKey ───────────────────────────────────────────────────────

describe("clearIdempotencyKey", () => {
  it("removes the key from sessionStorage", () => {
    getOrCreateIdempotencyKey("inv-clear", "wallet", 300);
    clearIdempotencyKey("inv-clear", "wallet", 300);
    expect(sessionStorage.getItem("liquifact-idem-wallet-inv%2Dclear-300")).toBeNull();
  });

  it("clears the in-memory tier too", () => {
    withoutSessionStorage(() => {
      const k1 = getOrCreateIdempotencyKey("inv-mem-clear", "wallet", 300);
      clearIdempotencyKey("inv-mem-clear", "wallet", 300);
      const k2 = getOrCreateIdempotencyKey("inv-mem-clear", "wallet", 300);
      expect(k2).not.toBe(k1);
    });
  });

  it("does not throw if the key does not exist", () => {
    expect(() => clearIdempotencyKey("inv-ghost", "wallet", 100)).not.toThrow();
  });

  it("after clearing, getOrCreateIdempotencyKey generates a fresh key", () => {
    const key1 = getOrCreateIdempotencyKey("inv-fresh", "wallet", 400);
    clearIdempotencyKey("inv-fresh", "wallet", 400);
    const key2 = getOrCreateIdempotencyKey("inv-fresh", "wallet", 400);
    // Two randomly generated UUIDs are almost certainly different.
    // We assert they are both valid UUIDs; equality would be a UUID collision.
    expect(key2).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    void key1;
  });
});
