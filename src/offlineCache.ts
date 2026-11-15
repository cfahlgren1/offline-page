/** Resolves when a service worker stops installing: it's active, or it failed and was dropped. */
function settled(worker: ServiceWorker): Promise<void> {
  return new Promise((resolve) => {
    const check = () => {
      if (worker.state === "activated" || worker.state === "redundant") resolve();
    };
    worker.addEventListener("statechange", check);
    check();
  });
}

/**
 * Resolves once the offline cache is filled, or couldn't be, with whether the app now works offline. Never rejects, so
 * the models load either way. A page the service worker already serves doesn't wait: its cache is filled, and offline
 * the update check would only stall.
 */
export async function startOfflineCache(): Promise<boolean> {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return false;
  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker
      .register("./sw.js")
      .catch((error: unknown) => console.error("Offline cache update failed", error));
    return true;
  }
  try {
    const registration = await navigator.serviceWorker.register("./sw.js");
    const installing = registration.installing ?? registration.waiting;
    if (installing) await settled(installing);
    return !!registration.active;
  } catch (error) {
    console.error("Offline cache failed to start", error);
    return false;
  }
}
