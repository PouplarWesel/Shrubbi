type CacheEnvelope<T> = {
  cachedAt: number;
  data: T;
  version: 1;
};

const CACHE_PREFIX = "shrubbi:cache:v1";

const isClientRuntime = () =>
  typeof window !== "undefined" ||
  (typeof navigator !== "undefined" && navigator.product === "ReactNative");

const resolveStorage = async () => {
  if (!isClientRuntime()) return null;
  const module = await import("@react-native-async-storage/async-storage");
  return module.default;
};

const buildKey = (key: string) => `${CACHE_PREFIX}:${key}`;

export const readCachedValue = async <T>(
  key: string,
  maxAgeMs?: number,
): Promise<T | null> => {
  try {
    const storage = await resolveStorage();
    if (!storage) return null;

    const rawValue = await storage.getItem(buildKey(key));
    if (!rawValue) return null;

    const parsed = JSON.parse(rawValue) as CacheEnvelope<T>;
    if (!parsed || parsed.version !== 1) return null;
    if (typeof parsed.cachedAt !== "number") return null;
    if (
      typeof maxAgeMs === "number" &&
      maxAgeMs > 0 &&
      Date.now() - parsed.cachedAt > maxAgeMs
    ) {
      return null;
    }

    return parsed.data ?? null;
  } catch {
    return null;
  }
};

export const writeCachedValue = async <T>(key: string, data: T) => {
  try {
    const storage = await resolveStorage();
    if (!storage) return;

    const envelope: CacheEnvelope<T> = {
      cachedAt: Date.now(),
      data,
      version: 1,
    };
    await storage.setItem(buildKey(key), JSON.stringify(envelope));
  } catch {
    // Ignore cache write failures to keep UI responsive.
  }
};

export const removeCachedValue = async (key: string) => {
  try {
    const storage = await resolveStorage();
    if (!storage) return;
    await storage.removeItem(buildKey(key));
  } catch {
    // Ignore cache delete failures.
  }
};

export const removeCachedValuesByPrefix = async (keyPrefix: string) => {
  try {
    const storage = await resolveStorage();
    if (!storage) return;

    const fullPrefix = buildKey(keyPrefix);
    const allKeys = await storage.getAllKeys();
    const keysToDelete = allKeys.filter((key) => key.startsWith(fullPrefix));

    if (keysToDelete.length === 0) return;
    await storage.multiRemove(keysToDelete);
  } catch {
    // Ignore cache delete failures.
  }
};
