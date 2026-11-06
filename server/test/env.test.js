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

test("Render: usa RENDER_EXTERNAL_URL quando PUBLIC_URL está vazia", async () => {
  const { loadConfig } = await import("../config.js");
  const c = loadConfig({ RENDER_EXTERNAL_URL: "https://tn-sports.onrender.com", PUBLIC_URL: "" });
  assert.equal(c.publicUrl, "https://tn-sports.onrender.com");
  assert.equal(c.webhookReachable, true);
  assert.equal(c.secureCookies, true);
  assert.equal(loadConfig({ RENDER_EXTERNAL_URL: "https://x.onrender.com", PUBLIC_URL: "https://tnsports.com.br" }).publicUrl, "https://tnsports.com.br");
});
