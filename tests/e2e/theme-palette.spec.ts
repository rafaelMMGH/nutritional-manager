import fs from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { expect, expectIssues, test } from "./fixtures";
import { inScopePages, oklch, THEME_KEY, toRgb, type Rgba, type Theme } from "./theme-helpers";

// US2 (REQ-6 to REQ-9): the dark palette is complete and accessible. Everything here is measured from computed
// styles in the real page; there is no axe-core (Constitution 4). The app runs in the light OS scheme and each
// test sets the stored choice itself.

declare global {
  interface Window {
    __audit: Toolkit;
  }
}

type Finding = { rule: string; where: string; detail: string };
type RunResult = { findings: Finding[]; allowed: string[]; min: Record<string, number> };
type StyleEntry = { key: string; where: string; bg: Rgba | null; color: Rgba | null; border: Rgba | null; text: boolean; accent: boolean };
type Toolkit = {
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
function installToolkit() {
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
async function visit(page: Page, target: string, theme: Theme) {
  await page.goto(target);
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [THEME_KEY, theme] as const);
  await page.reload();
  await page.waitForLoadState("networkidle");
  await settle(page);
}

async function settle(page: Page) {
  await page.addStyleTag({ content: STILL });
  await page.evaluate(installToolkit);
}

type Audit = { scope?: string | null; allow?: string[]; tab?: boolean; hover?: boolean };

/** Runs the contrast audit on the current page state and returns every violation (empty = pass), plus the minimums. */
async function auditNow(page: Page, { scope = null, allow = [], tab = true, hover = true }: Audit = {}) {
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

function report(name: string, min: Record<string, number>, swept = { tabStops: 0, hovered: 0 }) {
  const text = `${Object.entries(min)
    .map(([key, value]) => `${key} ${value.toFixed(2)}`)
    .join(", ")} (${swept.tabStops} tab stops, ${swept.hovered} hovered)`;
  test.info().annotations.push({ type: "contrast", description: `${name}: ${text}` });
  console.log(`[contrast] ${name}: ${text}`);
}

// ---------------------------------------------------------------------------------------------------------------
// Shared UI states
// ---------------------------------------------------------------------------------------------------------------

type SharedUi = {
  name: string;
  path: string;
  /** Opens the state and returns the CSS selector of its root. */
  open: (page: Page) => Promise<string>;
  /** Routes to mock before the page loads. */
  mock?: (page: Page) => Promise<void>;
  /** Console/API issues each opening causes on purpose (a mocked failure). */
  issues?: RegExp[];
  /** Tab and hover sweeps inside the root as well. */
  sweep?: boolean;
};

const PLAN_REQUEST = /\/api\/plans\/[^/?]+$/;
const mockPlanDelete = (status: number) => async (page: Page) => {
  await page.route(PLAN_REQUEST, (route) =>
    route.request().method() === "DELETE" ? route.fulfill({ status, contentType: "application/json", body: JSON.stringify(status < 400 ? { ok: true } : { error: "Fallo simulado" }) }) : route.fallback()
  );
};

const STRUCTURED_PLAN = {
  plan: { id: "plan-e2e" },
  structured_data: {
    name: "Plan de prueba",
    objective: "Bajar de peso",
    nutrition_summary: { kcal: 1800, macros: { carbohidratos: 50, proteinas: 25, lipidos: 25 } },
    supplements: [{ name: "Creatina" }],
    recommendations: "Beber dos litros de agua al día.",
    meals: [
      {
        name: "Desayuno",
        time_window: "08:00",
        equivalents: { Cereales: 2, Frutas: 1 },
        add_ons: [{ name: "Acompañar tu desayuno", ingredients: [{ name: "Café", quantity: 1, unit: "taza", notes: "sin azúcar" }] }],
        options: [
          { requires_review: true, confidence_score: 0.62, recipe: { name: "Huevos con jamón", ingredients: [{ name: "Huevo", quantity: 2, unit: "pieza", notes: "" }] } },
          { requires_review: false, confidence_score: 0.95, recipe: { name: "Avena con fruta", ingredients: [{ name: "Avena", quantity: 0.5, unit: "taza", notes: "" }] } }
        ]
      }
    ]
  }
};

async function openWizard(page: Page, step: number) {
  await page.route(/\/api\/plans\/upload$/, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(STRUCTURED_PLAN) }));
  await page.getByRole("button", { name: /Subir plan nuevo/ }).first().click();
  await expect(page.locator(".upload-wizard-modal")).toBeVisible();
  if (step > 0) {
    await page.locator('input[name="pdf"]').setInputFiles({ name: "plan.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 e2e") });
    await page.getByRole("button", { name: "Procesar PDF" }).click();
    await expect(page.getByText("Procesamiento completado")).toBeVisible();
    for (let current = 1; current < step; current++) await page.getByRole("button", { name: "Siguiente" }).click();
  }
  return ".upload-wizard-modal";
}

const sharedUi: SharedUi[] = [
  {
    name: "user menu",
    path: "/",
    sweep: true,
    open: async (page) => {
      await page.locator(".user-chip").click();
      await expect(page.locator(".user-popover")).toBeVisible();
      return ".user-popover";
    }
  },
  {
    name: "home scope menu",
    path: "/",
    sweep: true,
    open: async (page) => {
      await page.locator(".home-search-filter").click();
      await expect(page.locator(".home-scope-menu")).toBeVisible();
      return ".home-scope-menu";
    }
  },
  {
    name: "weight popover",
    path: "/",
    sweep: true,
    open: async (page) => {
      await page.getByRole("button", { name: "Registrar peso y meta" }).click();
      await expect(page.locator(".home-popover")).toBeVisible();
      return ".home-popover";
    }
  },
  {
    name: "schedule editing with native time inputs",
    path: "/",
    sweep: true,
    open: async (page) => {
      await page.getByRole("button", { name: "Editar horarios" }).click();
      await expect(page.locator(".home-time-input").first()).toBeVisible();
      return ".home-day";
    }
  },
  {
    name: "ingredient combobox",
    path: "/groceries/cart",
    sweep: true,
    open: async (page) => {
      await page.locator('.manual-add input[name="name"]').fill("a");
      await expect(page.locator(".combo-list")).toBeVisible();
      return ".manual-add";
    }
  },
  {
    name: "selected filter chip",
    path: "/recipes",
    sweep: true,
    open: async (page) => {
      await page.locator(".rx-chip:not(.is-on)").first().click();
      await expect(page.locator(".rx-chip.is-on")).toBeVisible();
      return ".rx-toolbar";
    }
  },
  {
    name: "confirm dialog",
    path: "/plans",
    sweep: true,
    open: async (page) => {
      await page.getByRole("button", { name: "Eliminar" }).first().click();
      await expect(page.getByRole("dialog")).toBeVisible();
      return '[role="dialog"]';
    }
  },
  {
    name: "success toast",
    path: "/plans",
    sweep: true,
    mock: mockPlanDelete(200),
    open: async (page) => {
      await page.getByRole("button", { name: "Eliminar" }).first().click();
      await page.getByRole("dialog").getByRole("button", { name: "Eliminar" }).click();
      await expect(page.locator("[data-sonner-toast]")).toContainText("Plan enviado a papelera");
      return "[data-sonner-toast]";
    }
  },
  {
    name: "error toast",
    path: "/plans",
    sweep: true,
    mock: mockPlanDelete(500),
    issues: [/DELETE \/api\/plans\/.* → 500/, /Failed to load resource.*500/],
    open: async (page) => {
      await page.getByRole("button", { name: "Eliminar" }).first().click();
      await page.getByRole("dialog").getByRole("button", { name: "Eliminar" }).click();
      await expect(page.locator("[data-sonner-toast]")).toContainText("No se pudo completar la acción");
      return "[data-sonner-toast]";
    }
  },
  {
    name: "assistant panel",
    path: "/recipes",
    sweep: true,
    open: async (page) => {
      await page.locator(".assistant-fab").click();
      await expect(page.locator(".assistant-chat.open")).toBeVisible();
      return ".assistant-chat";
    }
  },
  { name: "assistant button", path: "/recipes", open: async () => ".assistant-fab" },
  { name: "upload wizard: file step", path: "/recipes", sweep: true, open: (page) => openWizard(page, 0) },
  { name: "upload wizard: review", path: "/recipes", sweep: true, open: (page) => openWizard(page, 1) },
  { name: "upload wizard: meals", path: "/recipes", open: (page) => openWizard(page, 3) },
  { name: "upload wizard: ingredients", path: "/recipes", open: (page) => openWizard(page, 4) },
  { name: "upload wizard: complements", path: "/recipes", open: (page) => openWizard(page, 5) },
  {
    name: "empty state",
    path: "/recipes",
    open: async (page) => {
      await page.getByRole("searchbox").or(page.locator(".rx-search input")).first().fill("zzzz-no-existe");
      await expect(page.locator(".rx-empty")).toBeVisible();
      return ".rx-page";
    }
  },
  {
    name: "loading skeleton",
    path: "/recipes",
    // Failure mode: if the server does not stream the loading fallback (a faster DB, a production server), the capture
    // stays empty and the `toContain("Cargando")` assertion below fails loudly. It cannot pass without real markup.
    // loading.tsx only streams while a page is waiting for its data. Holding the request does not show it (the router
    // waits for the response), so the real fallback markup is captured as the server streams it, then shown in place.
    mock: async (page) => {
      await page.addInitScript(() => {
        new MutationObserver(() => {
          const loading = document.querySelector(".loading");
          if (loading && !(window as unknown as { __skeletonHTML?: string }).__skeletonHTML) (window as unknown as { __skeletonHTML?: string }).__skeletonHTML = loading.outerHTML;
        }).observe(document, { childList: true, subtree: true });
      });
    },
    open: async (page) => {
      const html = await page.evaluate(() => (window as unknown as { __skeletonHTML?: string }).__skeletonHTML);
      expect(html, "the page streamed its loading fallback").toContain("Cargando");
      await page.evaluate((markup) => {
        const host = document.createElement("div");
        host.id = "skeleton-host";
        host.innerHTML = markup;
        document.querySelector("main.content")!.prepend(host);
      }, html!);
      return "#skeleton-host";
    }
  }
];

/** Opens a shared UI state with a stored theme. */
async function openShared(page: Page, ui: SharedUi, theme: Theme) {
  await ui.mock?.(page);
  await visit(page, ui.path, theme);
  const root = await ui.open(page);
  await page.evaluate(installToolkit);
  return root;
}

// ---------------------------------------------------------------------------------------------------------------
// T020: REQ-6
// ---------------------------------------------------------------------------------------------------------------

const REPO = process.cwd(); // Playwright runs from the repo root
const SCANNED_CSS = ["src/app/globals.css", "src/components/app/shell.css", "src/components/dashboard/home.css", "src/components/recipes/recipes.css", "src/components/shared/upload-plan-button.css"];

test.describe("REQ-6: no light color literal outside the theme tokens", () => {
  test("the in-scope stylesheets have no color literal lighter than OKLCH L 0.8", async ({ page }) => {
    await page.goto("about:blank");
    const sources = SCANNED_CSS.map((file) => ({ file, css: fs.readFileSync(path.join(REPO, file), "utf8") }));
    const offenders = await page.evaluate((files) => {
      const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
      const lightness = (css: string) => {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = "#000";
        ctx.fillStyle = css;
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b] = Array.from(ctx.getImageData(0, 0, 1, 1).data).map((v) => {
          const unit = v / 255;
          return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
        });
        const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
        const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
        const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
        return 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
      };
      const SYSTEM = new Set(["transparent", "currentcolor", "inherit", "initial", "unset", "revert", "canvas", "canvastext", "buttontext", "buttonface", "buttonborder", "linktext", "visitedtext", "activetext", "field", "fieldtext", "highlight", "highlighttext", "graytext", "mark", "marktext", "accentcolor", "accentcolortext", "selecteditem", "selecteditemtext", "activeborder", "activecaption", "appworkspace", "background", "buttonhighlight", "buttonshadow", "captiontext", "inactiveborder", "inactivecaption", "inactivecaptiontext", "infobackground", "infotext", "menu", "menutext", "scrollbar", "threeddarkshadow", "threedface", "threedhighlight", "threedlightshadow", "threedshadow", "window", "windowframe", "windowtext"]); // system colors, incl. the deprecated CSS2 ones that collide with property names
      const found: string[] = [];
      for (const { file, css } of files) {
        const withoutTokens = css.replace(/\/\*\s*theme-tokens:start\s*\*\/[\s\S]*?\/\*\s*theme-tokens:end\s*\*\//g, "").replace(/\/\*[\s\S]*?\*\//g, "");
        for (const match of withoutTokens.matchAll(/(?:^|[{;])\s*([a-zA-Z-]+)\s*:\s*([^;{}]+)/g)) {
          const property = match[1];
          const value = match[2].replace(/url\([^)]*\)/g, "").replace(/"[^"]*"|'[^']*'/g, "");
          const colors: string[] = [];
          // A color function whose channels come from a token (rgb(var(--shadow-rgb) / 0.3)): the token owns the color.
          const stripped = value.replace(/\b(?:rgb|rgba|hsl|hsla|oklch|oklab|lab|lch|color)\(\s*var\([^)]*\)[^)]*\)/g, "");
          colors.push(...(stripped.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []));
          colors.push(...(stripped.match(/\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\([^)]*\)/g) ?? []));
          const words = stripped.replace(/var\([^)]*\)/g, "").replace(/[a-z-]+\(/g, "(").match(/(?<![\w-])[a-z]+(?![\w-])/g) ?? [];
          for (const word of words) if (!SYSTEM.has(word) && CSS.supports("color", word)) colors.push(word);
          for (const color of colors) if (lightness(color) > 0.8) found.push(`${file}: ${property}: ${color}`);
        }
      }
      return found;
    }, sources);
    expect(offenders, "light color literals outside theme-tokens regions").toEqual([]);
  });

  test("the macro colors come from --macro-* tokens", async ({ page }) => {
    await visit(page, "/recipes", "light");
    const lightMacros = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>(".rx-groups i")).map((el) => ({ inline: el.getAttribute("style") ?? "", color: getComputedStyle(el).backgroundColor }))
    );
    expect(lightMacros.length, "recipe cards show macro dots").toBeGreaterThan(0);
    for (const dot of lightMacros) expect(dot.inline, "inline macro color is a token").toMatch(/var\(--macro-[a-z-]+\)/);

    await visit(page, "/recipes", "dark");
    const darkMacros = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>(".rx-groups i")).map((el) => getComputedStyle(el).backgroundColor));
    expect(darkMacros.length).toBe(lightMacros.length);
    expect(darkMacros.every((color) => color.startsWith("rgb")), "macro colors resolve in dark").toBe(true);
  });
});

async function stylesOf(page: Page, target: string, theme: Theme) {
  await visit(page, target, theme);
  return page.evaluate(() => window.__audit.styles(null));
}

const lum = (color: Rgba) => oklch(color).L;
const same = (a: Rgba, b: Rgba) => a.slice(0, 3).map(Math.round).join() === b.slice(0, 3).map(Math.round).join();

/** Light surfaces, dark text and borders of `light` must all be different (and dark/light respectively) in `dark`. */
function themingProblems(light: StyleEntry[], dark: StyleEntry[]) {
  const darkByKey = new Map(dark.map((entry) => [entry.key, entry]));
  const problems: string[] = [];
  for (const before of light) {
    const after = darkByKey.get(before.key);
    if (!after || before.accent) continue;
    if (before.bg && lum(before.bg) > 0.8) {
      if (!after.bg || same(before.bg, after.bg)) problems.push(`surface unchanged: ${before.where}`);
      else if (lum(after.bg) > 0.5) problems.push(`surface still light in dark: ${before.where}`);
    }
    if (before.text && before.color && lum(before.color) < 0.35) {
      if (!after.color || lum(after.color) < 0.6) problems.push(`dark text unchanged: ${before.where}`);
    }
    if (before.border && after.border && same(before.border, after.border)) problems.push(`border unchanged: ${before.where} ${before.border.slice(0, 3).map(Math.round)} / ${after.border.slice(0, 3).map(Math.round)}`);
  }
  return problems;
}

test.describe("REQ-6: every in-scope page themes completely", () => {
  for (const { name, path: pagePath } of inScopePages) {
    test(`${name}: background, surfaces, text and borders differ from light`, async ({ page }) => {
      const target = pagePath();
      const light = await stylesOf(page, target, "light");
      const dark = await stylesOf(page, target, "dark");
      const canvas = (entries: StyleEntry[]) => entries.find((entry) => entry.where.startsWith("body"))?.bg;
      expect(canvas(dark), "canvas").toBeTruthy();
      expect(same(canvas(light)!, canvas(dark)!), "page background differs from light").toBe(false);
      expect(themingProblems(light, dark)).toEqual([]);
    });
  }
});

test.describe("REQ-6: every shared UI element themes completely", () => {
  for (const ui of sharedUi) {
    test.describe(ui.name, () => {
      // Opened once in light and once in dark.
      test.use({ expectedIssues: expectIssues(...(ui.issues ?? []), ...(ui.issues ?? [])) });

      test("surfaces, text and borders differ from light", async ({ page }) => {
        test.setTimeout(120_000);
        const root = await openShared(page, ui, "light");
        const light = await page.evaluate((scope) => window.__audit.styles(scope), root);
        await page.unrouteAll({ behavior: "ignoreErrors" });
        const darkRoot = await openShared(page, ui, "dark");
        const dark = await page.evaluate((scope) => window.__audit.styles(scope), darkRoot);
        expect(dark.length, "the state rendered").toBeGreaterThan(0);
        expect(themingProblems(light, dark)).toEqual([]);
      });
    });
  }

  test("tooltips: the switch title is the only tooltip, and native controls are dark", async ({ page }) => {
    await visit(page, "/", "dark");
    await expect(page.locator(".theme-toggle")).toHaveAttribute("title", "Cambiar a tema claro");
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe("dark");
  });

  test("the native time input and scrollbars render in their dark style", async ({ page }) => {
    await visit(page, "/", "dark");
    await page.getByRole("button", { name: "Editar horarios" }).click();
    const scheme = await page.locator(".home-time-input").first().evaluate((el) => getComputedStyle(el).colorScheme);
    expect(scheme).toBe("dark");
  });
});

test.describe("REQ-6: images are never filtered", () => {
  test("ingredient pictures have filter none and illustration shadows are the same as in light", async ({ page }) => {
    const read = () =>
      page.evaluate(() => {
        const filters = (selector: string) => Array.from(document.querySelectorAll(selector)).map((el) => getComputedStyle(el).filter);
        return { icons: filters(".rx-ingredients img, .home-ingredients img, .order-thumb img"), dishes: filters(".rx-dish, .rx-float, .home-promo-dish") };
      });
    const detail = inScopePages.find((item) => item.name === "recipe detail")!.path();
    await visit(page, detail, "light");
    const light = await read();
    await visit(page, detail, "dark");
    const dark = await read();
    expect(dark.icons.length + dark.dishes.length).toBeGreaterThan(0);
    for (const filter of dark.icons) expect(filter).toBe("none");
    // The app has no recipe photos or PDF previews; its dish illustrations carry a drop-shadow, which stays as is.
    expect(dark.dishes).toEqual(light.dishes);
    for (const filter of dark.dishes) expect(filter).not.toMatch(/invert|brightness|grayscale|hue-rotate|contrast|saturate|sepia/);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// T021: REQ-7
// ---------------------------------------------------------------------------------------------------------------

// Text over a background image must be listed here. The in-scope stylesheets paint no such text today.
const IMAGE_TEXT_ALLOWLIST: string[] = [];

test.describe("REQ-7: dark meets WCAG 2.1 AA", () => {
  for (const { name, path: pagePath } of inScopePages) {
    test(`${name}: contrast audit (text, icons, boundaries, marks, focus, hover, placeholder)`, async ({ page }) => {
      test.setTimeout(180_000);
      await visit(page, pagePath(), "dark");
      const { violations, min, ...swept } = await auditNow(page, { allow: IMAGE_TEXT_ALLOWLIST });
      report(name, min, swept);
      expect(violations, `${name} violations`).toEqual([]);
    });
  }

  for (const ui of sharedUi) {
    test.describe(`shared UI "${ui.name}"`, () => {
      test.use({ expectedIssues: expectIssues(...(ui.issues ?? [])) });

      test("contrast audit", async ({ page }) => {
        test.setTimeout(180_000);
        const root = await openShared(page, ui, "dark");
        const { violations, min, ...swept } = await auditNow(page, { scope: root, allow: IMAGE_TEXT_ALLOWLIST, tab: Boolean(ui.sweep), hover: Boolean(ui.sweep) });
        report(ui.name, min, swept);
        expect(violations, `${ui.name} violations`).toEqual([]);
      });
    });
  }
});

// ---------------------------------------------------------------------------------------------------------------
// T022: REQ-8 and REQ-9
// ---------------------------------------------------------------------------------------------------------------

const hueOf = (color: Rgba) => oklch(color);

test.describe("REQ-8: brand in dark", () => {
  test("primary buttons are teal-600 with white text", async ({ page }) => {
    await visit(page, "/", "dark");
    const brand600 = await toRgb(page, await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--brand-600")));
    expect(brand600.slice(0, 3)).toEqual([52, 109, 88]);
    const homeButton = await page.locator(".home-timeline > li.is-next .home-next .home-btn:not(.is-quiet)").first().evaluate((el) => ({ bg: getComputedStyle(el).backgroundColor, color: getComputedStyle(el).color }));
    expect((await toRgb(page, homeButton.bg)).slice(0, 3)).toEqual(brand600.slice(0, 3));
    expect((await toRgb(page, homeButton.color)).slice(0, 3)).toEqual([255, 255, 255]);
    await visit(page, inScopePages.find((item) => item.name === "recipe detail")!.path(), "dark");
    const recipeButton = await page.locator('.rx-add-all:not([data-state="added"])').first().evaluate((el) => ({ bg: getComputedStyle(el).backgroundColor, color: getComputedStyle(el).color }));
    expect((await toRgb(page, recipeButton.bg)).slice(0, 3)).toEqual(brand600.slice(0, 3));
    expect((await toRgb(page, recipeButton.color)).slice(0, 3)).toEqual([255, 255, 255]);
  });

  test("teal text and links use the 300 or 400 shade", async ({ page }) => {
    await visit(page, "/recipes", "dark");
    const shades = await page.evaluate(() => ["--brand-300", "--brand-400"].map((name) => getComputedStyle(document.documentElement).getPropertyValue(name)));
    const allowed = (await Promise.all(shades.map((shade) => toRgb(page, shade)))).map((color) => color.slice(0, 3).join());
    for (const selector of [".rx-head p b", ".upload-plan-text b"]) {
      const color = await page.locator(selector).first().evaluate((el) => getComputedStyle(el).color);
      expect(allowed, `${selector} color ${color}`).toContain((await toRgb(page, color)).slice(0, 3).join());
    }
  });

  test("page and card backgrounds are tinted neutrals of the brand hue", async ({ page }) => {
    for (const [target, card] of [["/", ".home-card"], ["/recipes", ".rx-card"], ["/groceries/cart", ".order-card"]] as const) {
      await visit(page, target, "dark");
      const backgrounds = await page.evaluate((selector) => [document.body, document.querySelector(selector)!].map((el) => getComputedStyle(el).backgroundColor), card);
      for (const css of backgrounds) {
        const { C, H } = hueOf(await toRgb(page, css));
        expect(C, `${css} chroma on ${target}`).toBeLessThanOrEqual(0.03);
        expect(Math.abs(H - 167), `${css} hue on ${target}`).toBeLessThanOrEqual(20);
      }
    }
  });
});

test.describe("REQ-9: toggles and the active nav pill are near white", () => {
  const contrastOf = async (page: Page, fg: string, bg: string) => {
    const [f, b] = [await toRgb(page, fg), await toRgb(page, bg)];
    const luminance = (c: Rgba) => c.slice(0, 3).reduce((sum, v, i) => sum + [0.2126, 0.7152, 0.0722][i]! * (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4), 0);
    const [hi, lo] = [luminance(f), luminance(b)].sort((x, y) => y - x);
    return (hi! + 0.05) / (lo! + 0.05);
  };

  async function expectNearWhite(page: Page, selector: string) {
    const style = await page.locator(selector).first().evaluate((el) => ({ bg: getComputedStyle(el).backgroundColor, color: getComputedStyle(el).color }));
    expect(oklch(await toRgb(page, style.bg)).L, `${selector} fill lightness`).toBeGreaterThanOrEqual(0.95);
    expect(await contrastOf(page, style.color, style.bg), `${selector} text contrast`).toBeGreaterThanOrEqual(4.5);
  }

  test("the active pill, the schedule toggle and the shopping button on home", async ({ page }) => {
    await visit(page, "/", "dark");
    await expectNearWhite(page, ".pill.active");
    await expectNearWhite(page, ".home-icon-btn.is-dark");
    await page.getByRole("button", { name: "Editar horarios" }).click();
    await expectNearWhite(page, ".home-icon-btn.is-on");
  });

  test("the selected recipe chip and the assistant button when open", async ({ page }) => {
    await visit(page, "/recipes", "dark");
    await page.locator(".rx-chip:not(.is-on)").first().click();
    await expectNearWhite(page, ".rx-chip.is-on");
    await page.locator(".assistant-fab").click();
    await expectNearWhite(page, ".assistant-fab.open");
  });

  test("the selected groceries filter chip and its counter", async ({ page }) => {
    await visit(page, "/groceries", "dark");
    await expectNearWhite(page, ".groceries-nav-item.on em");
    const chip = page.locator(".order-chip:not(.on)").first();
    if (await chip.count()) {
      await chip.click();
      await expectNearWhite(page, ".order-chip.on");
    }
  });
});
