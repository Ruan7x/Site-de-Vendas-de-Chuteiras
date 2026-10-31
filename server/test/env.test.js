import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadDotEnv } from "../config.js";

test(".env: ignora comentário no fim da linha e respeita aspas", () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "env-")), ".env");
  fs.writeFileSync(
    file,
    [
      "ADMIN_PASSWORD=ruan          # defina uma senha forte",
      "SESSION_SECRET= umteste          # string aleatória",
      "MP_ENV=sandbox   # sandbox | production",
      'QUOTED="minha #senha"   # comentário',
      "HASH=abc#def",
      "WHATSAPP_NUMBER= 5565999999999",
      "# COMENTADO=1",
    ].join("\r\n"),
  );
  const env = {};
  loadDotEnv(file, env);
  assert.deepEqual(env, {
    ADMIN_PASSWORD: "ruan",
    SESSION_SECRET: "umteste",
    MP_ENV: "sandbox",
    QUOTED: "minha #senha",
    HASH: "abc#def",
    WHATSAPP_NUMBER: "5565999999999",
  });
});
