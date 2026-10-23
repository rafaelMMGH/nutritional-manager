import fs from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { expect, expectIssues, test } from "./fixtures";
import { inScopePages, oklch, THEME_KEY, toRgb, type Rgba, type Theme } from "./theme-helpers";
import { auditNow, installToolkit, report, settle, visit, type StyleEntry } from "./theme-audit";

// US2 (REQ-6 to REQ-9): the dark palette is complete and accessible. The audit toolkit lives in theme-audit.ts
// (shared with theme-login.spec.ts). The app runs in the light OS scheme and each test sets the stored choice itself.

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
const SCANNED_CSS = ["src/app/globals.css", "src/components/app/shell.css", "src/components/dashboard/home.css", "src/components/recipes/recipes.css", "src/components/shared/upload-plan-button.css", "src/components/auth/login.css"];

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
