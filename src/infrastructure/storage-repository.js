export function createStorageRepository(storage = globalThis.localStorage) {
  if (!storage) throw new Error("El almacenamiento local no está disponible.");

  return {
    getItem: (key) => storage.getItem(key),
    setItem: (key, value) => storage.setItem(key, value),
    removeItem: (key) => storage.removeItem(key),
  };
}
