export type ImageUploadSource = {
  uri: string;
  mimeType?: string | null;
  base64?: string | null;
};

export const getFileExtension = (uri: string, mimeType?: string | null) => {
  const mimeExtension = mimeType?.split("/")[1]?.toLowerCase();
  if (mimeExtension) {
    return mimeExtension === "jpeg" ? "jpg" : mimeExtension;
  }

  const clean = uri.split("?")[0];
  const lastDot = clean.lastIndexOf(".");
  if (lastDot !== -1) {
    const ext = clean.slice(lastDot + 1).toLowerCase();
    if (ext && ext.length <= 6) return ext;
  }

  return "jpg";
};

export const decodeBase64ToBytes = (value: string) => {
  const base64 = value
    .replace(/^data:[^;]+;base64,/, "")
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .replace(/\s/g, "");
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

  let padding = 0;
  if (base64.endsWith("==")) padding = 2;
  else if (base64.endsWith("=")) padding = 1;

  const byteLength = (base64.length * 3) / 4 - padding;
  const bytes = new Uint8Array(byteLength);
  let byteIndex = 0;

  for (let i = 0; i < base64.length; i += 4) {
    const c1 = alphabet.indexOf(base64[i] ?? "A");
    const c2 = alphabet.indexOf(base64[i + 1] ?? "A");
    const c3 =
      base64[i + 2] === "=" || base64[i + 2] == null
        ? 0
        : alphabet.indexOf(base64[i + 2]);
    const c4 =
      base64[i + 3] === "=" || base64[i + 3] == null
        ? 0
        : alphabet.indexOf(base64[i + 3]);

    const chunk = (c1 << 18) | (c2 << 12) | (c3 << 6) | c4;

    if (byteIndex < byteLength) bytes[byteIndex++] = (chunk >> 16) & 0xff;
    if (byteIndex < byteLength) bytes[byteIndex++] = (chunk >> 8) & 0xff;
    if (byteIndex < byteLength) bytes[byteIndex++] = chunk & 0xff;
  }

  return bytes;
};

export const readImageUriAsBlob = async (uri: string) => {
  try {
    const response = await fetch(uri);
    return await response.blob();
  } catch {
    // Some platforms return `content://` URIs which fetch() can't read.
    return await new Promise<Blob>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.onerror = () =>
        reject(new Error("Could not read image from device."));
      xhr.onload = () => resolve(xhr.response as Blob);
      xhr.responseType = "blob";
      xhr.open("GET", uri, true);
      xhr.send(null);
    });
  }
};
