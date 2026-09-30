import {
  DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEY,
  SETTINGS_UPDATED_KEY,
  readStoredSettings,
  writeStoredSettings,
  readStoredSettingsUpdatedAt,
  writeStoredSettingsUpdatedAt,
} from "@/lib/settingsStore";

// NOTE: This file is a Jest test module. It must be parsed by the project's
// Jest/Babel/TypeScript transform pipeline (which understands JSX/TSX), not by
// `node --check`. Running `node --check` directly on a .tsx file fails with
// ERR_UNKNOWN_FILE_EXTENSION because Node's built-in syntax checker does not
// support the .tsx extension. Use `npx jest lib/settingsStore.test.tsx` (or the
// repository's configured test script) to validate this file.

function mockLocalStorage(initial: Record<string, string> = {}) {
  const store: Record<string, string> = { ...initial };
  const mock = {
    getItem: jest.fn((k: string) => store[k] ?? null),
    setItem: jest.fn((k: string, v: string) => {
      store[k] = v;
    }),
    removeItem: jest.fn((k: string) => {
      delete store[k];
    }),
    clear: jest.fn(() => {
      Object.keys(store).forEach((k) => delete store[k]);
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: jest.fn((i: number) => Object.keys(store)[i] ?? null),
  };
  Object.defineProperty(window, "localStorage", { value: mock, writable: true });
  return { mock, store };
}

describe("readStoredSettings", () => {
  it("returns defaults when nothing is stored", () => {
    mockLocalStorage({});
    expect(readStoredSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("returns stored settings merged over defaults", () => {
    mockLocalStorage({ [SETTINGS_STORAGE_KEY]: JSON.stringify({ currency: "EUR" }) });
    expect(readStoredSettings()).toEqual({ ...DEFAULT_SETTINGS, currency: "EUR" });
  });

  it("falls back to defaults on malformed JSON", () => {
    mockLocalStorage({ [SETTINGS_STORAGE_KEY]: "{not-json" });
    expect(readStoredSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("falls back to defaults when stored value is not an object", () => {
    mockLocalStorage({ [SETTINGS_STORAGE_KEY]: JSON.stringify("a string") });
    expect(readStoredSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("falls back to defaults when localStorage throws", () => {
    Object.defineProperty(window, "localStorage", {
      value: {
        getItem: () => {
          throw new Error("blocked");
        },
      },
      writable: true,
    });
    expect(readStoredSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("falls back to defaults when stored value is null", () => {
    mockLocalStorage({ [SETTINGS_STORAGE_KEY]: "null" });
    expect(readStoredSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("falls back to defaults when stored value is an array", () => {
    mockLocalStorage({ [SETTINGS_STORAGE_KEY]: JSON.stringify(["a", "b"]) });
    expect(readStoredSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("falls back to defaults when stored value is an empty string", () => {
    mockLocalStorage({ [SETTINGS_STORAGE_KEY]: "" });
    expect(readStoredSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("preserves defaults for unknown keys while keeping valid overrides", () => {
    mockLocalStorage({
      [SETTINGS_STORAGE_KEY]: JSON.stringify({ currency: "GBP", emailNotifications: true }),
    });
    expect(readStoredSettings()).toEqual({
      ...DEFAULT_SETTINGS,
      currency: "GBP",
      emailNotifications: true,
    });
  });
});

describe("writeStoredSettings", () => {
  it("persists settings as JSON", () => {
    const { store } = mockLocalStorage({});
    writeStoredSettings({ currency: "NGN", emailNotifications: false });
    expect(JSON.parse(store[SETTINGS_STORAGE_KEY])).toEqual({
      currency: "NGN",
      emailNotifications: false,
    });
  });

  it("does not throw when localStorage.setItem throws", () => {
    Object.defineProperty(window, "localStorage", {
      value: {
        setItem: () => {
          throw new Error("quota exceeded");
        },
      },
      writable: true,
    });
    expect(() => writeStoredSettings(DEFAULT_SETTINGS)).not.toThrow();
  });

  it("round-trips settings through write and read", () => {
    mockLocalStorage({});
    const next = { ...DEFAULT_SETTINGS, currency: "USD" };
    writeStoredSettings(next);
    expect(readStoredSettings()).toEqual(next);
  });
});

describe("readStoredSettingsUpdatedAt", () => {
  it("returns the stored numeric timestamp", () => {
    mockLocalStorage({ [SETTINGS_UPDATED_KEY]: "1700000000000" });
    expect(readStoredSettingsUpdatedAt()).toBe(1700000000000);
  });

  it("returns null when nothing is stored", () => {
    mockLocalStorage({});
    expect(readStoredSettingsUpdatedAt()).toBeNull();
  });

  it("returns null when the stored value is not numeric", () => {
    mockLocalStorage({ [SETTINGS_UPDATED_KEY]: "nope" });
    expect(readStoredSettingsUpdatedAt()).toBeNull();
  });

  it("returns null when the stored value is an empty string", () => {
    mockLocalStorage({ [SETTINGS_UPDATED_KEY]: "" });
    expect(readStoredSettingsUpdatedAt()).toBeNull();
  });

  it("returns null when the stored value is NaN", () => {
    mockLocalStorage({ [SETTINGS_UPDATED_KEY]: "NaN" });
    expect(readStoredSettingsUpdatedAt()).toBeNull();
  });

  it("returns null when the stored value is Infinity", () => {
    mockLocalStorage({ [SETTINGS_UPDATED_KEY]: "Infinity" });
    expect(readStoredSettingsUpdatedAt()).toBeNull();
  });

  it("returns null when the stored value is negative", () => {
    mockLocalStorage({ [SETTINGS_UPDATED_KEY]: "-1" });
    expect(readStoredSettingsUpdatedAt()).toBeNull();
  });

  it("returns 0 for the epoch boundary", () => {
    mockLocalStorage({ [SETTINGS_UPDATED_KEY]: "0" });
    expect(readStoredSettingsUpdatedAt()).toBe(0);
  });

  it("returns null when localStorage throws", () => {
    Object.defineProperty(window, "localStorage", {
      value: {
        getItem: () => {
          throw new Error("blocked");
        },
      },
      writable: true,
    });
    expect(readStoredSettingsUpdatedAt()).toBeNull();
  });
});

describe("writeStoredSettingsUpdatedAt", () => {
  it("persists the timestamp as a string", () => {
    const { store } = mockLocalStorage({});
    writeStoredSettingsUpdatedAt(1700000000000);
    expect(store[SETTINGS_UPDATED_KEY]).toBe("1700000000000");
  });

  it("persists the epoch boundary as a string", () => {
    const { store } = mockLocalStorage({});
    writeStoredSettingsUpdatedAt(0);
    expect(store[SETTINGS_UPDATED_KEY]).toBe("0");
  });

  it("does not throw when localStorage.setItem throws", () => {
    Object.defineProperty(window, "localStorage", {
      value: {
        setItem: () => {
          throw new Error("quota exceeded");
        },
      },
      writable: true,
    });
    expect(() => writeStoredSettingsUpdatedAt(Date.now())).not.toThrow();
  });

  it("round-trips the timestamp through write and read", () => {
    mockLocalStorage({});
    writeStoredSettingsUpdatedAt(1700000000000);
    expect(readStoredSettingsUpdatedAt()).toBe(1700000000000);
  });
});
