export const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () =>
      reject(reader.error ?? new Error("Failed to read blob"));
    reader.readAsDataURL(blob);
  });

const BASE64_CHUNK_SIZE = 512 * 1024;

const decodeBase64 = (payload: string): Uint8Array<ArrayBuffer> => {
  const array = Uint8Array as typeof Uint8Array & {
    fromBase64?: (data: string) => Uint8Array<ArrayBuffer>;
  };
  if (array.fromBase64) return array.fromBase64(payload);

  const decoded = atob(payload);
  const bytes = new Uint8Array(decoded.length);
  for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i);
  return bytes;
};

export const dataUrlToBlob = async (dataURL: string): Promise<Blob | null> => {
  const header = /^data:([^;,]*)(;base64)?,/.exec(dataURL);
  if (!header) return null;
  const type = header[1] || "application/octet-stream";
  const start = header[0].length;
  try {
    if (!header[2]) {
      return new Blob([decodeURIComponent(dataURL.slice(start))], { type });
    }

    // The production CSP blocks fetch(data:). Decode bounded chunks and yield
    // between them so large uploads leave time for input and paint.
    const parts: Blob[] = [];
    let tail = "";
    for (
      let offset = start;
      offset < dataURL.length;
      offset += BASE64_CHUNK_SIZE
    ) {
      const end = offset + BASE64_CHUNK_SIZE;
      const chunk =
        tail + dataURL.slice(offset, end).replace(/[ \t\n\f\r]/g, "");
      if (end >= dataURL.length) {
        parts.push(new Blob([decodeBase64(chunk)]));
        break;
      }
      // Keep partial quartets and padding for the final decode.
      const padding = chunk.indexOf("=");
      const unpaddedLength = padding < 0 ? chunk.length : padding;
      const length = unpaddedLength - (unpaddedLength % 4);
      tail = chunk.slice(length);
      if (tail.length > 4) return null;
      if (length > 0)
        parts.push(new Blob([decodeBase64(chunk.slice(0, length))]));
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    return new Blob(parts, { type });
  } catch {
    return null;
  }
};
