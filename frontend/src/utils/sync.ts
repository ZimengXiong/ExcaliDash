const toFiniteNumber = (value: unknown): number => {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : 0;
};

const asString = (value: unknown): string =>
  typeof value === "string" ? value : "";

// Flatten every point so moving an interior point (with unchanged bounds and
// endpoints) still registers as a content change.
const flattenPoints = (points: readonly unknown[]): number[] => {
  const flat: number[] = [];
  for (const point of points) {
    const pair = Array.isArray(point) ? point : [];
    flat.push(toFiniteNumber(pair[0]), toFiniteNumber(pair[1]));
  }
  return flat;
};

const pointsMatch = (
  previous: readonly number[],
  points: readonly unknown[],
): boolean => {
  if (previous.length !== points.length * 2) return false;
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const pair = Array.isArray(point) ? point : [];
    if (
      previous[index * 2] !== toFiniteNumber(pair[0]) ||
      previous[index * 2 + 1] !== toFiniteNumber(pair[1])
    ) {
      return false;
    }
  }
  return true;
};

// Copy the fields that can change in-place without a version bump. Plain
// values let the next frame compare them without allocating a signature.
export const snapshotElementContent = (element: any) => {
  return {
    type: asString(element.type),
    isDeleted: Boolean(element.isDeleted),
    status: asString(element.status),
    x: toFiniteNumber(element.x),
    y: toFiniteNumber(element.y),
    width: toFiniteNumber(element.width),
    height: toFiniteNumber(element.height),
    angle: toFiniteNumber(element.angle),
    fileId: asString(element.fileId),
    text: asString(element.text),
    points: Array.isArray(element.points)
      ? flattenPoints(element.points)
      : null,
  };
};

export const matchesElementContent = (
  previous: ReturnType<typeof snapshotElementContent>,
  element: any,
  status: unknown = element.status,
): boolean => {
  if (
    previous.type !== asString(element.type) ||
    previous.isDeleted !== Boolean(element.isDeleted) ||
    previous.status !== asString(status) ||
    previous.x !== toFiniteNumber(element.x) ||
    previous.y !== toFiniteNumber(element.y) ||
    previous.width !== toFiniteNumber(element.width) ||
    previous.height !== toFiniteNumber(element.height) ||
    previous.angle !== toFiniteNumber(element.angle) ||
    previous.fileId !== asString(element.fileId) ||
    previous.text !== asString(element.text)
  ) {
    return false;
  }
  if (!Array.isArray(element.points)) return previous.points === null;
  return (
    previous.points !== null && pointsMatch(previous.points, element.points)
  );
};

export const reconcileElements = (
  localElements: readonly any[],
  remoteElements: readonly any[],
  localAppState?: any,
  preferLocalOnEqual = false,
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

  remoteElements.forEach((remoteEl) => {
    const localEl = localMap.get(remoteEl.id);

    if (!localEl) {
      localMap.set(remoteEl.id, remoteEl);
      return;
    }

    if (
      localEl.id === localAppState?.editingTextElement?.id ||
      localEl.id === localAppState?.resizingElement?.id ||
      localEl.id === localAppState?.newElement?.id
    ) {
      return;
    }

    const remoteVersion = getVersion(remoteEl);
    const localVersion = getVersion(localEl);
    if (remoteVersion !== localVersion) {
      if (remoteVersion > localVersion) localMap.set(remoteEl.id, remoteEl);
      return;
    }

    // Excalidraw resolves concurrent versions by the lowest nonce. Arrival
    // order and peers' wall clocks must not make equal-version edits diverge.
    const remoteNonce = getVersionNonce(remoteEl);
    const localNonce = getVersionNonce(localEl);
    if (remoteNonce !== localNonce) {
      if (remoteNonce < localNonce) localMap.set(remoteEl.id, remoteEl);
      return;
    }

    const remoteUpdated = getUpdated(remoteEl);
    const localUpdated = getUpdated(localEl);
    if (remoteUpdated !== localUpdated) {
      if (remoteUpdated > localUpdated) localMap.set(remoteEl.id, remoteEl);
      return;
    }

    // An HTTP snapshot may predate a live interaction with equal metadata.
    // Socket frames still accept changing content in their delivery order.
    if (preferLocalOnEqual) return;

    // If the metadata says "equal" but content differs, accept the remote element.
    // This enables live shape creation/move frames that don't bump version fields.
    if (!matchesElementContent(snapshotElementContent(localEl), remoteEl)) {
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
