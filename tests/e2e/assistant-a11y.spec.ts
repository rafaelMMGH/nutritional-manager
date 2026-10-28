import type { Locator, Page } from "@playwright/test";
import { expectIssues } from "./fixtures";
import { auditNow, installToolkit, visit } from "./theme-audit";
import { canvasColor, contrast, effectiveBackground, toRgb, type Rgba, type Theme } from "./theme-helpers";
import { assistantUi, buildAnswer, cartAnswer, createChatUser, deleteChatUser, expect, focusWalk, mockChat, openAssistant, test } from "./assistant-helpers";

// The assistant as a phone sheet. Spec assistant-chat-polish, US5: REQ-15 (geometry, touch targets, safe areas, the
// on-screen keyboard, long tokens), REQ-14 at 360 px (backdrop, focus rings), REQ-17 (turn names, live region) and REQ-22
// (modality and focus).

test.beforeAll(() => createChatUser("a11y"));
test.afterAll(() => deleteChatUser());

const QUESTION = "¿Qué tengo en mi carrito?";
const FAILED_500 = [/POST \/api\/rag\/chat → 500/, /Failed to load resource.*500/];
const PHONE = { width: 360, height: 740 };
const ERROR_TEXT = "No pude responder en este momento.";

/** The browser reports no SpeechRecognition on this build: stub it so the mic (a target to measure) is rendered. */
async function withMic(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = class {
      start() {}
      stop() {}
      abort() {}
    };
  });
}

/** Opens the panel and waits out its 180 ms transition, so boxes are measured at rest. */
async function openSheet(page: Page) {
  const ui = await openAssistant(page);
  await ui.panel.evaluate((node) => Promise.all(node.getAnimations().map((animation) => animation.finished)));
  return ui;
}

async function ask(page: Page, message: string) {
  const ui = assistantUi(page);
  await ui.input.fill(message);
  await ui.send.click();
}

type Box = { x: number; y: number; width: number; height: number };
const boxOf = (locator: Locator) =>
  locator.evaluate((node): Box => {
    const { x, y, width, height } = node.getBoundingClientRect();
    return { x, y, width, height };
  });

/** Every box is at least 44×44 and no two of them intersect. */
async function expectTargets(targets: Record<string, Locator>) {
  const boxes: [string, Box][] = [];
  for (const [name, locator] of Object.entries(targets)) {
    const count = await locator.count();
    expect(count, `${name} is rendered`).toBeGreaterThan(0);
    for (let index = 0; index < count; index++) boxes.push([count > 1 ? `${name} ${index + 1}` : name, await boxOf(locator.nth(index))]);
  }
  for (const [name, box] of boxes) {
    expect(box.width, `${name} width`).toBeGreaterThanOrEqual(44);
    expect(box.height, `${name} height`).toBeGreaterThanOrEqual(44);
  }
  const overlap = (a: Box, b: Box) => a.x < b.x + b.width - 0.5 && b.x < a.x + a.width - 0.5 && a.y < b.y + b.height - 0.5 && b.y < a.y + a.height - 0.5;
  for (let first = 0; first < boxes.length; first++) {
    for (let second = first + 1; second < boxes.length; second++) {
      expect(overlap(boxes[first][1], boxes[second][1]), `${boxes[first][0]} and ${boxes[second][0]} do not overlap`).toBe(false);
    }
  }
}

test.describe("REQ-15: a short landscape phone", () => {
  test.use({ viewport: { width: 740, height: 360 } });

  test("the panel is inside the viewport and the input is fully visible", async ({ chat }) => {
    await mockChat(chat, cartAnswer(8));
    await chat.goto("/");
    const ui = await openSheet(chat);
    await ask(chat, QUESTION);
    await expect(ui.assistantTurns).toHaveCount(1);
    const inside = async (locator: Locator) => {
      const box = await boxOf(locator);
      expect(box.height).toBeGreaterThan(0);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(740);
      expect(box.y + box.height).toBeLessThanOrEqual(360);
    };
    await inside(ui.panel);
    await inside(ui.input);
    await inside(ui.send);
  });
});

test.describe("REQ-15: the sheet at 360 px", () => {
  test.use({ viewport: PHONE });

  test("it fills the height, the FAB is hidden and the backdrop is present and inert to clicks", async ({ chat }) => {
    await chat.goto("/");
    const ui = assistantUi(chat);
    await expect(ui.fab).toBeVisible();
    await expect(ui.backdrop).toHaveCount(0);
    await openSheet(chat);
    await expect(ui.fab).toBeHidden();
    await expect(ui.backdrop).toHaveCount(1);
    const panel = await boxOf(ui.panel);
    expect(panel.x).toBeCloseTo(8, 0);
    // The backdrop is the fixed containing block (a classic scrollbar narrows it), so the gutters are measured against it.
    expect(panel.width).toBeCloseTo((await boxOf(ui.backdrop)).width - 16, 0);
    expect(panel.y).toBeLessThanOrEqual(1);
    expect(panel.y + panel.height).toBeGreaterThanOrEqual(PHONE.height - 1);

    const overlay = await toRgb(chat, await chat.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--overlay-modal")));
    expect(await toRgb(chat, await ui.backdrop.evaluate((node) => getComputedStyle(node).backgroundColor))).toEqual(overlay);

    // The spec defines no backdrop action: a click in the gutter leaves the sheet open.
    await chat.mouse.click(3, 300);
    await expect(ui.panel).toBeVisible();
    await expect(ui.backdrop).toHaveCount(1);

    await ui.close.click();
    await expect(ui.backdrop).toHaveCount(0);
    await expect(ui.fab).toBeVisible();
  });

  test("FAB, close, chips, mic and send are 44 px targets that do not overlap", async ({ chat }) => {
    await withMic(chat);
    await chat.goto("/");
    const ui = assistantUi(chat);
    await expectTargets({ FAB: ui.fab });
    await openSheet(chat);
    await expectTargets({ "×": ui.close, chips: ui.chips, mic: ui.panel.getByRole("button", { name: "Dictar pregunta" }), send: ui.send });
    // The field is a target too (its width is the pill's, so only the height is checked).
    expect((await boxOf(ui.input)).height).toBeGreaterThanOrEqual(44);
  });

  test("the scope button and every menu option are 44 px targets that do not overlap", async ({ chat }) => {
    await chat.goto("/");
    const ui = await openSheet(chat);
    const button = ui.panel.getByRole("button", { name: "Alcance: Todo" });
    await expectTargets({ "×": ui.close, "Alcance": button });
    await button.click();
    const options = ui.panel.getByRole("listbox", { name: "Alcance" }).getByRole("option");
    await expect(options).toHaveCount(4);
    await expectTargets({ "×": ui.close, "Alcance": button, option: options });
  });

  test("with a thread: Nueva conversación and Ir al último mensaje too, and the header takes two rows", async ({ chat }) => {
    await withMic(chat);
    await mockChat(chat, cartAnswer(8));
    await chat.goto("/");
    const ui = await openSheet(chat);
    for (let turn = 1; turn <= 3; turn++) {
      await ask(chat, QUESTION);
      await expect(ui.assistantTurns).toHaveCount(turn);
    }
    await ui.log.evaluate((node) => node.scrollTo({ top: 0, behavior: "instant" }));
    const scroll = chat.getByRole("button", { name: "Ir al último mensaje" });
    await expect(chat.locator(".assistant-scroll.visible")).toBeVisible();
    await scroll.evaluate((node) => Promise.all(node.getAnimations().map((animation) => animation.finished)));
    const visibleChips = ui.chips.filter({ visible: true });
    await expectTargets({
      "×": ui.close,
      "Nueva conversación": chat.getByRole("button", { name: "Nueva conversación" }),
      "Ir al último mensaje": scroll,
      mic: ui.panel.getByRole("button", { name: "Dictar pregunta" }),
      send: ui.send
    });
    // Chips below the fold are not on screen, so they are measured once the log is at its end.
    await ui.log.evaluate((node) => node.scrollTo({ top: node.scrollHeight, behavior: "instant" }));
    await expect(visibleChips.first()).toBeVisible();
    await expectTargets({ "×": ui.close, "Nueva conversación": chat.getByRole("button", { name: "Nueva conversación" }), chips: visibleChips, send: ui.send });

    // Row 1: title and ×. Row 2: the scope line and Nueva conversación (the scope button sits on it too).
    const title = await boxOf(ui.panel.getByRole("heading", { name: "Asistente" }));
    const close = await boxOf(ui.close);
    const fresh = await boxOf(chat.getByRole("button", { name: "Nueva conversación" }));
    expect(Math.abs(title.y + title.height / 2 - (close.y + close.height / 2))).toBeLessThan(title.height);
    expect(fresh.y).toBeGreaterThanOrEqual(close.y + close.height - 1);
    expect(fresh.x + fresh.width).toBeLessThanOrEqual(PHONE.width - 8);
  });

  test.describe("an error", () => {
    test.use({ expectedIssues: expectIssues(...FAILED_500) });

    test("Reintentar is a 44 px target", async ({ chat }) => {
      await mockChat(chat, cartAnswer(), { status: 500 });
      await chat.goto("/");
      const ui = await openSheet(chat);
      await ask(chat, QUESTION);
      const retry = chat.getByRole("button", { name: "Reintentar" });
      await expect(retry).toBeVisible();
      await expectTargets({ Reintentar: retry, "×": ui.close, send: ui.send });
    });
  });

  test("a long unbroken token wraps and nothing scrolls sideways", async ({ chat }) => {
    await mockChat(chat, cartAnswer());
    await chat.goto("/");
    const ui = await openSheet(chat);
    await ask(chat, "y".repeat(400));
    await expect(ui.assistantTurns).toHaveCount(1);
    const overflow = await chat.evaluate(() => {
      const panel = document.querySelector(".assistant-chat") as HTMLElement;
      const log = document.querySelector(".assistant-chat-log") as HTMLElement;
      return { panel: panel.scrollWidth - panel.clientWidth, log: log.scrollWidth - log.clientWidth, page: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    expect(overflow.panel).toBe(0);
    expect(overflow.log).toBe(0);
    expect(overflow.page).toBeLessThanOrEqual(0);
  });
});

test.describe("REQ-15: safe areas and the on-screen keyboard", () => {
  test.use({ viewport: PHONE });

  test("the sheet pads for the notch, the home bar and the sides", async ({ chat }) => {
    const cdp = await chat.context().newCDPSession(chat);
    const insets = { top: 24, bottom: 34, left: 10, right: 12 };
    await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets });
    await chat.goto("/");
    const ui = await openSheet(chat);
    // What env() reads in this page: 0 when the app has no viewport-fit=cover (it does not; that is an app-wide backlog item).
    const probe = await chat.evaluate(() => {
      const node = document.createElement("div");
      node.style.cssText = "position:fixed;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)";
      document.body.append(node);
      const cs = getComputedStyle(node);
      const read = { top: parseFloat(cs.paddingTop), right: parseFloat(cs.paddingRight), bottom: parseFloat(cs.paddingBottom), left: parseFloat(cs.paddingLeft) };
      node.remove();
      return read;
    });
    const padding = await ui.panel.evaluate((node) => {
      const cs = getComputedStyle(node);
      return { top: parseFloat(cs.paddingTop), right: parseFloat(cs.paddingRight), bottom: parseFloat(cs.paddingBottom), left: parseFloat(cs.paddingLeft) };
    });
    const strong = probe.top === insets.top && probe.bottom === insets.bottom && probe.left === insets.left && probe.right === insets.right;
    if (!strong) {
      test.info().annotations.push({ type: "weak check", description: `env(safe-area-inset-*) reads ${JSON.stringify(probe)} without viewport-fit=cover, so the sheet is compared with the probe, not with the override.` });
    }
    const expected = strong ? insets : probe;
    for (const side of ["top", "right", "bottom", "left"] as const) expect(padding[side], side).toBeGreaterThanOrEqual(expected[side]);
  });

  /** A visualViewport the test can resize, as a phone does when the keyboard opens. */
  async function stubVisualViewport(page: Page) {
    await page.addInitScript(() => {
      const stub = Object.assign(new EventTarget(), { height: innerHeight, width: innerWidth, offsetTop: 0, offsetLeft: 0, pageTop: 0, pageLeft: 0, scale: 1 });
      Object.defineProperty(window, "visualViewport", { value: stub, configurable: true });
    });
  }
  const resizeStub = (page: Page, height: number, offsetTop = 0) =>
    page.evaluate(([nextHeight, nextTop]) => {
      const stub = window.visualViewport as unknown as EventTarget & { height: number; offsetTop: number };
      stub.height = nextHeight;
      stub.offsetTop = nextTop;
      stub.dispatchEvent(new Event("resize"));
    }, [height, offsetTop]);

  test("the input stays above a keyboard that shrinks the visual viewport", async ({ chat }) => {
    await stubVisualViewport(chat);
    await chat.goto("/");
    const ui = await openSheet(chat);
    await resizeStub(chat, 420);
    await expect.poll(async () => (await boxOf(ui.panel)).height).toBeCloseTo(420, 0);
    for (const locator of [ui.input, ui.send]) {
      const box = await boxOf(locator);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(420);
    }
    // iOS scrolls the visual viewport inside the layout viewport: the sheet follows its top edge.
    await resizeStub(chat, 420, 100);
    await expect.poll(async () => (await boxOf(ui.panel)).y).toBeCloseTo(100, 0);
  });

  test("a real 360×420 window keeps the input inside", async ({ chat }) => {
    await chat.goto("/");
    const ui = await openSheet(chat);
    await chat.setViewportSize({ width: 360, height: 420 });
    await expect.poll(async () => (await boxOf(ui.panel)).height).toBeLessThanOrEqual(420);
    const input = await boxOf(ui.input);
    expect(input.y).toBeGreaterThanOrEqual(0);
    expect(input.y + input.height).toBeLessThanOrEqual(420);
  });
});

// Spec v1.8, "Narrow header": at <=640 px Nueva conversación is an icon button named by aria-label and title and the subtitle
// is hidden; on a short window (<=480 px tall) wider than that only the subtitle gives way.
test.describe("REQ-15: the narrow header", () => {
  async function startThread(page: Page) {
    await mockChat(page, cartAnswer());
    await page.goto("/");
    const ui = await openSheet(page);
    await ask(page, QUESTION);
    await expect(ui.assistantTurns).toHaveCount(1);
    return ui;
  }
  const subtitleOf = (page: Page) => assistantUi(page).panel.locator("header p");

  test.describe("at 360x740", () => {
    test.use({ viewport: PHONE });
    test("the subtitle and the Nueva conversación text are hidden; the icon button keeps its name and tooltip", async ({ chat }) => {
      await startThread(chat);
      const fresh = assistantUi(chat).panel.getByRole("button", { name: "Nueva conversación", exact: true });
      // Hidden, not missing: toBeHidden also passes on an element that does not exist.
      await expect(subtitleOf(chat)).toHaveCount(1);
      await expect(fresh.locator("span")).toHaveCount(1);
      await expect(subtitleOf(chat)).toBeHidden();
      await expect(fresh).toHaveAttribute("title", "Nueva conversación");
      await expect(fresh.locator("span")).toBeHidden();
      expect(await fresh.evaluate((node) => (node as HTMLElement).innerText.trim())).toBe("");
      await expect(fresh).toBeVisible();
    });
  });

  test.describe("at 1024x420", () => {
    test.use({ viewport: { width: 1024, height: 420 } });
    test("only the subtitle is hidden; the Nueva conversación text shows", async ({ chat }) => {
      await startThread(chat);
      const fresh = assistantUi(chat).panel.getByRole("button", { name: "Nueva conversación", exact: true });
      await expect(subtitleOf(chat)).toHaveCount(1);
      await expect(subtitleOf(chat)).toBeHidden();
      await expect(fresh.locator("span")).toBeVisible();
      await expect(fresh.locator("span")).toHaveText("Nueva conversación");
    });
  });
});


// ---------------------------------------------------------------------------------------------------------------------
// REQ-17: turn names and the live region

test.describe("REQ-17: turns and the live region", () => {
  /** True when `locator` sits inside (or is) a live region. */
  const inLiveRegion = (locator: Locator) => locator.evaluate((node) => Boolean(node.closest("[aria-live]")));

  test("turns are exposed as Tú and Asistente and the assistant icon is hidden", async ({ chat }) => {
    await mockChat(chat, cartAnswer(3));
    await chat.goto("/");
    const ui = await openSheet(chat);
    await ask(chat, QUESTION);
    await expect(ui.assistantTurns).toHaveCount(1);
    await expect(ui.panel.getByRole("article", { name: "Tú", exact: true })).toHaveCount(1);
    await expect(ui.panel.getByRole("article", { name: "Asistente", exact: true })).toHaveCount(1);
    const icon = ui.assistantTurns.locator(".assistant-turn-head svg");
    await expect(icon).toHaveCount(1);
    await expect(icon).toHaveAttribute("aria-hidden", "true");
  });

  test("the region exists while pending without Pensando…, then holds the lead and every item and nothing else", async ({ chat }) => {
    const mock = await mockChat(chat, cartAnswer(3), { hold: true });
    await chat.goto("/");
    const ui = await openSheet(chat);
    await ask(chat, QUESTION);
    await expect(ui.pending).toHaveCount(1);
    await expect(ui.live).toHaveCount(1);
    await expect(ui.live).toHaveAttribute("aria-live", "polite");
    await expect(ui.live).toHaveText("");
    await expect(ui.pending.getByText("Pensando…")).toBeVisible();
    expect(await inLiveRegion(ui.pending.getByText("Pensando…"))).toBe(false);
    // The same element goes from pending to answer: a region inserted with its content is not reliably announced.
    await ui.live.evaluate((node) => node.setAttribute("data-probe", "same"));

    mock.release();
    await expect(ui.assistantTurns).toHaveCount(1);
    await expect(ui.live).toHaveAttribute("data-probe", "same");
    await expect(ui.live).toContainText("Esto es lo que tienes en tu carrito.");
    for (const item of ["Ingrediente 01 · 1 g", "Ingrediente 02 · 2 g", "Ingrediente 03 · 3 g"]) await expect(ui.live).toContainText(item);
    const region = (await ui.live.textContent()) ?? "";
    expect(region).not.toContain(QUESTION);
    expect(region).not.toContain((await ui.labels.first().textContent()) ?? "unreachable");
    for (const [name, locator] of Object.entries({ "user turn": ui.userTurns, label: ui.labels, chips: ui.chips.first() })) {
      expect(await inLiveRegion(locator.first()), `${name} is outside the region`).toBe(false);
    }
    expect(region).not.toContain((await ui.chips.first().textContent()) ?? "unreachable");
  });

  test.describe("an error", () => {
    test.use({ expectedIssues: expectIssues(...FAILED_500) });

    test("the region holds the error text but not Reintentar, which follows it in tab order", async ({ chat }) => {
      await mockChat(chat, cartAnswer(), { status: 500 });
      await chat.goto("/");
      const ui = await openSheet(chat);
      await ask(chat, QUESTION);
      await expect(ui.assistantTurns).toHaveCount(1);
      await expect(ui.live).toHaveText(ERROR_TEXT);
      const retry = ui.panel.getByRole("button", { name: "Reintentar" });
      expect(await inLiveRegion(retry)).toBe(false);
      const turn = ui.assistantTurns.first();
      await expect(turn).toHaveAttribute("tabindex", "-1");
      await turn.focus();
      await chat.keyboard.press("Tab");
      await expect(retry).toBeFocused();
    });
  });

  test("the existing accessible names are unchanged", async ({ chat }) => {
    await chat.addInitScript(() => {
      (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = class {
        onerror: ((event: { error: string }) => void) | null = null;
        start() {
          setTimeout(() => this.onerror?.({ error: "not-allowed" }), 0);
        }
        stop() {}
        abort() {}
      };
    });
    await chat.goto("/");
    const ui = assistantUi(chat);
    await expect(chat.getByRole("button", { name: "Abrir asistente", exact: true })).toBeVisible();
    await openSheet(chat);
    await expect(chat.getByRole("button", { name: "Cerrar asistente", exact: true })).toHaveCount(2);
    await expect(ui.panel.getByRole("textbox", { name: "Pregunta", exact: true })).toBeVisible();
    await ui.input.fill("hola");
    await expect(ui.panel.getByRole("button", { name: "Enviar", exact: true })).toBeEnabled();
    await ui.panel.getByRole("button", { name: "Dictar pregunta" }).click();
    await expect(ui.panel.getByRole("alert")).toHaveText("Permite el acceso al micrófono para dictar.");
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// REQ-22: modality and focus

/** The first starter chip of the empty thread, or the first chip under the latest answer. */
const firstChip = (page: Page) => assistantUi(page).chips.filter({ visible: true }).first();

test.describe("REQ-22: desktop is non-modal", () => {
  test("opening focuses the input and the page stays usable", async ({ chat }) => {
    await chat.goto("/");
    const ui = await openSheet(chat);
    await expect(ui.input).toBeFocused();
    await expect(ui.backdrop).toHaveCount(0);
    await expect(chat.locator("main.content")).toHaveJSProperty("inert", false);
    await expect(chat.locator("header.topbar")).toHaveJSProperty("inert", false);
    expect(await chat.evaluate(() => document.documentElement.style.overflow)).toBe("");
    await chat.getByRole("link", { name: "Compras" }).click();
    await expect(chat).toHaveURL(/\/groceries$/);
    await expect(ui.panel).toBeVisible();
  });

  test("Escape closes the panel and focuses the FAB", async ({ chat }) => {
    await chat.goto("/");
    const ui = await openSheet(chat);
    await chat.keyboard.press("Escape");
    await expect(ui.panel).toBeHidden();
    await expect(ui.fab).toBeFocused();
    await expect(ui.fab).toHaveAccessibleName("Abrir asistente");
  });

  test("a chip leaves focus in the input, while pending and after the answer", async ({ chat }) => {
    const mock = await mockChat(chat, cartAnswer(3), { hold: true });
    await chat.goto("/");
    const ui = await openSheet(chat);
    await firstChip(chat).click();
    await expect(ui.pending).toHaveCount(1);
    await expect(ui.input).toBeFocused();
    mock.release();
    await expect(ui.assistantTurns).toHaveCount(1);
    await expect(ui.input).toBeFocused();
  });

  test("Preguntar en Todo leaves focus in the input", async ({ chat }) => {
    await mockChat(chat, buildAnswer({ kind: "out_of_scope", lead: [{ text: "Eso no está en este alcance." }] }));
    await chat.goto("/");
    const ui = await openSheet(chat);
    await ask(chat, QUESTION);
    await expect(ui.assistantTurns).toHaveCount(1);
    const second = await mockChat(chat, cartAnswer(3), { hold: true });
    await chat.getByRole("button", { name: "Preguntar en Todo" }).click();
    await expect(ui.pending).toHaveCount(1);
    await expect(ui.input).toBeFocused();
    second.release();
    await expect(ui.assistantTurns).toHaveCount(2);
    await expect(ui.input).toBeFocused();
  });

  test.describe("an error", () => {
    test.use({ expectedIssues: expectIssues(...FAILED_500) });

    test("Reintentar leaves focus in the input", async ({ chat }) => {
      await mockChat(chat, cartAnswer(), { status: 500 });
      await chat.goto("/");
      const ui = await openSheet(chat);
      await ask(chat, QUESTION);
      const retry = chat.getByRole("button", { name: "Reintentar" });
      await expect(retry).toBeVisible();
      const second = await mockChat(chat, cartAnswer(3), { hold: true });
      await retry.click();
      await expect(ui.pending).toHaveCount(1);
      await expect(ui.input).toBeFocused();
      second.release();
      await expect(ui.live).toContainText("Esto es lo que tienes en tu carrito.");
      await expect(ui.input).toBeFocused();
    });
  });
});

/** Closing while a question is pending keeps it: the answer is in the thread on reopening and the FAB carries no badge. */
async function expectAnswerKeptAfterClosing(chat: Page, close: (ui: ReturnType<typeof assistantUi>) => Promise<void>) {
  const mock = await mockChat(chat, cartAnswer(3), { hold: true });
  await chat.goto("/");
  const ui = await openSheet(chat);
  await ask(chat, QUESTION);
  await expect(ui.pending).toHaveCount(1);
  await close(ui);
  await expect(ui.panel).toBeHidden();
  mock.release();
  await expect.poll(() => mock.requests.length).toBe(1);
  await chat.waitForTimeout(250);
  await expect(ui.fab).toHaveAccessibleName("Abrir asistente");
  expect(await ui.fab.evaluate((node) => ({ text: node.textContent?.trim(), children: node.children.length }))).toEqual({ text: "", children: 1 });
  await ui.fab.click();
  await expect(ui.assistantTurns).toHaveCount(1);
  await expect(ui.live).toContainText("Esto es lo que tienes en tu carrito.");
}

test.describe("REQ-22: closing while pending", () => {
  test("desktop: the answer lands and the FAB shows no badge", async ({ chat }) => {
    await expectAnswerKeptAfterClosing(chat, (ui) => ui.fab.click());
  });

  test.describe("at 360 px", () => {
    test.use({ viewport: PHONE });

    test("the answer lands and the FAB shows no badge", async ({ chat }) => {
      await expectAnswerKeptAfterClosing(chat, (ui) => ui.close.click());
    });
  });
});

test.describe("REQ-22: the sheet at 360 px is modal", () => {
  test.use({ viewport: PHONE });

  test("opening focuses the input, makes the page inert and locks its scroll", async ({ chat }) => {
    await chat.goto("/");
    const ui = assistantUi(chat);
    const scrollable = await chat.evaluate(() => document.documentElement.scrollHeight - document.documentElement.clientHeight);
    expect(scrollable, "the page scrolls without the sheet").toBeGreaterThan(0);
    await openSheet(chat);
    await expect(ui.input).toBeFocused();
    await expect(chat.locator("main.content")).toHaveJSProperty("inert", true);
    await expect(chat.locator("header.topbar")).toHaveJSProperty("inert", true);
    expect(await chat.evaluate(() => getComputedStyle(document.documentElement).overflow)).toBe("hidden");

    await chat.mouse.move(180, 300);
    await chat.mouse.wheel(0, 400);
    await chat.mouse.move(3, 300);
    await chat.mouse.wheel(0, 400);
    await chat.waitForTimeout(150);
    expect(await chat.evaluate(() => scrollY)).toBe(0);

    // Script focus cannot reach an inert page either.
    await chat.locator("main.content a, main.content button").first().evaluate((node) => (node as HTMLElement).focus());
    await expect(ui.input).toBeFocused();

    await ui.close.click();
    await expect(chat.locator("main.content")).toHaveJSProperty("inert", false);
    await expect(chat.locator("header.topbar")).toHaveJSProperty("inert", false);
    expect(await chat.evaluate(() => document.documentElement.style.overflow)).toBe("");
  });

  test("Tab and Shift+Tab never leave the sheet and wrap at its ends", async ({ chat }) => {
    await withMic(chat);
    await mockChat(chat, cartAnswer(3));
    await chat.goto("/");
    const ui = await openSheet(chat);
    await ask(chat, QUESTION);
    await expect(ui.assistantTurns).toHaveCount(1);
    await ui.input.fill("hola");
    const inside = () => chat.evaluate(() => Boolean(document.activeElement?.closest("#assistant-chat-panel")));
    const seen = new Set<string>();
    const name = () => chat.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.textContent?.trim() ?? document.activeElement?.tagName ?? "");
    for (let press = 0; press < 20; press++) {
      await chat.keyboard.press("Tab");
      expect(await inside(), `Tab ${press + 1}`).toBe(true);
      seen.add(await name());
    }
    for (let press = 0; press < 20; press++) {
      await chat.keyboard.press("Shift+Tab");
      expect(await inside(), `Shift+Tab ${press + 1}`).toBe(true);
    }
    // The ends: Enviar is the last control, the first one is the scope button (the desktop group is hidden at this width).
    expect([...seen]).toEqual(expect.arrayContaining(["Cerrar asistente", "Enviar", "Nueva conversación", "Pregunta", "Alcance: Todo"]));
    const scope = ui.panel.getByRole("button", { name: "Alcance: Todo" });
    await ui.send.focus();
    await chat.keyboard.press("Tab");
    await expect(scope).toBeFocused();
    await chat.keyboard.press("Shift+Tab");
    await expect(ui.send).toBeFocused();
    await scope.focus();
    await chat.keyboard.press("Shift+Tab");
    await expect(ui.send).toBeFocused();
  });

  test("with an empty thread the walk still stays in the sheet, skips the hidden desktop group and wraps at the scope button", async ({ chat }) => {
    await chat.goto("/");
    const ui = await openSheet(chat);
    const inside = () => chat.evaluate(() => Boolean(document.activeElement?.closest("#assistant-chat-panel")));
    const visited: string[] = [];
    for (let press = 0; press < 12; press++) {
      await chat.keyboard.press("Tab");
      expect(await inside(), `Tab ${press + 1}`).toBe(true);
      visited.push(await chat.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.textContent?.trim() ?? ""));
    }
    // Every stop is on screen: the display:none group's buttons are never visited, and the walk wraps around the real ones.
    expect(visited).toEqual(expect.arrayContaining(["Alcance: Todo", "Cerrar asistente", "Pregunta"]));
    for (const option of ["Todo", "Plan activo", "Recetario", "Carrito"]) expect(visited).not.toContain(option);
    // The wrap itself: Shift+Tab on the scope button, the first stop, lands on the last one.
    const scope = ui.panel.getByRole("button", { name: "Alcance: Todo" });
    await scope.focus();
    await chat.keyboard.press("Shift+Tab");
    await expect(ui.panel.locator(":focus")).toHaveCount(1);
    const last = await chat.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.textContent?.trim() ?? "");
    // The walk went round more than once, so a later visit of the scope button is preceded by the last stop.
    const again = visited.lastIndexOf("Alcance: Todo");
    expect(again, `visited ${visited.join(" | ")}`).toBeGreaterThan(0);
    expect(last).toBe(visited[again - 1]);
    for (let press = 0; press < 12; press++) {
      await chat.keyboard.press("Shift+Tab");
      expect(await inside(), `Shift+Tab ${press + 1}`).toBe(true);
    }
  });

  test("× closes the sheet and focus returns to the FAB", async ({ chat }) => {
    await chat.goto("/");
    const ui = await openSheet(chat);
    await ui.close.click();
    await expect(ui.panel).toBeHidden();
    await expect(ui.fab).toBeVisible();
    await expect(ui.fab).toBeFocused();
  });

  test("Escape closes the sheet and focus returns to the FAB", async ({ chat }) => {
    await chat.goto("/");
    const ui = await openSheet(chat);
    await chat.keyboard.press("Escape");
    await expect(ui.panel).toBeHidden();
    await expect(ui.fab).toBeFocused();
  });

  test("Ir al último mensaje and Nueva conversación focus the input", async ({ chat }) => {
    await mockChat(chat, cartAnswer(8));
    await chat.goto("/");
    const ui = await openSheet(chat);
    for (let turn = 1; turn <= 3; turn++) {
      await ask(chat, QUESTION);
      await expect(ui.assistantTurns).toHaveCount(turn);
    }
    await ui.log.evaluate((node) => node.scrollTo({ top: 0, behavior: "instant" }));
    await chat.getByRole("button", { name: "Ir al último mensaje" }).click();
    await expect(ui.input).toBeFocused();
    await chat.getByRole("button", { name: "Nueva conversación" }).click();
    await expect(ui.input).toBeFocused();
  });

  test("a chip focuses the log while pending, then the new turn, which is script-focusable only", async ({ chat }) => {
    const mock = await mockChat(chat, cartAnswer(3), { hold: true });
    await chat.goto("/");
    const ui = await openSheet(chat);
    await firstChip(chat).click();
    await expect(ui.pending).toHaveCount(1);
    await expect(ui.log).toBeFocused();
    mock.release();
    await expect(ui.assistantTurns).toHaveCount(1);
    await expect(ui.assistantTurns.last()).toBeFocused();
    await expect(ui.assistantTurns.last()).toHaveAttribute("tabindex", "-1");
  });

  test("a chip under an answer and Preguntar en Todo do the same", async ({ chat }) => {
    await mockChat(chat, buildAnswer({ kind: "out_of_scope", lead: [{ text: "Eso no está en este alcance." }] }));
    await chat.goto("/");
    const ui = await openSheet(chat);
    await ask(chat, QUESTION);
    await expect(ui.assistantTurns).toHaveCount(1);
    const second = await mockChat(chat, cartAnswer(3), { hold: true });
    await chat.getByRole("button", { name: "Preguntar en Todo" }).click();
    await expect(ui.pending).toHaveCount(1);
    await expect(ui.log).toBeFocused();
    second.release();
    await expect(ui.assistantTurns).toHaveCount(2);
    await expect(ui.assistantTurns.last()).toBeFocused();

    const third = await mockChat(chat, cartAnswer(2), { hold: true });
    await ui.chips.filter({ visible: true }).first().click();
    await expect(ui.pending).toHaveCount(1);
    await expect(ui.log).toBeFocused();
    third.release();
    await expect(ui.assistantTurns).toHaveCount(3);
    await expect(ui.assistantTurns.last()).toBeFocused();
  });

  test("focus the user moved elsewhere while waiting is left alone", async ({ chat }) => {
    const mock = await mockChat(chat, cartAnswer(3), { hold: true });
    await chat.goto("/");
    const ui = await openSheet(chat);
    await firstChip(chat).click();
    await expect(ui.log).toBeFocused();
    await ui.input.focus();
    mock.release();
    await expect(ui.assistantTurns).toHaveCount(1);
    await expect(ui.input).toBeFocused();
  });

  test.describe("a failing chip", () => {
    test.use({ expectedIssues: expectIssues(...FAILED_500) });

    test("focus is on the log while pending, then on the error turn, and Tab reaches Reintentar, which works the same way", async ({ chat }) => {
      const mock = await mockChat(chat, cartAnswer(), { status: 500, hold: true });
      await chat.goto("/");
      const ui = await openSheet(chat);
      await firstChip(chat).click();
      await expect(ui.pending).toHaveCount(1);
      await expect(ui.log).toBeFocused();
      mock.release();
      await expect(ui.assistantTurns).toHaveCount(1);
      await expect(ui.live).toHaveText(ERROR_TEXT);
      await expect(ui.assistantTurns.first()).toBeFocused();
      await expect(ui.assistantTurns.first()).toHaveAttribute("tabindex", "-1");
      await chat.keyboard.press("Tab");
      const retry = chat.getByRole("button", { name: "Reintentar" });
      await expect(retry).toBeFocused();

      const second = await mockChat(chat, cartAnswer(3), { hold: true });
      await retry.press("Enter");
      await expect(ui.pending).toHaveCount(1);
      await expect(ui.log).toBeFocused();
      second.release();
      await expect(ui.live).toContainText("Esto es lo que tienes en tu carrito.");
      await expect(ui.assistantTurns.first()).toBeFocused();
    });
  });
});

for (const theme of ["light", "dark"] as Theme[]) {
  test.describe(`REQ-14 at 360 px in the ${theme} theme`, () => {
    test.use({ viewport: PHONE });

    test("the sheet stands out from the dimmed page, its text passes and its controls show focus", async ({ chat }) => {
      test.setTimeout(120_000);
      await withMic(chat);
      await mockChat(chat, { ...cartAnswer(8), sources: ["Carrito actual"] });
      await visit(chat, "/", theme);
      const ui = await openSheet(chat);
      await expect(ui.backdrop).toHaveCount(1);
      let result = await auditNow(chat, { scope: ".assistant-chat", tab: false, hover: true });
      expect(result.violations, "empty sheet").toEqual([]);

      // The sheet against the page seen through the backdrop: its surface or its border must reach 3:1.
      const overlay = await toRgb(chat, await ui.backdrop.evaluate((node) => getComputedStyle(node).backgroundColor));
      const page = await canvasColor(chat);
      const dimmed = page.slice(0, 3).map((value, index) => value * (1 - overlay[3]) + overlay[index] * overlay[3]) as number[];
      const dimmedPage: Rgba = [dimmed[0], dimmed[1], dimmed[2], 1];
      const surface = await effectiveBackground(ui.panel);
      const edge = await toRgb(chat, await ui.panel.evaluate((node) => getComputedStyle(node).borderTopColor));
      const edgeWidth = await ui.panel.evaluate((node) => parseFloat(getComputedStyle(node).borderTopWidth));
      const bestEdge = edgeWidth > 0 && edge[3] === 1 ? contrast(edge, dimmedPage) : 0;
      expect(Math.max(contrast(surface, dimmedPage), bestEdge)).toBeGreaterThanOrEqual(3);

      for (let turn = 1; turn <= 2; turn++) {
        await ask(chat, QUESTION);
        await expect(ui.assistantTurns).toHaveCount(turn);
      }
      result = await auditNow(chat, { scope: ".assistant-chat", tab: false, hover: true });
      expect(result.violations, "answers").toEqual([]);
      expect(await focusWalk(chat, theme)).toEqual([]);
    });

    test("the open compact menu passes contrast and its options and button show a focus ring", async ({ chat }) => {
      test.setTimeout(120_000);
      await visit(chat, "/", theme);
      const ui = await openSheet(chat);
      const button = ui.panel.getByRole("button", { name: "Alcance: Todo" });
      await button.click();
      const list = ui.panel.getByRole("listbox", { name: "Alcance" });
      await expect(list).toBeVisible();
      // The menu is inside .assistant-chat, so this audits its text, fills and edges. The shared hover list has no
      // [role="option"], so each option is hovered here and audited on its own (the --brand-50 hover background).
      const result = await auditNow(chat, { scope: ".assistant-chat", tab: false, hover: true });
      expect(result.violations, "open menu").toEqual([]);
      for (const name of ["Todo", "Plan activo", "Recetario", "Carrito"]) {
        await list.getByRole("option", { name, exact: true }).hover();
        const hovered = await auditNow(chat, { scope: ".assistant-chat", tab: false, hover: false });
        expect(hovered.violations, `option ${name} hovered`).toEqual([]);
      }

      const failures: string[] = [];
      await chat.evaluate(installToolkit);
      await chat.keyboard.press("Shift");
      for (const name of ["Todo", "Plan activo", "Recetario", "Carrito"]) {
        const option = list.getByRole("option", { name, exact: true });
        await option.focus();
        await expect(option).toBeFocused();
        const focus = await chat.evaluate(() => window.__audit.focus());
        if (!focus.ok) failures.push(`${theme} option ${name} ${focus.ratio.toFixed(2)}:1`);
      }
      await chat.keyboard.press("Escape");
      await expect(button).toBeFocused();
      const focus = await chat.evaluate(() => window.__audit.focus());
      if (!focus.ok) failures.push(`${theme} button ${focus.ratio.toFixed(2)}:1`);
      expect(failures).toEqual([]);
    });
  });
}
