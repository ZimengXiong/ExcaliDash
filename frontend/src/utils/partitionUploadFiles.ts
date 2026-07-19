export const partitionUploadFiles = (files: File[]) => {
  const supported: File[] = [];
  const unsupported: File[] = [];
  for (const file of files) {
    if (file.name.toLowerCase().endsWith(".excalidash")) supported.push(file);
    else unsupported.push(file);
  }
  return { supported, unsupported };
};
