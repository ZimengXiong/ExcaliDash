export const reconcileElements = (
  localElements: readonly any[],
  remoteElements: readonly any[],
): any[] => {
  const localMap = new Map<string, any>();

  localElements.forEach((el) => {
    localMap.set(el.id, el);
  });

  const getVersion = (element: any) => element?.version ?? 0;
  const getVersionNonce = (element: any) => element?.versionNonce ?? 0;
  const getUpdated = (element: any) => {
    const value = element?.updated;
    return typeof value === "number" ? value : Number(value) || 0;
  };

  const toFiniteNumber = (value: any): number => {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  };

  // Tie-breaker signature when version metadata doesn't change during live interactions.
  const getContentSig = (element: any): string => {
    if (!element || typeof element !== "object") return "";
    const type = typeof element.type === "string" ? element.type : "";
    const isDeleted = element.isDeleted ? "1" : "0";
    const status = typeof element.status === "string" ? element.status : "";
    const x = toFiniteNumber(element.x);
    const y = toFiniteNumber(element.y);
    const w = toFiniteNumber(element.width);
    const h = toFiniteNumber(element.height);
    const angle = toFiniteNumber(element.angle);
    let pointsSig = "";
    if (Array.isArray(element.points)) {
      const pts = element.points as any[];
      const len = pts.length;
      const last = len > 0 ? pts[len - 1] : null;
      const lastX = Array.isArray(last) ? toFiniteNumber(last[0]) : 0;
      const lastY = Array.isArray(last) ? toFiniteNumber(last[1]) : 0;
      pointsSig = `p${len}:${lastX},${lastY}`;
    }
    const text = typeof element.text === "string" ? element.text : "";
    const textSig = text ? `t${text.length}:${text.slice(0, 64)}` : "";
    const fileId = typeof element.fileId === "string" ? element.fileId : "";
    return `${type}|${isDeleted}|${status}|${x}|${y}|${w}|${h}|${angle}|${pointsSig}|${fileId}|${textSig}`;
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

    // If the metadata says "equal" but content differs, accept the remote element.
    // This enables live shape creation/move frames that don't bump version fields.
    if (
      remoteVersion === localVersion &&
      remoteUpdated === localUpdated &&
      getVersionNonce(remoteEl) === getVersionNonce(localEl) &&
      getContentSig(remoteEl) !== getContentSig(localEl)
    ) {
      localMap.set(remoteEl.id, remoteEl);
    }
  });

  return Array.from(localMap.values());
};

export const applyElementOrder = (
  elements: readonly any[],
  elementOrder: readonly string[] | undefined | null,
): any[] => {
  if (!Array.isArray(elementOrder) || elementOrder.length === 0)
    return [...elements];

  const byId = new Map<string, any>();
  for (const el of elements) {
    if (el && typeof el.id === "string") byId.set(el.id, el);
  }

  const ordered: any[] = [];
  const seen = new Set<string>();

  for (const id of elementOrder) {
    const el = byId.get(id);
    if (!el) continue;
    ordered.push(el);
    seen.add(id);
  }

  // Preserve any elements not mentioned in the remote ordering (e.g. local-only elements)
  // by appending them in their existing order.
  for (const el of elements) {
    const id = el?.id;
    if (typeof id !== "string") continue;
    if (seen.has(id)) continue;
    ordered.push(el);
  }

  return ordered;
};
