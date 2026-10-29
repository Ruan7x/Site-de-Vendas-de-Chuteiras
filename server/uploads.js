import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { HttpError } from "./orders.js";

const SIGNATURES = {
  "image/png": { ext: "png", test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  "image/jpeg": { ext: "jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  "image/webp": { ext: "webp", test: (b) => b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP" },
  "image/gif": { ext: "gif", test: (b) => b.subarray(0, 3).toString() === "GIF" },
};
const MAX_BYTES = 4 * 1024 * 1024;

/** Decodifica e valida (tipo declarado + assinatura real do arquivo) uma imagem em data URL. */
export function decodeDataUrlImage(dataUrl, maxBytes = MAX_BYTES) {
  const m = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl || "");
  if (!m) throw new HttpError(422, "invalid_image", "Imagem inválida. Use PNG, JPG, WEBP ou GIF.");
  const buf = Buffer.from(m[2], "base64");
  if (buf.length === 0 || buf.length > maxBytes)
    throw new HttpError(422, "image_too_large", `Cada imagem deve ter até ${Math.round(maxBytes / 1024 / 1024)} MB.`);
  const sig = SIGNATURES[m[1]];
  if (!sig.test(buf)) throw new HttpError(422, "invalid_image", "O arquivo não corresponde a uma imagem válida.");
  return { buf, ext: sig.ext };
}

/** Grava a imagem com nome aleatório e devolve só o nome do arquivo. */
export function writeImage({ buf, ext }, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const name = `${crypto.randomBytes(12).toString("hex")}.${ext}`;
  fs.writeFileSync(path.join(dir, name), buf);
  return name;
}

/** Imagens do catálogo (admin): validadas, gravadas e devolvidas como caminho público. */
export function saveDataUrlImage(dataUrl, dir) {
  return `/uploads/${writeImage(decodeDataUrlImage(dataUrl), dir)}`;
}

export const IMAGE_NAME_RE = /^[0-9a-f]{24}\.(png|jpg|webp|gif)$/;
