const S3_DELETE_CONCURRENCY = 8;

export const deleteS3KeysInBatches = async ({
  keys,
  logPrefix,
  deleteObject,
}: {
  keys: string[];
  logPrefix: string;
  deleteObject: (key: string) => Promise<unknown>;
}) => {
  let deleted = 0;
  let errors = 0;
  const deletedKeys: string[] = [];
  const failedKeys: string[] = [];

  for (let i = 0; i < keys.length; i += S3_DELETE_CONCURRENCY) {
    const batch = keys.slice(i, i + S3_DELETE_CONCURRENCY);
    const results = await Promise.allSettled(batch.map((key) => deleteObject(key)));

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      if (result.status === "fulfilled") {
        deleted++;
        deletedKeys.push(batch[j]);
      } else {
        console.error(`${logPrefix} Failed to delete S3 object: ${batch[j]}`, result.reason);
        errors++;
        failedKeys.push(batch[j]);
      }
    }
  }

  return { deleted, errors, deletedKeys, failedKeys };
};
