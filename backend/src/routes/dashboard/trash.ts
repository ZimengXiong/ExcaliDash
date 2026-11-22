export const LEGACY_TRASH_COLLECTION_ID = "trash";
export const TRASH_COLLECTION_PREFIX = "trash:";

export const getUserTrashCollectionId = (userId: string): string =>
  `${TRASH_COLLECTION_PREFIX}${userId}`;

export const isTrashCollectionId = (
  collectionId: string | null | undefined,
  userId: string,
): boolean =>
  Boolean(collectionId) &&
  (collectionId === LEGACY_TRASH_COLLECTION_ID ||
    collectionId === getUserTrashCollectionId(userId));

export const toInternalTrashCollectionId = (
  collectionId: string | null | undefined,
  userId: string,
): string | null | undefined =>
  collectionId === "trash" ? getUserTrashCollectionId(userId) : collectionId;

export const toPublicTrashCollectionId = (
  collectionId: string | null | undefined,
  userId: string,
): string | null | undefined =>
  isTrashCollectionId(collectionId, userId) ? "trash" : collectionId;
