export const reconcileElements = (
  localElements: readonly any[],
  remoteElements: readonly any[]
): any[] => {
  const localMap = new Map<string, any>();

  // Index local elements
  localElements.forEach((el) => {
    localMap.set(el.id, el);
  });

  // Merge remote elements
  // Prefer version + updated timestamp to determine ordering; nonces are random.
  const getVersion = (element: any) => element?.version ?? 0;
  const getVersionNonce = (element: any) => element?.versionNonce ?? 0;
  const getUpdated = (element: any) => {
    const value = element?.updated;
    return typeof value === "number" ? value : Number(value) || 0;
  };
  const getComparableContent = (element: any): string => {
    if (!element || typeof element !== "object") return "";
    const copy = { ...element } as Record<string, unknown>;
    delete copy.version;
    delete copy.versionNonce;
    delete copy.updated;
    return JSON.stringify(copy);
  };

  remoteElements.forEach((remoteEl) => {
    const localEl = localMap.get(remoteEl.id);

    if (!localEl) {
      localMap.set(remoteEl.id, remoteEl);
      return;
    }

    const remoteVersion = getVersion(remoteEl);
    const localVersion = getVersion(localEl);

    if (remoteVersion > localVersion) {
      localMap.set(remoteEl.id, remoteEl);
      return;
    }

    if (remoteVersion < localVersion) {
      return;
    }

    const remoteUpdated = getUpdated(remoteEl);
    const localUpdated = getUpdated(localEl);

    if (remoteUpdated > localUpdated) {
      localMap.set(remoteEl.id, remoteEl);
      return;
    }

    if (
      remoteUpdated === localUpdated &&
      getVersionNonce(remoteEl) !== getVersionNonce(localEl)
    ) {
      localMap.set(remoteEl.id, remoteEl);
      return;
    }

    if (
      remoteUpdated === localUpdated &&
      getVersionNonce(remoteEl) === getVersionNonce(localEl) &&
      getComparableContent(remoteEl) !== getComparableContent(localEl)
    ) {
      localMap.set(remoteEl.id, remoteEl);
    }

  });

  return Array.from(localMap.values());
};
