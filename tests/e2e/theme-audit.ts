import type { Page } from "@playwright/test";
import { test } from "./fixtures";
import { THEME_KEY, type Rgba, type Theme } from "./theme-helpers";

// The contrast and theming audit shared by theme-palette.spec.ts (signed-in pages, shared UI) and theme-login.spec.ts.
// Everything is measured from computed styles in the real page; there is no axe-core (Constitution 4).

declare global {
  interface Window {
    __audit: Toolkit;
  }
}

export type Finding = { rule: string; where: string; detail: string };
export type RunResult = { findings: Finding[]; allowed: string[]; min: Record<string, number> };
export type StyleEntry = { key: string; where: string; bg: Rgba | null; color: Rgba | null; border: Rgba | null; text: boolean; accent: boolean };
export type Toolkit = {
  run: (options: { scope: string | null; allow: string[] }) => RunResult;
  focus: () => { done: boolean; skip: boolean; id: string; ok: boolean; ratio: number; where: string };
  hoverTargets: (scope: string | null) => { index: number; where: string }[];
  prepareHover: (index: number) => { x: number; y: number; reachable: boolean };
  clearHover: () => void;
  styles: (scope: string | null) => StyleEntry[];
};

// ---------------------------------------------------------------------------------------------------------------
// In-page toolkit (serialized as one function: it may not reference anything outside itself).
// ---------------------------------------------------------------------------------------------------------------
export function installToolkit() {
  if (window.__audit) return;
  type RGBA = [number, number, number, number];
  const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;

  const parse = (css: string): RGBA => {
    const legacy = css.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+)(%?))?\s*\)$/);
    if (legacy) return [+legacy[1], +legacy[2], +legacy[3], legacy[4] === undefined ? 1 : +legacy[4] / (legacy[5] ? 100 : 1)];
    let alpha = 1;
    let opaque = css;
    const slash = css.match(/\s*\/\s*([\d.]+)(%?)\s*\)$/);
    if (slash) {
      alpha = +slash[1] / (slash[2] ? 100 : 1);
      opaque = css.replace(slash[0], ")");
    }
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "#000";
    ctx.fillStyle = opaque;
    ctx.fillRect(0, 0, 1, 1);
    const data = ctx.getImageData(0, 0, 1, 1).data;
    return [data[0], data[1], data[2], alpha];
  };
  const over = (fg: RGBA, bg: RGBA, extra = 1): RGBA => {
    const a = fg[3] * extra;
    return [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a), 1];
  };
  const channel = (value: number) => {
    const unit = value / 255;
    return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
  };
  const luminance = (c: RGBA) => 0.2126 * channel(c[0]) + 0.7152 * channel(c[1]) + 0.0722 * channel(c[2]);
  const ratio = (a: RGBA, b: RGBA) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const lab = (c: RGBA) => {
    const [r, g, b] = [c[0], c[1], c[2]].map(channel);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return { L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s };
  };
  const chroma = (c: RGBA) => Math.hypot(lab(c).a, lab(c).b);
  const lightness = (c: RGBA) => lab(c).L;

  const label = (el: Element): string => {
    if (el instanceof SVGElement && el.parentElement) return `${el.tagName.toLowerCase()} in ${label(el.parentElement)}`;
    const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
    const text = (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 24);
    return `${el.tagName.toLowerCase()}${cls ? "." + cls : ""}${text ? ` "${text}"` : ""}`;
  };

  const bgCache = new Map<Element, { color: RGBA; image: boolean }>();
  const effective = (start: Element | null): { color: RGBA; image: boolean } => {
    if (!start) return { color: [255, 255, 255, 1], image: false };
    const cached = bgCache.get(start);
    if (cached) return cached;
    const layers: RGBA[] = [];
    let image = false;
    for (let node: Element | null = start; node; node = node.parentElement) {
      const cs = getComputedStyle(node);
      if (cs.backgroundImage !== "none" && layers.every((layer) => layer[3] < 1)) image = true;
      const color = parse(cs.backgroundColor);
      if (color[3] > 0) layers.push(color);
      if (color[3] >= 1) break;
    }
    let base: RGBA = [255, 255, 255, 1];
    const lastOpaque = layers.length && layers[layers.length - 1][3] >= 1;
    if (lastOpaque) base = layers[layers.length - 1];
    else base = parse(getComputedStyle(document.body).backgroundColor);
    let out: RGBA = [base[0], base[1], base[2], 1];
    for (let i = layers.length - (lastOpaque ? 2 : 1); i >= 0; i--) out = over(layers[i], out);
    const result = { color: out, image };
    bgCache.set(start, result);
    return result;
  };

  const opacityOf = (el: Element) => {
    let value = 1;
    for (let node: Element | null = el; node; node = node.parentElement) value *= parseFloat(getComputedStyle(node).opacity);
    return value;
  };
  const clipped = (el: Element) => {
    const rect = el.getBoundingClientRect();
    for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
      const cs = getComputedStyle(node);
      if (cs.overflowX === "visible" && cs.overflowY === "visible") continue;
      const box = node.getBoundingClientRect();
      if (rect.right <= box.left || rect.left >= box.right || rect.bottom <= box.top || rect.top >= box.bottom) return true;
    }
    return false;
  };
  const shown = (el: Element, minSize = 4) => {
    if (el.closest("nextjs-portal, script, style, template")) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < minSize || rect.height < minSize) return false;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility !== "visible") return false;
    if (opacityOf(el) < 0.05) return false;
    return !clipped(el);
  };
  const disabled = (el: Element) => Boolean(el.closest(':disabled, [aria-disabled="true"]'));

  type Shadow = { color: RGBA; blur: number; spread: number; inset: boolean };
  const shadows = (value: string): Shadow[] => {
    if (!value || value === "none") return [];
    const layers: string[] = [];
    let depth = 0;
    let current = "";
    for (const char of value) {
      if (char === "(") depth++;
      if (char === ")") depth--;
      if (char === "," && depth === 0) {
        layers.push(current);
        current = "";
      } else current += char;
    }
    layers.push(current);
    return layers.flatMap((layer) => {
      const match = layer.trim().match(/^((?:rgb|rgba|oklch|oklab|color|hsl|lab|lch)\([^)]*\))\s*(.*)$/);
      if (!match) return [];
      const numbers = (match[2].match(/-?[\d.]+px/g) || []).map(parseFloat);
      return [{ color: parse(match[1]), blur: numbers[2] || 0, spread: numbers[3] || 0, inset: /inset/.test(match[2]) }];
    });
  };

  /** Best 3:1 candidate among an element's own border, fill and hard-edged ring, against what surrounds it. */
  const boundary = (el: Element) => {
    const cs = getComputedStyle(el);
    const outer = effective(el.parentElement).color;
    const parts: { kind: string; ratio: number }[] = [];
    for (const side of ["Top", "Right", "Bottom", "Left"] as const) {
      const width = parseFloat(cs[`border${side}Width`]);
      const style = cs[`border${side}Style`];
      if (width > 0 && style !== "none" && style !== "hidden") {
        const color = parse(cs[`border${side}Color`]);
        if (color[3] > 0.05) {
          parts.push({ kind: "border", ratio: ratio(over(color, outer), outer) });
          break;
        }
      }
    }
    const fill = parse(cs.backgroundColor);
    if (fill[3] > 0.05) parts.push({ kind: "fill", ratio: ratio(over(fill, outer), outer) });
    for (const shadow of shadows(cs.boxShadow)) {
      if (shadow.blur === 0 && shadow.spread >= 1 && shadow.color[3] > 0.05) parts.push({ kind: "ring", ratio: ratio(over(shadow.color, outer), outer) });
    }
    return { parts, best: parts.reduce((max, part) => Math.max(max, part.ratio), 0) };
  };

  const MARKS: [string, string][] = [
    [".home-intake-bar", "stroke"],
    [".home-gauge-knob", "stroke"],
    [".home-activity-days li.is-done i", "backgroundColor"],
    [".home-cup-glass", "stroke"],
    [".home-cup.is-full .home-cup-water", "fill"],
    [".home-wave", "backgroundColor"],
    [".rx-groups i", "backgroundColor"],
    [".rx-group-list i", "backgroundColor"],
    [".steps span.done", "backgroundColor"]
  ];
  const FIELD = 'input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]):not([type="file"]):not([type="submit"]):not([type="button"]), select, textarea';
  // The wave encodes the weekly water level and its fill is still measured as a mark (MARKS). Only the crest svg
  // (front vs back wave, two shades of the same water) is exempt from the icon rule.
  const DECORATIVE = ".home-wave";
  // The unfilled track of a ring or gauge is the remainder of a value that is also printed as text, so it is not a
  // data mark and is exempt from 3:1 (user decision 2026-10-23, REQ-7 v1.6). Every other shape counts, at its minimum.
  const TRACK = ".home-intake-track, .home-gauge-track";
  const CHECKLIKE = '[role="checkbox"], [role="radio"], [role="switch"]';
  const CONTROL = 'a[href], button, [role="button"], summary';

  const inScope = (scope: string | null) => {
    if (!scope) return [document.body, ...Array.from(document.body.querySelectorAll("*"))];
    return Array.from(document.querySelectorAll(scope)).flatMap((root) => [root, ...Array.from(root.querySelectorAll("*"))]);
  };

  const run = ({ scope, allow }: { scope: string | null; allow: string[] }): RunResult => {
    bgCache.clear();
    const findings: Finding[] = [];
    const allowed: string[] = [];
    const min: Record<string, number> = {};
    const note = (category: string, value: number) => {
      min[category] = Math.min(min[category] ?? Infinity, value);
    };
    const fail = (rule: string, el: Element, detail: string) => findings.push({ rule, where: label(el), detail });
    const elements = inScope(scope);

    for (const el of elements) {
      if (!shown(el)) continue;
      const cs = getComputedStyle(el);
      const isField = el.matches(FIELD);
      const ownText = Array.from(el.childNodes).some((node) => node.nodeType === 3 && (node.textContent || "").trim());
      const valueText = isField && ((el as HTMLInputElement).value || "").length > 0 && !el.matches('[type="range"]');

      // Text (4.5:1, 3:1 when large) over what it sits on.
      if ((ownText || valueText) && !disabled(el)) {
        const bg = effective(el);
        const fg = parse(cs.color);
        const size = parseFloat(cs.fontSize);
        const large = size >= 24 || (size >= 18.66 && parseInt(cs.fontWeight, 10) >= 700);
        if (bg.image && allow.some((selector) => el.closest(selector))) allowed.push(label(el));
        else if (bg.image) fail("text-over-image", el, "text over a background image that is not on the allowlist");
        else {
          const value = ratio(over(fg, bg.color, opacityOf(el)), bg.color);
          const category = large ? "large text" : "text";
          note(category, value);
          if (value < (large ? 3 : 4.5)) fail(category, el, `${value.toFixed(2)}:1 (needs ${large ? 3 : 4.5}) ${cs.color} on rgb(${bg.color.map(Math.round).slice(0, 3)})`);
        }
      }

      // Placeholder text.
      if (isField && !(el as HTMLInputElement).value && (el as HTMLInputElement).placeholder && !disabled(el)) {
        const bg = effective(el).color;
        const fg = parse(getComputedStyle(el, "::placeholder").color);
        const value = ratio(over(fg, bg, opacityOf(el)), bg);
        note("placeholder", value);
        if (value < 4.5) fail("placeholder", el, `${value.toFixed(2)}:1 (needs 4.5)`);
      }

      // Icons (3:1): every svg, not only lucide ones (Sonner draws its own toast icons and close button). An svg's own
      // fill is the inherited default (black) whenever its shapes paint themselves, so the paint is read off the
      // shapes and the weakest non-track one counts (see TRACK). A gauge at 0% still has its bar paint measured.
      if (el instanceof SVGSVGElement && !disabled(el) && !el.closest(DECORATIVE)) {
        const bg = effective(el).color;
        const shapes = [...el.querySelectorAll("path, circle, rect, line, polyline, polygon, ellipse")];
        const targets = shapes.length ? shapes : [el];
        let lowest = Infinity;
        for (const shape of targets) {
          if (shape.matches(TRACK)) continue;
          const style = getComputedStyle(shape);
          const paint = style.stroke !== "none" ? style.stroke : style.fill;
          if (paint === "none") continue;
          // A gradient paint is measured by its weakest stop.
          const gradient = paint.match(/^url\(["']?#([^"')]+)/);
          const colors = gradient
            ? [...(el.ownerDocument.getElementById(gradient[1])?.querySelectorAll("stop") ?? [])].map((stop) => getComputedStyle(stop).stopColor)
            : [paint];
          for (const color of colors) {
            const painted = parse(color);
            if (painted[3] === 0) continue;
            lowest = Math.min(lowest, ratio(over(painted, bg, opacityOf(el)), bg));
          }
        }
        if (lowest !== Infinity) {
          note("icon", lowest);
          if (lowest < 3) fail("icon", el, `${lowest.toFixed(2)}:1 (needs 3)`);
        }
      }

      // Boundaries (3:1): form fields, check-like controls and saturated solid buttons.
      if (isField && !disabled(el)) {
        // The visible edge of a field may be its own border or a wrapper's (search pills, the chat form): take the best within 3 levels.
        let best = 0;
        let node: Element | null = el;
        for (let depth = 0; node && depth < 4 && best < 3; depth++, node = node.parentElement) best = Math.max(best, boundary(node).best);
        note("boundary", best);
        if (best < 3) fail("field boundary", el, `${best.toFixed(2)}:1 (needs 3)`);
      } else if (el.matches(CHECKLIKE) && !disabled(el)) {
        const result = boundary(el);
        note("boundary", result.best);
        if (result.best < 3) fail("check boundary", el, `${result.best.toFixed(2)}:1 (needs 3)`);
      } else if (el.matches(CONTROL) && !disabled(el)) {
        const fill = parse(cs.backgroundColor);
        if (fill[3] >= 0.9 && chroma(fill) >= 0.04 && lightness(fill) >= 0.4) {
          const result = boundary(el);
          note("boundary", result.best);
          if (result.best < 3) fail("button boundary", el, `${result.best.toFixed(2)}:1 (needs 3)`);
        }
      }
    }

    // Data-visual marks and status graphics (3:1) against the surface they are drawn on.
    for (const [selector, property] of MARKS) {
      for (const el of document.querySelectorAll(selector)) {
        if (scope && !elements.includes(el)) continue;
        if (!shown(el, 2)) continue;
        const cs = getComputedStyle(el) as unknown as Record<string, string>;
        const paint = cs[property];
        if (!paint || paint === "none" || paint.startsWith("url(")) continue;
        const bg = effective(el.parentElement).color;
        const value = ratio(over(parse(paint), bg), bg);
        note("mark", value);
        if (value < 3) fail("mark", el, `${selector} ${value.toFixed(2)}:1 (needs 3)`);
      }
    }
    return { findings, allowed, min };
  };

  const focus = () => {
    bgCache.clear();
    const active = document.activeElement;
    if (!active || active === document.body || active === document.documentElement) return { done: true, skip: false, id: "", ok: true, ratio: 0, where: "" };
    // The Next dev indicator is framework UI (out of scope).
    if (active.tagName === "NEXTJS-PORTAL") return { done: false, skip: true, id: "nextjs-portal", ok: true, ratio: 0, where: "" };
    let bestRatio = 0;
    for (let node: Element | null = active, depth = 0; node && depth < 5; node = node.parentElement, depth++) {
      if (depth > 0 && !node.matches(":focus-within")) break;
      const cs = getComputedStyle(node);
      const outer = effective(node.parentElement).color;
      if (cs.outlineStyle !== "none" && cs.outlineStyle !== "hidden" && parseFloat(cs.outlineWidth) > 0) {
        const color = parse(cs.outlineColor);
        bestRatio = Math.max(bestRatio, ratio(over(color, outer), outer));
      }
      for (const shadow of shadows(cs.boxShadow)) {
        if (shadow.blur === 0 && shadow.spread >= 1 && shadow.color[3] > 0.05) bestRatio = Math.max(bestRatio, ratio(over(shadow.color, outer), outer));
      }
    }
    const id = label(active) + "@" + Math.round(active.getBoundingClientRect().top) + "," + Math.round(active.getBoundingClientRect().left);
    return { done: false, skip: false, id, ok: bestRatio >= 3, ratio: bestRatio, where: label(active) };
  };

  const HOVER = 'a[href], button:not(:disabled), [role="button"], [role="menuitem"], [role="checkbox"], summary, select, input:not([type="hidden"]):not(:disabled)';
  const hoverTargets = (scope: string | null) => {
    const seen = new Set<string>();
    const picked: { index: number; where: string }[] = [];
    inScope(scope)
      .filter((el) => el.matches(HOVER) && shown(el, 8))
      .forEach((el) => {
        const signature = `${el.tagName}.${typeof el.className === "string" ? el.className : ""}.${el.getAttribute("aria-checked") ?? ""}`;
        if (seen.has(signature) || picked.length >= 36) return;
        seen.add(signature);
        el.setAttribute("data-audit-hover", String(picked.length));
        picked.push({ index: picked.length, where: label(el) });
      });
    return picked;
  };
  const prepareHover = (index: number) => {
    const el = document.querySelector(`[data-audit-hover="${index}"]`);
    if (!el) return { x: 0, y: 0, reachable: false };
    el.scrollIntoView({ block: "center", inline: "center" });
    const rect = el.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const top = document.elementFromPoint(x, y);
    return { x, y, reachable: Boolean(top && (el === top || el.contains(top))) };
  };
  const clearHover = () => document.querySelectorAll("[data-audit-hover]").forEach((el) => el.removeAttribute("data-audit-hover"));

  /** Key, own colors and text flag of every element, in document order, for comparing the same page in two themes. */
  const styles = (scope: string | null): StyleEntry[] => {
    bgCache.clear();
    return inScope(scope)
      .filter((el) => shown(el, 2))
      .map((el, index) => {
        const cs = getComputedStyle(el);
        const own = parse(cs.backgroundColor);
        const bg = own[3] > 0.05 ? effective(el).color : null;
        let border: RGBA | null = null;
        if (parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== "none") {
          const color = parse(cs.borderTopColor);
          if (color[3] > 0.02) border = over(color, effective(el.parentElement).color);
        }
        const text = Array.from(el.childNodes).some((node) => node.nodeType === 3 && (node.textContent || "").trim());
        const textColor = text ? over(parse(cs.color), effective(el).color, opacityOf(el)) : null;
        // The yellow accent (selected day, "now" flag, shopping actions) and the white promo button keep their color by design.
        // A focused field keeps the brand-colored focus border in both themes.
        const accent = Boolean(el.closest(".home-strip-pill, .home-daypill.is-selected, .home-now-flag, .is-yellow, .home-promo-btn, .groceries-nav-item.on")) || el.matches(":focus-within");
        return { key: `${index}:${el.tagName}`, where: label(el), bg: bg as RGBA | null, color: textColor, border, text, accent };
      });
  };

  window.__audit = { run, focus, hoverTargets, prepareHover, clearHover, styles };
}

// ---------------------------------------------------------------------------------------------------------------
// Test-side helpers
// ---------------------------------------------------------------------------------------------------------------

const STILL = "*, *::before, *::after { animation: none !important; transition: none !important; }";

/** Opens `path` with the given stored theme, animations off so every state is audited at rest. */
export async function visit(page: Page, target: string, theme: Theme) {
  await page.goto(target);
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [THEME_KEY, theme] as const);
  await page.reload();
  await page.waitForLoadState("networkidle");
  await settle(page);
}

export async function settle(page: Page) {
  await page.addStyleTag({ content: STILL });
  await page.evaluate(installToolkit);
}

export type Audit = { scope?: string | null; allow?: string[]; tab?: boolean; hover?: boolean };

/** Runs the contrast audit on the current page state and returns every violation (empty = pass), plus the minimums. */
export async function auditNow(page: Page, { scope = null, allow = [], tab = true, hover = true }: Audit = {}) {
  await page.evaluate(installToolkit);
  const findings: Finding[] = [];
  const min: Record<string, number> = {};
  let tabStops = 0;
  let hovered = 0;
  const merge = (result: RunResult) => {
    findings.push(...result.findings);
    for (const [key, value] of Object.entries(result.min)) min[key] = Math.min(min[key] ?? Infinity, value);
  };
  merge(await page.evaluate((options) => window.__audit.run(options), { scope, allow }));

  if (tab) {
    await page.evaluate(() => {
      (document.activeElement as HTMLElement | null)?.blur();
      window.scrollTo(0, 0);
    });
    const seen = new Set<string>();
    for (let presses = 0; presses < 70; presses++) {
      await page.keyboard.press("Tab");
      const result = await page.evaluate(() => window.__audit.focus());
      if (result.done || seen.has(result.id)) break;
      seen.add(result.id);
      if (result.skip) continue;
      tabStops++;
      min["focus"] = Math.min(min["focus"] ?? Infinity, result.ratio);
      if (!result.ok) findings.push({ rule: "focus indicator", where: result.where, detail: `${result.ratio.toFixed(2)}:1 (needs 3)` });
    }
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  }

  if (hover) {
    const targets = await page.evaluate((s) => window.__audit.hoverTargets(s), scope);
    for (const target of targets) {
      const point = await page.evaluate((index) => window.__audit.prepareHover(index), target.index);
      if (!point.reachable) continue;
      await page.mouse.move(point.x, point.y);
      hovered++;
      merge(await page.evaluate((options) => window.__audit.run(options), { scope: `[data-audit-hover="${target.index}"]`, allow }));
    }
    await page.evaluate(() => window.__audit.clearHover());
    await page.mouse.move(0, 0);
  }

  const unique = new Map(findings.map((finding) => [`${finding.rule}|${finding.where}`, finding]));
  return { tabStops, hovered, violations: [...unique.values()].map((finding) => `${finding.rule}: ${finding.where} - ${finding.detail}`), min };
}

export function report(name: string, min: Record<string, number>, swept = { tabStops: 0, hovered: 0 }) {
  const text = `${Object.entries(min)
    .map(([key, value]) => `${key} ${value.toFixed(2)}`)
    .join(", ")} (${swept.tabStops} tab stops, ${swept.hovered} hovered)`;
  test.info().annotations.push({ type: "contrast", description: `${name}: ${text}` });
  console.log(`[contrast] ${name}: ${text}`);
}
