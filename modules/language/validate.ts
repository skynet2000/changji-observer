// Compare values rather than spelling: 500万元 = 5 million yuan; 10月 = October.
const months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const words: Record<string, number> = { zero: 0, one: 1, once: 1, two: 2, twice: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
const powers: Record<string, number> = { 万: 4, 亿: 8, 万亿: 12, hundred: 2, thousand: 3, million: 6, billion: 9, trillion: 12 };
function numbers(text: string, english = false): string[] {
  if (english) {
    text = text.replace(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/g, word => String(months.indexOf(word.toLowerCase()) + 1));
    text = text.replace(/\b(zero|one|once|two|twice|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/gi, word => String(words[word.toLowerCase()]));
  }
  const out: string[] = [];
  const pattern = /\d+(?:,\d{3})*(?:\.\d+)?(?:\s*(万亿|亿|万|hundred|thousand|million|billion|trillion))?/gi;
  for (const match of text.matchAll(pattern)) {
    const digits = match[0].match(/^\d+(?:,\d{3})*(?:\.\d+)?/)![0].replaceAll(",", "");
    const [integer, fraction = ""] = digits.split(".");
    // Exact decimal arithmetic, including values beyond floating-point integer precision.
    let coefficient = BigInt(integer + fraction), scale = (powers[match[1]?.toLowerCase() ?? ""] ?? 0) - fraction.length;
    while (coefficient !== 0n && coefficient % 10n === 0n) { coefficient /= 10n; scale++; }
    out.push(coefficient === 0n ? "0" : `${coefficient}e${scale}`);
  }
  return out;
}
export function validTranslations(source: string[], translated: string[]) {
  if (source.length !== translated.length) return false;
  return translated.every((text, i) => {
    if (!text.trim() || /<\/?(?:script|iframe|style)\b/i.test(text)) return false;
    const original = source[i]!;
    const markers = original.match(/\{\{\d+\}\}|https?:\/\/[^\s]+/g) ?? [];
    const returnedMarkers: string[] = [...(text.match(/\{\{\d+\}\}|https?:\/\/[^\s]+/g) ?? [])];
    if (!markers.every(marker => { const at = returnedMarkers.indexOf(marker); if (at < 0) return false; returnedMarkers.splice(at, 1); return true; })) return false;
    const versions: string[] = [...(text.toLowerCase().match(/\bv\d+(?:\.\d+)+/g) ?? [])];
    if (!(original.toLowerCase().match(/\bv\d+(?:\.\d+)+/g) ?? []).every(version => versions.includes(version))) return false;
    const available = numbers(text, true);
    return numbers(original).every(token => {
      const at = available.indexOf(token);
      if (at < 0) return false;
      available.splice(at, 1); return true;
    });
  });
}
