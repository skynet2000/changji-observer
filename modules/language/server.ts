import { createHash } from "node:crypto";
import { z } from "zod";
import { sql } from "@aihot/backend/db";
import { config } from "@aihot/backend/config";
import type { ServerModule } from "@aihot/backend/modules";
import { cached, cachedByKey } from "@aihot/backend/lib/cache";
import { publicTextValues } from "@aihot/backend/publication/texts";
import { chatJson } from "@aihot/backend/providers/llm";
import { completeReceipt } from "@aihot/backend/providers/receipts";
import { shutdownSignal } from "@aihot/backend/jobs/queue";
import { englishUi } from "./ui.ts";
import ui from "./ui-source.json" with { type: "json" };

export const hashText = (text: string) => createHash("sha256").update(text).digest("hex");
const publicTexts = cached(async () => new Set([...ui, ...await publicTextValues()]), { freshMs: 30_000, maxStaleMs: 30_000 });
const uiSet = new Set(ui);
const lookupScope = cachedByKey<string[], Set<string>>(texts => hashText(JSON.stringify([...texts].sort())), async texts => {
  const content = texts.filter(text => !uiSet.has(text));
  return new Set([...texts.filter(text => uiSet.has(text)), ...(content.length ? await publicTextValues(content) : [])]);
}, { freshMs: 30_000, maxStaleMs: 30_000, maxKeys: 200 });
const Output = z.object({ translations: z.array(z.string().max(30000)) }).strict();
export function validTranslations(source: string[], translated: string[]) {
  if (source.length !== translated.length) return false;
  return translated.every((text, i) => {
    if (!text.trim() || /<\/?(?:script|iframe|style)\b/i.test(text)) return false;
    // Version numbers, dates, amounts and placeholder tokens must survive translation exactly.
    const protectedTokens = /\{\{\d+\}\}|https?:\/\/[^\s]+|\d+(?:[.,:/-]\d+)*/g;
    const tokens = source[i]!.match(protectedTokens) ?? [];
    const available: string[] = [...(text.match(protectedTokens) ?? [])];
    return tokens.every(token => {
      const at = available.indexOf(token);
      if (at < 0) return false;
      available.splice(at, 1); return true;
    });
  });
}

export async function translateNextBatch() {
  if (shutdownSignal.signal.aborted) return { translated: 0 };
  const texts = [...await publicTexts.get()];
  const existing = new Map((await sql`SELECT source_hash, english, attempts, retry_after FROM language_texts`).map(r => [r.source_hash, r]));
  const batch: string[] = [];
  let size = 0;
  for (const text of texts) {
    const previous = existing.get(hashText(text));
    if (englishUi[text] || previous && (previous.english !== null || previous.attempts >= 3 || previous.retry_after && previous.retry_after.getTime() > Date.now())) continue;
    if (size + text.length > 2200 && batch.length) break;
    batch.push(text); size += text.length;
    if (size >= 2200 || batch.length >= 40) break;
  }
  if (!batch.length) return { translated: 0 };
  const attempts = batch.map(text => existing.get(hashText(text))?.attempts ?? 0);
  const result = await chatJson({ attemptTag: hashText(JSON.stringify(attempts)), model: "deepseek-flash", purpose: "language.english", subject: hashText(JSON.stringify(batch)),
    promptVersion: "english-v1", temperature: 0, maxTokens: 4096, timeoutMs: 180000,
    system: "Translate each Chinese text into clear English for readers following internet companies and careers. Return JSON {\"translations\":[...]} in exactly the input order, one string per input. Translate faithfully: no additions, commentary, factual corrections or combining entries. Keep all names, URLs, digits (including version numbers, dates, amounts), and {{number}} placeholders exactly. Plain text only; do not generate HTML. For UI labels use concise natural English. Preserve disputed allegations as allegations, and empty-issue notices as empty-issue notices.",
    user: JSON.stringify(batch), schema: Output.refine(out => out.translations.length === batch.length, "Translation lost entries") });
  let translated = 0;
  await sql.begin(async tx => {
    for (const [i, source] of batch.entries()) {
      const english = validTranslations([source], [result.data.translations[i]!]) ? result.data.translations[i]! : null;
      if (english !== null) translated++;
      await tx`INSERT INTO language_texts (source_hash, source, english, receipt_id, attempts, retry_after)
        VALUES (${hashText(source)},${source},${english},${result.receiptId},${attempts[i]! + 1},${english === null ? new Date(Date.now() + 86400000) : null})
        ON CONFLICT (source_hash) DO UPDATE SET english=EXCLUDED.english, receipt_id=EXCLUDED.receipt_id, attempts=EXCLUDED.attempts, retry_after=EXCLUDED.retry_after`;
    }
    await completeReceipt(tx, result.receiptId);
  });
  return { translated, failed: batch.length - translated };
}

const language: ServerModule = {
  name: "language",
  http(app) {
    app.post("/api/language/lookup", { bodyLimit: 128 * 1024 }, async (req, reply) => {
      reply.header("Cache-Control", "no-store");
      const parsed = z.object({ texts: z.array(z.string().max(20000)).max(64) }).strict().safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: "invalid_texts" });
      // This reads saved translations only. Arbitrary visitor text never reaches a model or a queue.
      const allowed = await lookupScope(parsed.data.texts);
      const requested = [...new Set(parsed.data.texts)].filter(text => allowed.has(text));
      if (!requested.length) return { translations: {} };
      const rows = await sql`SELECT source, english FROM language_texts WHERE source_hash=ANY(${requested.map(hashText)}::text[]) AND english IS NOT NULL`;
      return { translations: Object.fromEntries(rows.filter(r => requested.includes(r.source)).map(r => [r.source, r.english])) };
    });
  },
  schedules: [{ name: "language.translate", cron: "17 */2 * * *", when: () => config.modelCallsEnabled,
    run: translateNextBatch }],
};
export default language;
