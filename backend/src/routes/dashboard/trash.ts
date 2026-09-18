export const getUserTrashCollectionId = (userId: string): string =>
  `trash:${userId}`;

export const isTrashCollectionId = (
  collectionId: string | null | undefined,
  userId: string,
): boolean =>
  Boolean(collectionId) &&
  (collectionId === "trash" ||
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
