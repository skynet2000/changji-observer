// Run on the server inside the api container. Uses its existing receipt and total-budget controls.
import { ModelOutputError } from "@aihot/backend/providers/llm";
import { closeDb } from "@aihot/backend/db";
import { translateNextBatch } from "../server.ts";
const limit = Number(process.argv.find(arg => arg.startsWith("--batches="))?.split("=")[1] ?? 1);
if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error("Use --batches=1..500");
let consecutiveFailures = 0;
try {
  for (let batch = 1; batch <= limit; batch++) {
    try {
      const result = await translateNextBatch();
      consecutiveFailures = 0;
      console.log(JSON.stringify({ batch, ...result }));
      if (!result.translated && !("failed" in result && result.failed)) break;
    } catch (error) {
      // A rejected malformed response is safe to retry once. Budget/unknown outcomes must stop.
      if (!(error instanceof ModelOutputError) || consecutiveFailures++ >= 1) throw error;
      console.error(JSON.stringify({ batch, retryingRejectedOutput: true, receiptId: error.receiptId }));
    }
  }
} finally { await closeDb(); }
