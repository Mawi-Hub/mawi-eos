// Barrera de privacidad del resumen para toda la empresa.
//
// El filtro real es una lista explícita de campos: el snapshot solo se arma
// con win, challenge, sharedSummary, acuerdos y métricas. Esta capa añade dos
// protecciones sobre el TEXTO que sí pasa:
//   1. screenSensitive: detecta salud, compensación, evaluaciones, vida
//      personal y confidencial; lo detectado se excluye y no se puede forzar.
//   2. neutralizeSlack: quita menciones masivas y escapa markup para que un
//      mensaje no pueda notificar a toda la empresa ni inyectar enlaces.
// Los textos son datos: nada de lo que digan cambia destinos ni publica.

export type SensitiveCategory =
  | "salud"
  | "compensacion"
  | "evaluacion"
  | "personal"
  | "confidencial"
  | "journal";

const PATTERNS: Array<{ category: SensitiveCategory; re: RegExp }> = [
  {
    category: "salud",
    re: /\b(salud|enferm\w*|m[eé]dic[oa]s?|doctor(a)?|hospital\w*|cirug[ií]a|diagn[oó]stic\w*|incapacidad|terapia|psic[oó]log\w*|psiquiatr\w*|depresi[oó]n|ansiedad|burn.?out|embarazo|covid|sick|illness|therapy|anxiety|depress\w*|pregnan\w*|surgery)\b/i,
  },
  {
    category: "compensacion",
    re: /\b(salario|sueldo|compensaci[oó]n|aumento (de )?(salario|sueldo)|bono|payroll|planilla|raise|salary|compensation|bonus|equity|stock options?)\b/i,
  },
  {
    category: "evaluacion",
    re: /\b(evaluaci[oó]n de (desempe[nñ]o|rendimiento)|desempe[nñ]o (bajo|pobre|malo)|performance review|plan de mejora|\bPIP\b|despid\w*|despedir|renuncia\w*|llamado de atenci[oó]n|amonestaci[oó]n|fired|terminate[d]?|resign\w*)\b/i,
  },
  {
    category: "personal",
    re: /\b(divorcio|separaci[oó]n|funeral|fallecimiento|falleci[oó]|duelo|mi (esposa|esposo|pareja|hij[oa]|mam[aá]|pap[aá]|familia)|problemas? (familiar\w*|personal\w*)|asunto(s)? personal\w*|vida personal|personal matter|family (issue|emergency)|my (wife|husband|kid|mom|dad))\b/i,
  },
  { category: "confidencial", re: /\b(confidencial|no compartir|solo (para )?management|privado|private|confidential|nda)\b/i },
  { category: "journal", re: /\b(journal|diario (del|de la) ceo|mi diario)\b/i },
];

export function screenSensitive(text: string | null | undefined): { sensitive: boolean; categories: SensitiveCategory[] } {
  if (!text) return { sensitive: false, categories: [] };
  const categories = PATTERNS.filter((p) => p.re.test(text)).map((p) => p.category);
  return { sensitive: categories.length > 0, categories };
}

// Menciones y markup de Slack fuera: <!channel>, <!here>, <!everyone>,
// <@U123>, <#C123|canal>, <https://x|etiqueta> → texto plano seguro.
export function neutralizeSlack(text: string): string {
  return text
    .replace(/<!(channel|here|everyone)(\|[^>]*)?>/gi, "")
    .replace(/<@[A-Z0-9]+(\|[^>]*)?>/g, "")
    .replace(/<#[A-Z0-9]+\|([^>]*)>/g, "#$1")
    .replace(/<#[A-Z0-9]+>/g, "")
    .replace(/<(https?:\/\/[^|>\s]+)\|([^>]*)>/g, "$2 ($1)")
    .replace(/<(https?:\/\/[^>\s]+)>/g, "$1")
    .replace(/(^|\s)@(channel|here|everyone)\b/gi, "$1")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\s+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

// Resumen de una línea para una contribución: sin saltos, con tope de largo.
export function oneLine(text: string, max = 280): string {
  const flat = neutralizeSlack(text).replace(/\s*\n+\s*/g, " ").trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max - 1).trimEnd()}…`;
}
