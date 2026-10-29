// Sobe o backend (3001) e o front (5173) juntos. Ctrl+C encerra os dois.
import { spawn } from "node:child_process";

const run = (name, args) => {
  const p = spawn(process.execPath, args, { stdio: "inherit" });
  p.on("exit", (code) => {
    if (code) console.error(`[${name}] saiu com código ${code}`);
    for (const c of children) c.kill();
    process.exit(code ?? 0);
  });
  return p;
};
const children = [
  run("api", ["--watch", "server/index.js"]),
  run("web", ["node_modules/vite/bin/vite.js"]),
];
