import { getDocumentProxy } from "unpdf";
import type { StructuredIngredient, StructuredMeal, StructuredMealOption, StructuredPlan } from "@/lib/types";
import { categoryFor, normalize } from "@/lib/domain/nutrition";

export type ExtractOptions = {
  alGustoDefaults?: Record<string, { quantity: number; unit: string }>;
  excludedAlGusto?: string[];
};

type Row = { page: number; y: number; items: { x: number; width: number; text: string }[] };
type Line = { left: string; right: string; full: string; items: Row["items"] };

const MEAL_RE = /^(pre[\s-]?entreno|post[\s-]?entreno|desayuno|colaci[oó]n|comida|almuerzo|merienda|cena)\b/i;
const MEALS_END_RE = /^(mis\s+equivalentes|tabla\s+de\s+equivalentes|equivalentes|recomendaciones)/i;
const CHOOSE_RE = /^opci[oó]n(?:es)?\s+a\s+elegir\s*:?\s*(.*)$/i;
const OPTION_RE = /^opci[oó]n\s*(\d+|[a-z](?=\s*[:.)]))?\s*[:.)]?\s*(.*)$/i;
const COMPLEMENT_RE = /^(?:para\s+)?acompa[nñ]a(?:r|n)?\s+(?:a\s+)?(?:todos\s+|todas\s+)?(?:tus|sus|los|las)\s+[a-záéíóúñ]+\s+con\b[\s.:]*(.*)$/i;
const INSTRUCTION_RE = /^(para\s+cocinar|al\s+sart[eé]n|a\s+cada|sofre[ií]r|distribuir|cortar|cortad[oa]|rebanar|pesar|puedes|usar|endulzar|acompa[nñ]ar|agregar|mezclar|licuar|servir|hervir|cocinar|asar|calentar|evita|no\s+)/i;

const NUM = String.raw`(?:\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?)`;
const QTY = String.raw`(${NUM})(?:\s*(o|a|ó|-)\s*(${NUM}))?`;
const UNIT = String.raw`(piezas?|pzas?|tazas?|cucharaditas?|cucharadas?|rebanadas?|vasos?|gramos?|grs?|g|kg|mililitros?|ml|litros?|lts?|l|latas?|sobres?|scoops?|paquetes?|manojos?|onzas?|oz)`;
const QTY_FIRST_RE = new RegExp(String.raw`^${QTY}\s*(?:(?:de\s+)?${UNIT}(?=[\s.,)]|$)\.?)?\s*(?:de\s+)?(.*)$`, "i");
const NAME_FIRST_RE = new RegExp(String.raw`^([^\d]+?)\s+${QTY}\s*${UNIT}(?=[\s.,)]|$)\.?\s*(.*)$`, "i");
const ALT_SPLIT_RE = new RegExp(String.raw`\s+o\s+(?=${NUM}\s)`, "i");

const UNIT_NAMES: [RegExp, string][] = [
  [/^(piezas?|pzas?)$/i, "pieza"],
  [/^tazas?$/i, "taza"],
  [/^cucharaditas?$/i, "cucharadita"],
  [/^cucharadas?$/i, "cucharada"],
  [/^rebanadas?$/i, "rebanada"],
  [/^vasos?$/i, "vaso"],
  [/^(g|grs?|gramos?)$/i, "g"],
  [/^kg$/i, "kg"],
  [/^(ml|mililitros?)$/i, "ml"],
  [/^(l|lts?|litros?)$/i, "l"],
  [/^latas?$/i, "lata"],
  [/^sobres?$/i, "sobre"],
  [/^scoops?$/i, "scoop"],
  [/^paquetes?$/i, "paquete"],
  [/^manojos?$/i, "manojo"],
  [/^(onzas?|oz)$/i, "oz"]
];

const FRACTIONS: Record<string, string> = { "½": " 1/2", "¼": " 1/4", "¾": " 3/4", "⅓": " 1/3", "⅔": " 2/3", "⅛": " 1/8" };

// Words the PDFs print without accents (uppercase titles) or with common typos.
const WORD_FIXES: Record<string, string> = {
  jamon: "jamón",
  atun: "atún",
  platano: "plátano",
  maiz: "maíz",
  azucar: "azúcar",
  almibar: "almíbar",
  liquido: "líquido",
  cafe: "café",
  limon: "limón",
  hawaina: "hawaiana",
  gallera: "galleta",
  superavit: "superávit",
  deficit: "déficit",
  calorico: "calórico",
  calorica: "calórica",
  hipercalorica: "hipercalórica",
  hipocalorica: "hipocalórica",
  normocalorica: "normocalórica",
  perzonalizado: "personalizado",
  dias: "días",
  region: "región"
};

const TRAILING_DESCRIPTORS = /\s+(picad[oa]s?|rallad[oa]s?|deshebrad[oa]s?|cocid[oa]s?|molid[oa]s?|madur[oa]s?|median[oa]s?|pequeñ[oa]s?|grandes?|no\s+frit[oa]s?|frit[oa]s?|asad[oa]s?|hervid[oa]s?)$/i;
const CUT_PHRASES = /\s+(cortar|cortad[oa]s?|rebanar|distribuir|para\s+cocinar|puedes|pesar|usar|por\s+cada|del\s+sabor|de\s+tu\s+preferencia|ya\s+preparad[oa]s?|a\s+la\s+mexicana|en\s+cuadritos|en\s+rebanadas?|muy\s+peque|y\s+poc[oa]s?)\b/i;
const CONTAINER_PREFIX = /^((?:lata|sobre|bolsa|paquete)(?:\s+o\s+(?:lata|sobre|bolsa|paquete))?)\s+de\s+/i;

function fixWords(text: string) {
  return text.replace(/[A-Za-zÁÉÍÓÚÑáéíóúñ]+/g, (word) => {
    const fixed = WORD_FIXES[word.toLowerCase()];
    if (!fixed) return word;
    return word === word.toUpperCase() ? fixed.toUpperCase() : word[0] === word[0].toUpperCase() ? fixed[0].toUpperCase() + fixed.slice(1) : fixed;
  });
}

function sentenceCase(text: string) {
  const lower = fixWords(text.toLowerCase().replace(/\s+/g, " ").trim()).replace(/[.:]+$/, "");
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function cleanText(text: string) {
  return text
    .replace(/[½¼¾⅓⅔⅛]/g, (char) => FRACTIONS[char])
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,:;)])/g, "$1")
    .replace(/(\d)\s+(\d\/\d)/g, "$1 $2")
    .trim();
}

function parseNumber(raw?: string) {
  if (!raw) return null;
  const value = raw.replace(",", ".").trim();
  const mixed = value.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const fraction = value.match(/^(\d+)\/(\d+)$/);
  if (fraction) return Number(fraction[1]) / Number(fraction[2]);
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normUnit(raw?: string) {
  if (!raw) return "";
  const word = raw.replace(/\.$/, "");
  return UNIT_NAMES.find(([pattern]) => pattern.test(word))?.[1] ?? word.toLowerCase();
}

async function readRows(buffer: Buffer): Promise<Row[]> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer), { verbosity: 0 });
  const rows: Row[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const pageRows: Row[] = [];
    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      const x = item.transform[4];
      const y = item.transform[5];
      let row = pageRows.find((entry) => Math.abs(entry.y - y) <= 2.5);
      if (!row) {
        row = { page: pageNumber, y, items: [] };
        pageRows.push(row);
      }
      row.items.push({ x, width: item.width, text: item.str });
    }
    pageRows.sort((a, b) => b.y - a.y).forEach((row) => {
      row.items.sort((a, b) => a.x - b.x);
      rows.push(row);
    });
  }
  await pdf.destroy();
  return rows;
}

function joinItems(items: Row["items"]) {
  return items.reduce((text, item, index) => {
    if (!index) return item.text;
    const previous = items[index - 1];
    const gap = item.x - (previous.x + previous.width);
    return `${text}${gap > 1.5 ? " " : ""}${item.text}`;
  }, "");
}

// Meal names sit in a narrow left column and options in the right one; split halfway between them.
function columnSplit(rows: Row[]) {
  const mealX = rows.flatMap((row) => row.items).find((item) => MEAL_RE.test(item.text.trim()))?.x;
  const optionX = rows.flatMap((row) => row.items).find((item) => /^opci[oó]n/i.test(item.text.trim()))?.x;
  return mealX !== undefined && optionX !== undefined && optionX > mealX ? (mealX + optionX) / 2 : 120;
}

function toLines(rows: Row[], split: number): Line[] {
  return rows.map((row) => {
    const left = row.items.filter((item) => item.x < split);
    const right = row.items.filter((item) => item.x >= split);
    return { left: cleanText(joinItems(left)), right: cleanText(joinItems(right)), full: cleanText(joinItems(row.items)), items: row.items };
  });
}

function isOr(line: string) {
  return /^(o|ó)\.?$/i.test(line.trim());
}

// Wrapped lines continue in lowercase after a line that did not end a sentence.
function joinContinuations(lines: string[]) {
  const out: string[] = [];
  for (const line of lines) {
    const previous = out[out.length - 1];
    if (previous && !/[.:;]$/.test(previous) && /^[a-záéíóúñü]/.test(line) && !isOr(line) && !isOr(previous) && !OPTION_RE.test(previous)) {
      out[out.length - 1] = `${previous} ${line}`;
    } else {
      out.push(line);
    }
  }
  return out;
}

function isTitle(line: string) {
  const letters = line.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, "");
  if (letters.length < 3 || /^\d/.test(line) || INSTRUCTION_RE.test(line)) return false;
  const upper = letters.replace(/[^A-ZÁÉÍÓÚÑ]/g, "").length;
  return upper / letters.length >= 0.8 && !line.includes(":");
}

function parseTimeWindow(text: string) {
  const source = text.toLowerCase().replace(/a\.\s?m\.?/g, "am").replace(/p\.\s?m\.?/g, "pm");
  const match = source.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?(?:\s*(?:a|-|y)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?)?/);
  if (!match) return "";
  let hour = Number(match[1]);
  const minutes = Number(match[2] || 0);
  const end = match[4] ? Number(match[4]) : null;
  let meridiem = match[3] || "";
  let inferred = false;
  if (!meridiem && match[6]) {
    inferred = true;
    meridiem = match[6] === "pm" && end !== null && hour > end ? "am" : match[6];
  }
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12 && !inferred) hour = 0;
  if (hour > 23 || minutes > 59) return "";
  return `${String(hour).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function mealName(raw: string) {
  const key = normalize(raw).replace(/\s+/g, "-");
  const names: Record<string, string> = { desayuno: "Desayuno", colacion: "Colación", comida: "Comida", almuerzo: "Almuerzo", merienda: "Merienda", cena: "Cena", "pre-entreno": "Pre-entreno", "post-entreno": "Post-entreno", preentreno: "Pre-entreno", postentreno: "Post-entreno" };
  return names[key] || sentenceCase(raw);
}

type Draft = StructuredIngredient & { label: string; alternatives?: Draft[] };

function cleanName(raw: string) {
  const notes: string[] = [];
  let name = raw.replace(/\(([^)]*)\)/g, (_match, inner: string) => {
    if (inner.trim()) notes.push(inner.trim());
    return " ";
  });
  const colon = name.indexOf(":");
  if (colon > 0) {
    notes.push(name.slice(colon + 1).trim());
    name = name.slice(0, colon);
  }
  const cut = name.match(CUT_PHRASES);
  if (cut?.index !== undefined) {
    notes.push(name.slice(cut.index).trim());
    name = name.slice(0, cut.index);
  }
  name = name.replace(CONTAINER_PREFIX, (_match, container: string) => {
    notes.push(container.toLowerCase());
    return "";
  });
  const inlineOr = name.match(/^(.+?)\s+o\s+(.+)$/i);
  if (inlineOr && inlineOr[2].trim().split(/\s+/).length > 2) {
    notes.push(`o ${inlineOr[2].trim()}`);
    name = inlineOr[1];
  }
  name = name.replace(/^agua\s+frutas\b/i, "agua de frutas");
  const label = name.replace(/[.,;:]+$/, "").replace(/\s+/g, " ").trim();
  let match: RegExpMatchArray | null;
  while ((match = name.replace(/[.,;:\s]+$/, "").match(TRAILING_DESCRIPTORS))) {
    notes.unshift(match[1].toLowerCase());
    name = name.replace(/[.,;:\s]+$/, "").slice(0, match.index);
  }
  name = name
    .replace(/[.,;:]+$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b[A-ZÁÉÍÓÚÑ]{4,}\b/g, (word) => word.toLowerCase());
  name = fixWords(name.charAt(0).toLowerCase() + name.slice(1));
  return { name, label: fixWords(label.charAt(0).toLowerCase() + label.slice(1)), notes: notes.filter(Boolean).map((note) => fixWords(note.replace(/[.,;]+$/, ""))) };
}

function ingredient(name: string, quantity: number, unit: string, notes: string[], label: string, confidence: number): Draft {
  return {
    name,
    label,
    quantity: Math.round(quantity * 1000) / 1000,
    unit,
    category: categoryFor(name),
    notes: notes.join("; "),
    confidence_score: confidence,
    requires_review: !name
  };
}

function alGusto(text: string): Draft[] {
  return text
    .replace(/\bal\s+gusto\b/gi, "")
    .split(/,\s*|\s+y\s+|\s+e\s+/i)
    .map((part) => part.trim())
    .filter((part) => part.length > 1)
    .map((part) => {
      const { name, label, notes } = cleanName(part);
      return { ...ingredient(name, 0, "", ["al gusto", ...notes], label, 0.8), is_optional: true };
    })
    .filter((item) => item.name);
}

// One "part" is a single ingredient phrase, e.g. "50 gr. de pollo deshebrado".
function parsePart(text: string): Draft[] {
  const part = text.trim().replace(/[.;]+$/, "");
  if (!part) return [];
  const pieces = part.split(ALT_SPLIT_RE);
  if (pieces.length > 1 && /[a-záéíóúñ]/i.test(pieces[0])) {
    const [primary, ...alternatives] = pieces.flatMap((piece) => parsePart(piece));
    if (!primary) return [];
    primary.alternatives = alternatives;
    return [primary];
  }
  const qtyFirst = part.match(QTY_FIRST_RE);
  if (qtyFirst) {
    const [, low, connector, high, unitWord, rest] = qtyFirst;
    const { name, label, notes } = cleanName(rest);
    if (!name) return [];
    if (high) notes.unshift(`${low} ${connector === "-" ? "a" : connector} ${high}`);
    const unit = normUnit(unitWord) || "pieza";
    return [ingredient(name, parseNumber(low) ?? 1, unit, notes, label, unitWord ? 0.95 : 0.85)];
  }
  const nameFirst = part.match(NAME_FIRST_RE);
  if (nameFirst) {
    const [, rawName, low, , , unitWord, rest] = nameFirst;
    const { name, label, notes } = cleanName(rawName);
    if (rest.trim()) notes.push(rest.trim());
    return name ? [ingredient(name, parseNumber(low) ?? 1, normUnit(unitWord), notes, label, 0.9)] : [];
  }
  const words = part.split(/\s+/).length;
  if (/al\s+gusto/i.test(part) || (words <= 5 && !INSTRUCTION_RE.test(part))) return alGusto(part);
  return [];
}

function splitParts(sentence: string) {
  return sentence.split(/\s+\+\s+/).flatMap((piece) => {
    // "1 pieza de tomate en cuadritos, cebolla picada": a comma followed by a new food starts a new part.
    const [head, ...tail] = piece.split(/,\s+(?=[a-záéíóúñ]+(?:\s+[a-záéíóúñ]+)?\s*$|\d)/i);
    return [head, ...tail];
  });
}

function splitSentences(line: string) {
  return line.split(/(?<=\.)\s+(?=[A-ZÁÉÍÓÚÑ(¿¡])/).map((sentence) => sentence.trim()).filter(Boolean);
}

function instructionIngredients(sentence: string): Draft[] {
  const oil = sentence.match(new RegExp(String.raw`agregarle\s+${QTY}\s*(?:de\s+)?${UNIT}?\.?\s*(?:de\s+)?(aceite(?:\s+(?:l[ií]quido|de\s+oliva|vegetal))?)(?:\s+o\s+(\d+)\s+disparos)?`, "i"));
  if (oil) {
    const notes = [/l[ií]quido/i.test(oil[5]) ? "líquido" : "", oil[6] ? `o ${oil[6]} disparos de aceite en aerosol` : ""].filter(Boolean);
    return [ingredient("aceite", parseNumber(oil[1]) ?? 1, normUnit(oil[4]) || "cucharadita", notes, "aceite", 0.9)];
  }
  const sweeten = sentence.match(new RegExp(String.raw`endulzar\s+con\s+${QTY}\s*(?:de\s+)?${UNIT}?\.?\s*(?:de\s+)?([a-záéíóúñ]+)`, "i"));
  if (sweeten) return [ingredient(fixWords(sweeten[5].toLowerCase()), parseNumber(sweeten[1]) ?? 1, normUnit(sweeten[4]) || "cucharadita", [], fixWords(sweeten[5].toLowerCase()), 0.9)];
  const total = sentence.match(new RegExp(String.raw`${QTY}\s*${UNIT}\.?\s+de\s+(.+?)\s+por\s+(\w+).*?total\s+(\d+)`, "i"));
  if (total) {
    const { name, label, notes } = cleanName(total[5]);
    return [ingredient(name, Number(total[7]), normUnit(total[4]), [`${total[1]} por ${total[6].toLowerCase()}`, ...notes], label, 0.9)];
  }
  const accompany = sentence.match(/^acompa[nñ]ar\s+con\s+(.+)$/i);
  if (accompany) return alGusto(accompany[1].replace(/[.]+$/, ""));
  return [];
}

type ParsedBlock = { ingredients: Draft[]; notes: string[]; label: string };

// Parses ingredient lines (an option or a complement) into ingredients + preparation notes.
function parseBlock(lines: string[]): ParsedBlock {
  const ingredients: Draft[] = [];
  const notes: string[] = [];
  let label = "";
  for (const raw of lines) {
    let line = raw;
    const labelled = line.match(/^([A-Za-zÁÉÍÓÚÑáéíóúñ ]{2,30}):\s*(.*)$/);
    if (labelled) {
      if (!label) label = sentenceCase(labelled[1]);
      line = labelled[2];
      if (!line) {
        notes.push(sentenceCase(labelled[1]));
        continue;
      }
    }
    for (const sentence of splitSentences(line)) {
      const totalOnly = sentence.match(/^total\s+(\d+(?:[.,]\d+)?)/i);
      if (totalOnly && ingredients.length) {
        const last = ingredients[ingredients.length - 1];
        last.notes = [last.notes, `${last.quantity} por porción`].filter(Boolean).join("; ");
        last.quantity = parseNumber(totalOnly[1]) ?? last.quantity;
        continue;
      }
      const aside = sentence.match(/^\((.*)\)\.?$/);
      if (aside && ingredients.length) {
        const last = ingredients[ingredients.length - 1];
        last.notes = [last.notes, aside[1]].filter(Boolean).join("; ");
        continue;
      }
      if (INSTRUCTION_RE.test(sentence)) {
        const embedded = instructionIngredients(sentence);
        ingredients.push(...embedded);
        if (!/^acompa[nñ]ar\s+con/i.test(sentence)) notes.push(fixWords(sentence));
        continue;
      }
      const parsed = splitParts(sentence.replace(/[.;]+$/, "")).flatMap(parsePart);
      if (parsed.length) ingredients.push(...parsed);
      else notes.push(fixWords(sentence));
    }
  }
  return { ingredients, notes, label };
}

function finalizeIngredients(drafts: Draft[], options: ExtractOptions, groupPrefix: string) {
  const excluded = (options.excludedAlGusto ?? []).map(normalize);
  const kept = drafts.filter((item) => !(item.is_optional && item.quantity === 0 && (excluded.some((term) => normalize(item.name).startsWith(term)) || /^(sal|pimienta|especias?|condimentos?)$/i.test(item.name))));
  const toStructured = ({ label: _label, alternatives: _alternatives, ...item }: Draft, group?: string): StructuredIngredient => {
    const preset = item.is_optional && item.quantity === 0 ? options.alGustoDefaults?.[normalize(item.name)] : undefined;
    const quantity = item.is_optional && item.quantity === 0 ? (preset?.quantity ?? 1) : item.quantity;
    return { ...item, quantity, unit: preset?.unit ?? item.unit, alternative_group_id: group ?? null };
  };
  const ingredients: StructuredIngredient[] = [];
  const alternatives: StructuredIngredient[][] = [];
  kept.forEach((item, index) => {
    const group = item.alternatives?.length ? `${groupPrefix}-${index + 1}` : undefined;
    const primary = toStructured(item, group);
    // Only primaries are stored as usages, so keep the alternative readable in the notes.
    const alternativeText = (item.alternatives ?? []).map((alternative) => `o ${+alternative.quantity.toFixed(2)} ${alternative.unit} de ${alternative.name}`.replace(/\s+/g, " "));
    if (alternativeText.length) primary.notes = [primary.notes, ...alternativeText].filter(Boolean).join("; ");
    ingredients.push(primary);
    if (group) alternatives.push([primary, ...(item.alternatives ?? []).map((alternative) => toStructured(alternative, group))]);
  });
  return { ingredients, alternatives };
}

function optionName(title: string, ingredients: Draft[], meal: string, number: number) {
  if (title) return sentenceCase(title);
  const main = ingredients.filter((item) => !item.is_optional);
  if (main.length === 1) {
    const text = main[0].label || main[0].name;
    return text.charAt(0).toUpperCase() + text.slice(1);
  }
  return `${mealName(meal)} opcion ${number}`;
}

function parseMeal(name: string, leftLines: string[], rightLines: string[], options: ExtractOptions): StructuredMeal {
  type OptionDraft = { title: string; lines: string[] };
  const drafts: OptionDraft[] = [];
  const complements: { lines: string[] }[] = [];
  let current: OptionDraft | null = null;
  let complement: { lines: string[] } | null = null;
  const newOption = (): OptionDraft => {
    const draft = { title: "", lines: [] };
    drafts.push(draft);
    return draft;
  };

  for (const line of joinContinuations(rightLines)) {
    const choose = line.match(CHOOSE_RE);
    if (choose) {
      complement = null;
      current = newOption();
      if (choose[1]) current.lines.push(choose[1]);
      continue;
    }
    const option = line.match(OPTION_RE);
    if (option) {
      complement = null;
      current = newOption();
      if (option[2] && isTitle(option[2])) current.title = option[2];
      else if (option[2]) current.lines.push(option[2]);
      continue;
    }
    const accompany = line.match(COMPLEMENT_RE);
    if (accompany) {
      complement = { lines: accompany[1] ? [accompany[1]] : [] };
      complements.push(complement);
      continue;
    }
    if (complement) {
      complement.lines.push(line);
      continue;
    }
    if (!current) current = newOption();
    if (isOr(line)) {
      // Without a dish title, "o" separates whole choices (e.g. fruit for a colación);
      // inside a dish it just joins the next ingredient as an alternative line.
      if (!current.title) current = newOption();
      continue;
    }
    if (!current.title && !current.lines.length && isTitle(line)) {
      current.title = line;
      continue;
    }
    current.lines.push(line);
  }

  const parsedOptions: StructuredMealOption[] = drafts
    .map((draft) => ({ draft, block: parseBlock(draft.lines) }))
    .filter(({ draft, block }) => draft.title || block.ingredients.length)
    .map(({ draft, block }, index) => {
      const { ingredients, alternatives } = finalizeIngredients(block.ingredients, options, `alt-${normalize(name)}-${index + 1}`);
      const confidence = ingredients.length ? ingredients.reduce((sum, item) => sum + (item.confidence_score ?? 0.8), 0) / ingredients.length : 0.4;
      return {
        option_number: index + 1,
        recipe: {
          name: optionName(draft.title, block.ingredients, name, index + 1),
          description: block.notes.join(" "),
          ingredients,
          alternatives
        },
        confidence_score: Math.round(confidence * 100) / 100,
        requires_review: !ingredients.length || ingredients.some((item) => item.requires_review)
      };
    });

  const addOns = complements
    .map((entry) => parseBlock(entry.lines))
    .filter((block) => block.ingredients.length)
    .map((block, index) => {
      const { ingredients } = finalizeIngredients(block.ingredients, options, `addon-${normalize(name)}-${index + 1}`);
      const first = block.ingredients[0];
      const title = block.label || (first.label || first.name).replace(/^./, (char) => char.toUpperCase());
      return { name: title, required: true, ingredients, notes: block.notes.join(" ") };
    });

  const timeText = leftLines.join(" ");
  return {
    name: mealName(name),
    time_window: /\d/.test(timeText) ? parseTimeWindow(timeText) : "",
    options: parsedOptions,
    add_ons: addOns
  };
}

const GROUP_NAMES: [RegExp, string][] = [
  [/^verdura/i, "Verduras"],
  [/^fruta/i, "Frutas"],
  [/^cereal/i, "Cereales"],
  [/^(aoa|alimentos?\s+de\s+origen)/i, "AOA"],
  [/^leche/i, "Leche"],
  [/^(aceite|grasa)/i, "Aceites y grasas"],
  [/^leguminosa/i, "Leguminosas"],
  [/^az[uú]car/i, "Azúcares"]
];

function parseEquivalents(lines: Line[], meals: StructuredMeal[]) {
  const header = lines.find((line) => (line.full.match(/\b(desayuno|comida|cena)\b/gi) || []).length >= 2);
  if (!header) return;
  const used = new Set<number>();
  const columns = header.items
    .filter((item) => /^(desayuno|comida|cena|colaci[oó]n|col|c|almuerzo|merienda|pre[\s-]?entreno|post[\s-]?entreno)$/i.test(item.text.trim()))
    .map((item) => {
      const token = normalize(item.text);
      const wanted = token === "c" || token === "col" ? "colacion" : token.replace(/\s+/g, "-");
      const mealIndex = meals.findIndex((meal, index) => !used.has(index) && normalize(meal.name).replace(/\s+/g, "-") === wanted);
      if (mealIndex >= 0) used.add(mealIndex);
      return { x: item.x, mealIndex };
    })
    .filter((column) => column.mealIndex >= 0);
  if (!columns.length) return;
  const labelLimit = Math.min(...columns.map((column) => column.x)) - 8;
  for (const line of lines.slice(lines.indexOf(header) + 1)) {
    const label = line.items.filter((item) => item.x < labelLimit).map((item) => item.text).join(" ").trim();
    const group = GROUP_NAMES.find(([pattern]) => pattern.test(label))?.[1];
    if (!group) continue;
    for (const item of line.items.filter((entry) => entry.x >= labelLimit && /^\d+(?:[.,]\d+)?$/.test(entry.text.trim()))) {
      const column = columns.reduce((best, entry) => (Math.abs(entry.x - item.x) < Math.abs(best.x - item.x) ? entry : best));
      const meal = meals[column.mealIndex];
      meal.equivalents = { ...meal.equivalents, [group]: Number(item.text.replace(",", ".")) };
    }
  }
}

function parseExtras(lines: Line[], meals: StructuredMeal[]) {
  parseEquivalents(lines, meals);
  const text = lines.map((line) => line.full);
  const summary: Record<string, unknown> = {};
  const kcal = text.join(" ").match(/(\d{3,5})\s*kcal/i);
  if (kcal) summary.kcal = Number(kcal[1]);
  const macros = text.join(" ").match(/HC\s*(\d+)\D+PRO\D*?(\d+)\D+LIP\D*?(\d+)/i);
  if (macros) summary.macros = { carbohidratos: Number(macros[1]), proteinas: Number(macros[2]), lipidos: Number(macros[3]) };

  const supplements: StructuredPlan["supplements"] = [];
  const recommendations: string[] = [];
  for (const line of text) {
    const labelled = line.match(/^([A-Za-zÁÉÍÓÚÑáéíóúñ ]{3,40}?)\s*:\s*(.*)$/);
    const key = labelled ? normalize(labelled[1]) : "";
    if (labelled && /^suplementos?$/.test(key)) {
      const value = labelled[2].trim();
      if (value && !/^(no|ninguno|n\/a)\.?$/i.test(value)) {
        value.split(/,\s*|\s+y\s+/).forEach((entry) => {
          const parsed = parsePart(entry)[0];
          supplements.push(parsed ? { name: parsed.name, quantity: parsed.quantity, unit: parsed.unit } : { name: entry.trim(), quantity: 1, unit: "" });
        });
      }
      continue;
    }
    if (labelled && /^agua$/.test(key)) {
      const liters = labelled[2].match(/(\d+(?:[.,]\d+)?)(?:\s*(?:a|-)\s*(\d+(?:[.,]\d+)?))?\s*(?:l|lts?|litros?)\b/i);
      if (liters) summary.water_liters = { min: parseNumber(liters[1]), max: parseNumber(liters[2] || liters[1]) };
      recommendations.push(`Agua: ${labelled[2].trim()}`);
      continue;
    }
    if (labelled && /^snacks?$/.test(key)) {
      summary.free_snacks = labelled[2].trim();
      recommendations.push(`Snacks libres: ${labelled[2].trim()}`);
      continue;
    }
    if (labelled && /^comidas?\s+libres?$/.test(key)) {
      summary.free_meals = labelled[2].replace(/\.$/, "").trim();
      recommendations.push(`Comida libre: ${summary.free_meals}`);
      continue;
    }
    if (labelled && !labelled[2].trim()) continue;
    const isHeading = !/[a-záéíóúñ]/.test(line) && line.split(/\s+/).length <= 4;
    const inTable = /kcal|^(grupo|alimento|verduras?|frutas?|cereales|sin|aoa|leche|des|aceites?)\b/i.test(line) || /^\d/.test(line);
    if (isHeading || inTable || MEALS_END_RE.test(line)) continue;
    recommendations.push(fixWords(line));
  }
  return { summary, supplements, recommendations };
}

function parseHeader(lines: Line[]) {
  const objective = lines
    .map((line) => line.full)
    .filter((text) => /super[aá]vit|d[eé]ficit|mantenimiento|volumen|definici[oó]n|p[eé]rdida|ganancia|hiper|hipo|normocal/i.test(text))
    .map((text) => sentenceCase(text.replace(/\.\s*\(/g, " (").replace(/\.$/, "")))
    .join(" ");
  return { objective };
}

export async function extractPlanFromPdf(buffer: Buffer, fileName: string, options: ExtractOptions = {}): Promise<StructuredPlan> {
  const name = fileName.replace(/\.pdf$/i, "");
  const rows = await readRows(buffer).catch(() => [] as Row[]);
  const lines = toLines(rows, columnSplit(rows));
  const firstMeal = lines.findIndex((line) => MEAL_RE.test(line.left));
  if (!rows.length || firstMeal < 0) {
    return {
      name,
      objective: "Pendiente de revisar",
      diagnosis: "",
      recommendations: rows.length ? "No se detectaron comidas en el PDF. Revisa el formato del plan." : "No se pudo leer texto del PDF. Si es un documento escaneado, súbelo como PDF con texto.",
      supplements: [],
      nutrition_summary: {},
      meals: []
    };
  }
  const endIndex = lines.findIndex((line, index) => index > firstMeal && MEALS_END_RE.test(line.full));
  const mealLines = lines.slice(firstMeal, endIndex < 0 ? undefined : endIndex);
  const extraLines = endIndex < 0 ? [] : lines.slice(endIndex);

  const drafts: { name: string; left: string[]; right: string[] }[] = [];
  for (const line of mealLines) {
    const meal = line.left.match(MEAL_RE);
    if (meal) {
      drafts.push({ name: meal[1], left: [line.left.slice(meal[0].length).trim()].filter(Boolean), right: [] });
    } else if (line.left && drafts.length) {
      drafts[drafts.length - 1].left.push(line.left);
    }
    if (line.right && drafts.length) drafts[drafts.length - 1].right.push(line.right);
  }
  const meals = drafts.map((draft) => parseMeal(draft.name, draft.left, draft.right, options)).filter((meal) => meal.options.length || meal.add_ons?.length);
  const { summary, supplements, recommendations } = parseExtras(extraLines, meals);
  const header = parseHeader(lines.slice(0, firstMeal));
  const fullText = lines.map((line) => line.full).join(" ");

  return {
    name,
    objective: header.objective || (/volumen|masa/i.test(fullText) ? "Aumento de masa muscular" : /definicion|perdida|bajar/i.test(fullText) ? "Perdida de grasa" : "Pendiente de revisar"),
    diagnosis: "",
    recommendations: recommendations.join("\n") || "No encontré recomendaciones estructuradas en el PDF.",
    supplements,
    nutrition_summary: summary,
    meals
  };
}
