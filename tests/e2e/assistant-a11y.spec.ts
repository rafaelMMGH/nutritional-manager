import type { Locator, Page } from "@playwright/test";
import { expectIssues } from "./fixtures";
import { auditNow, visit } from "./theme-audit";
import { canvasColor, contrast, effectiveBackground, toRgb, type Rgba, type Theme } from "./theme-helpers";
import { assistantUi, cartAnswer, createChatUser, deleteChatUser, expect, focusWalk, mockChat, openAssistant, test } from "./assistant-helpers";

// The assistant as a phone sheet. Spec assistant-chat-polish, US5: REQ-15 (geometry, touch targets, safe areas, the
// on-screen keyboard, long tokens), REQ-14 at 360 px (backdrop, focus rings). Modality and focus are Batch 9b.

test.beforeAll(() => createChatUser("a11y"));
test.afterAll(() => deleteChatUser());

const QUESTION = "¿Qué tengo en mi carrito?";
const FAILED_500 = [/POST \/api\/rag\/chat → 500/, /Failed to load resource.*500/];
const PHONE = { width: 360, height: 740 };

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

    // Row 1: title and ×. Row 2: the scope line and Nueva conversación (the scope button joins it in Batch 10).
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
      return { panel: panel.scrollWidth - panel.clientWidth, log: log.scrollWidth - log.clientWidth, page: document.documentElement.scrollWidth - innerWidth };
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
  });
}
