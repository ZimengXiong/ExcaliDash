import React from "react";
import { Check } from "lucide-react";
import clsx from "clsx";
import type { Collection } from "../../types";
import { useLocale } from "../../context/useLocale";

interface CollectionMoveOptionsProps {
  collections: Collection[];
  currentCollectionId: string | null;
  drawingId: string;
  onMoveToCollection: (id: string, collectionId: string | null) => void;
  onDone: () => void;
  optionClassName: string;
  selectedClassName: string;
  unselectedClassName: string;
  checkSize: number;
}

export const CollectionMoveOptions: React.FC<CollectionMoveOptionsProps> = ({
  collections,
  currentCollectionId,
  drawingId,
  onMoveToCollection,
  onDone,
  optionClassName,
  selectedClassName,
  unselectedClassName,
  checkSize,
}) => {
  const { t } = useLocale();
  const moveToCollection = (collectionId: string | null) => {
    onMoveToCollection(drawingId, collectionId);
    onDone();
  };

  return (
    <>
      <button
        data-testid="collection-option-unorganized"
        onClick={() => moveToCollection(null)}
        className={clsx(
          optionClassName,
          currentCollectionId === null
            ? selectedClassName
            : unselectedClassName,
        )}
      >
        {t("sidebar.unorganized")}{" "}
        {currentCollectionId === null && <Check size={checkSize} />}
      </button>
      {collections.map((collection) => (
        <button
          key={collection.id}
          data-testid={`collection-option-${collection.id}`}
          onClick={() => moveToCollection(collection.id)}
          className={clsx(
            optionClassName,
            currentCollectionId === collection.id
              ? selectedClassName
              : unselectedClassName,
          )}
        >
          <span className="truncate">{collection.name}</span>
          {currentCollectionId === collection.id && <Check size={checkSize} />}
        </button>
      ))}
    </>
  );
};
