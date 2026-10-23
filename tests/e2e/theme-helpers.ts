import type { BrowserContext, Locator, Page } from "@playwright/test";
import { expect } from "./fixtures";
import { sql } from "./database";

// Shared by the theme specs (theme-switch, theme-public, theme-palette, theme-motion, theme-login, a-theme-visual).

export type Theme = "light" | "dark";
export const THEME_KEY = "nm-theme";

/**
 * Stores a theme choice (or removes it with null) before the first script of every page in the context runs.
 * The marker makes it a one-time seed per value, so a reload keeps whatever the app stored in between.
 */
export async function seedTheme(target: Page | BrowserContext, theme: Theme | null) {
  await target.addInitScript(
    ([key, value]) => {
      if (localStorage.getItem("__seeded-theme") === String(value)) return;
      if (value) localStorage.setItem(key, value);
      else localStorage.removeItem(key);
      localStorage.setItem("__seeded-theme", String(value));
    },
    [THEME_KEY, theme] as const
  );
}

/** Makes localStorage reads and writes of the theme key throw, like a browser with blocked storage. */
export async function blockThemeStorage(target: Page | BrowserContext) {
  await target.addInitScript((key) => {
    for (const method of ["getItem", "setItem", "removeItem"] as const) {
      const original = Storage.prototype[method];
      Storage.prototype[method] = function (this: Storage, name: string, ...rest: string[]) {
        if (name === key) throw new DOMException("Storage is blocked for this test", "SecurityError");
        return (original as (...args: string[]) => string | null | void).call(this, name, ...rest) as never;
      } as never;
    }
  }, THEME_KEY);
}

export type Rgba = [number, number, number, number];

/** Any CSS color (Chrome reports oklch() and color()) as sRGB 0-255 plus alpha 0-1, resolved in the page by a canvas. */
export function toRgb(page: Page, css: string): Promise<Rgba> {
  return page.evaluate((value) => {
    const context = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = value;
    context.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
    return [r, g, b, a / 255] as Rgba;
  }, css);
}

const channel = (value: number) => {
  const unit = value / 255;
  return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]: Rgba) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

/** WCAG 2.1 contrast ratio between two opaque colors. */
export function contrast(a: Rgba, b: Rgba) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** sRGB color as OKLCH: lightness 0-1, chroma, hue in degrees. */
export function oklch([r, g, b]: Rgba) {
  const [lr, lg, lb] = [r, g, b].map(channel);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { L, C: Math.hypot(A, B), H: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360 };
}

/** The opaque color an element is painted over: its own and its ancestors' backgrounds composited, down to the canvas. */
export function effectiveBackground(target: Locator): Promise<Rgba> {
  return target.evaluate((element) => {
    const context = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
    const resolve = (css: string): [number, number, number, number] => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = css;
      context.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
      return [r, g, b, a / 255];
    };
    const layers: [number, number, number, number][] = [];
    for (let node: Element | null = element; node; node = node.parentElement) {
      const color = resolve(getComputedStyle(node).backgroundColor);
      if (color[3] > 0) layers.push(color);
      if (color[3] === 1) break;
    }
    // Nothing opaque in the chain: the browser paints the system canvas, which follows color-scheme.
    const probe = document.createElement("div");
    probe.style.backgroundColor = "Canvas";
    document.documentElement.append(probe);
    const base = resolve(getComputedStyle(probe).backgroundColor);
    probe.remove();
    if (!layers.some((layer) => layer[3] === 1)) layers.push(base);
    let [r, g, b] = layers[layers.length - 1];
    for (let index = layers.length - 2; index >= 0; index--) {
      const [lr, lg, lb, la] = layers[index];
      r = lr * la + r * (1 - la);
      g = lg * la + g * (1 - la);
      b = lb * la + b * (1 - la);
    }
    return [Math.round(r), Math.round(g), Math.round(b), 1] as [number, number, number, number];
  });
}

/** The page background (`--canvas`) as sRGB, whatever theme is active. */
export const canvasColor = (page: Page) => effectiveBackground(page.locator("body"));

/** html `color-scheme` is the theme, and meta theme-color equals the page background. */
export async function expectThemeMeta(page: Page, theme: Theme) {
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).colorScheme), { message: "html color-scheme" }).toBe(theme);
  const metas = await page.locator('meta[name="theme-color"]').evaluateAll((elements) => elements.map((element) => element.getAttribute("content")));
  expect(metas, "exactly one theme-color meta").toHaveLength(1);
  expect(await toRgb(page, metas[0]!), "theme-color equals the page background").toEqual(await canvasColor(page));
}

/** Marks the document so a later check can prove a navigation was client-side (the marker survived). */
export async function softNavMarker(page: Page) {
  await page.evaluate(() => {
    (window as unknown as { __soft: boolean }).__soft = true;
  });
  return {
    expectSoft: async () => expect(await page.evaluate(() => (window as unknown as { __soft?: boolean }).__soft), "client-side navigation").toBe(true)
  };
}

/**
 * Signed-in pages that get the dark theme. Paths are resolved lazily because the recipe id comes from the e2e
 * database, which only exists once global setup has run.
 */
export const inScopePages: { name: string; path: () => string }[] = [
  { name: "home", path: () => "/" },
  { name: "recipes", path: () => "/recipes" },
  { name: "recipe detail", path: () => `/recipes/${sql("select id from recipes where deleted_at is null order by seq limit 1")}` },
  { name: "recipe not found", path: () => "/recipes/no-existe-e2e" },
  { name: "groceries", path: () => "/groceries" },
  { name: "cart", path: () => "/groceries/cart" },
  { name: "templates", path: () => "/groceries/templates" },
  { name: "plans", path: () => "/plans" },
  { name: "trash", path: () => "/trash" },
  { name: "settings", path: () => "/settings" }
];

/** Pages that always render light. They are visited signed out, like a visitor. */
export const lightLockedPages = [
  { name: "landing", path: "/" },
  { name: "inicio", path: "/inicio" },
  { name: "privacidad", path: "/privacidad" },
  { name: "terminos", path: "/terminos" },
  { name: "not found", path: "/no-existe" }
];

/** Dates, times and counters that change between runs, plus the topbar area that holds the switch. */
export function dynamicMasks(page: Page): Locator[] {
  return [".topbar-account", "time", ".home-hello", ".home-strip-days", ".home-timeline", ".home-count", ".home-tiles", ".home-intake-list", ".home-water"].map((selector) => page.locator(selector));
}
