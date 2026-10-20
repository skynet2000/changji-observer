// Run on the server inside the api container. Uses its existing receipt and total-budget controls.
import { closeDb } from "@aihot/backend/db";
import { translateNextBatch } from "../server.ts";
const limit = Number(process.argv.find(arg => arg.startsWith("--batches="))?.split("=")[1] ?? 1);
if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error("Use --batches=1..500");
try {
  for (let batch = 1; batch <= limit; batch++) {
    const result = await translateNextBatch();
    console.log(JSON.stringify({ batch, ...result }));
    if (!result.translated && !("failed" in result && result.failed)) break;
  }
} finally { await closeDb(); }
