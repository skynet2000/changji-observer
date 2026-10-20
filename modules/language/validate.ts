// Compare values rather than spelling: 500万元 = 5 million yuan; 10月 = October.
const months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const words: Record<string, number> = { zero: 0, one: 1, once: 1, two: 2, twice: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
const powers: Record<string, number> = { 万: 4, 亿: 8, 万亿: 12, hundred: 2, megapixel: 6, megapixels: 6, thousand: 3, million: 6, billion: 9, trillion: 12 };
function numbers(text: string, english = false): string[] {
  if (english) {
    text = text.replace(/(\d{1,2}):(\d{2})\s*([ap])\.?m\.?/gi, (_, h, m, period) => `${Number(h) % 12 + (period.toLowerCase() === "p" ? 12 : 0)}:${m}`);
    text = text.replace(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\b\.?/g, word => String(months.findIndex(month => month.startsWith(word.slice(0, 3).toLowerCase())) + 1));
    text = text.replace(/\b(zero|one|once|two|twice|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/gi, word => String(words[word.toLowerCase()]));
  }
  // "5 million-dollar offers" counts offers; "5-million-dollar offer" names an amount.
  text = text.replace(/(\d+)\s+(?:million|billion)-dollar(?:-level)?\s+(?:offers|deals|contracts|jobs|positions)\b/gi, "$1 offers");
  text = text.replace(/(\d+(?:\.\d+)?)[-‐‑](hundred|thousand|million|billion|trillion|megapixels?)\b/gi, "$1 $2");
  const out: string[] = [];
  const pattern = /\d+(?:,\d{3})*(?:\.\d+)?(?:\s*(万亿|亿|万|hundred|thousand|million|billion|trillion|megapixels?))?/gi;
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
    let numericSource = original;
    if (/\bAAA\b/.test(text)) numericSource = numericSource.replace(/(?<![A-Za-z0-9])3A(?![A-Za-z0-9])/g, "AAA");
    numericSource = numericSource.replace(/(\d+(?:\.\d+)?)\s*(或|至|到|—|～|~|-)\s*(\d+(?:\.\d+)?)\s*(万亿|亿|万)/g, "$1$4$2$3$4");
    numericSource = numericSource.replace(/(\d+(?:\.\d+)?)\s*折/g, (raw, n) => {
      const value = Number(n); if (value < 0 || value > 10) return raw;
      return `${(text.match(/\boff\b|discount/i) ? 100 - value * 10 : value * 10).toFixed(6)}%`;
    });
    let numericOutput = text;
    if (/周|消费|消耗|补偿|日期|期间/.test(original)) {
      const compactDates = (value: string) => value.replace(/\b(1[0-2]|0?[1-9])\.(0?[1-9]|[12]\d|3[01])[-–](1[0-2]|0?[1-9])\.(0?[1-9]|[12]\d|3[01])\b/g,
        (_, m, d, endMonth, endDay) => `${m} ${d} ${Number(m) === Number(endMonth) ? "" : endMonth} ${endDay}`);
      numericSource = compactDates(numericSource); numericOutput = compactDates(numericOutput);
    }
    const available = numbers(numericOutput, true);
    return numbers(numericSource).every(token => {
      const at = available.indexOf(token);
      if (at < 0) return false;
      available.splice(at, 1); return true;
    });
  });
}
