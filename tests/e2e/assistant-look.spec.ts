import type { Page } from "@playwright/test";
import { MAX_MESSAGE } from "../../src/lib/assistant";
import { expectIssues } from "./fixtures";
import { auditNow, visit } from "./theme-audit";
import type { Theme } from "./theme-helpers";
import { assistantUi, focusWalk, buildAnswer, cartAnswer, createChatUser, deleteChatUser, expect, mockChat, openAssistant, test } from "./assistant-helpers";

// How the assistant looks and moves. Spec assistant-chat-polish, US5: REQ-14 (contrast in both themes, forced colors),
// REQ-16 (motion) and the "Look" details (bubble width, long tokens, no horizontal overflow at 360 px).
// The compact scope menu, the switcher states and the modal backdrop are audited by the batches that add them.

test.beforeAll(() => createChatUser("look"));
test.afterAll(() => deleteChatUser());

const THEMES: Theme[] = ["light", "dark"];
const QUESTION = "¿Qué tengo en mi carrito?";
const FAILED_500 = [/POST \/api\/rag\/chat → 500/, /Failed to load resource.*500/];

async function ask(page: Page, message: string) {
  const ui = assistantUi(page);
  await ui.input.fill(message);
  await ui.send.click();
}

/** The whole panel (header, log, composer), not only the log: the subtitle, placeholder and field border count too. */
const audit = (page: Page) => auditNow(page, { scope: ".assistant-chat", tab: false, hover: true });

for (const theme of THEMES) {
  test.describe(`REQ-14: contrast in the ${theme} theme`, () => {
    test("empty thread, counter over the limit, answer, scroll button and focus rings", async ({ chat }) => {
      test.setTimeout(180_000);
      await mockChat(chat, { ...cartAnswer(8), sources: ["Carrito actual"] });
      await visit(chat, "/", theme);
      const ui = await openAssistant(chat);

      // Empty: subtitle, starter chips, placeholder, border of the field, send disabled.
      await expect(ui.chips.first()).toBeVisible();
      await expect(ui.send).toBeDisabled();
      let result = await audit(chat);
      expect(result.violations, "empty thread").toEqual([]);

      // The counter over its limit.
      await ui.input.fill("a".repeat(MAX_MESSAGE + 1));
      await expect(chat.locator(".assistant-counter.over")).toBeVisible();
      result = await audit(chat);
      expect(result.violations, "counter over the limit").toEqual([]);
      await ui.input.fill("");

      // Answers with chips and sources, Nueva conversación and the user bubble; the log overflows after a few.
      for (let turn = 1; turn <= 4; turn++) {
        await ask(chat, QUESTION);
        await expect(ui.assistantTurns).toHaveCount(turn);
      }
      await expect(ui.chips).toHaveCount(2);
      await expect(ui.assistantTurns.last().locator(".assistant-turn-sources")).toBeVisible();
      result = await audit(chat);
      expect(result.violations, "answer").toEqual([]);

      // Scrolled up: the scroll button shows over the log.
      await ui.log.evaluate((node) => node.scrollTo({ top: 0, behavior: "instant" }));
      await expect(chat.locator(".assistant-scroll.visible")).toBeVisible();
      result = await audit(chat);
      expect(result.violations, "scroll button").toEqual([]);

      // Typed text (not the placeholder) and send enabled.
      await ui.input.fill("hola");
      await expect(ui.send).toBeEnabled();
      result = await audit(chat);
      expect(result.violations, "send enabled").toEqual([]);

      expect(await focusWalk(chat, theme)).toEqual([]);
    });

    test("pending", async ({ chat }) => {
      await mockChat(chat, cartAnswer(), { hold: true });
      await visit(chat, "/", theme);
      const ui = await openAssistant(chat);
      await ask(chat, QUESTION);
      await expect(ui.pending).toContainText("Pensando");
      const { violations } = await audit(chat);
      expect(violations).toEqual([]);
    });

    test.describe("an error", () => {
      test.use({ expectedIssues: expectIssues(...FAILED_500) });

      test("the error text, Reintentar and the focus on it", async ({ chat }) => {
        await mockChat(chat, cartAnswer(), { status: 500 });
        await visit(chat, "/", theme);
        const ui = await openAssistant(chat);
        await ask(chat, QUESTION);
        await expect(chat.getByRole("button", { name: "Reintentar" })).toBeVisible();
        const { violations } = await audit(chat);
        expect(violations).toEqual([]);
        expect(await focusWalk(chat, theme)).toEqual([]);
        await expect(ui.assistantTurns).toHaveCount(1);
      });
    });
  });
}

test.describe("REQ-14: forced colors", () => {
  test.use({ forcedColors: "active" });

  test("highlights keep weight 600 or more, or an underline", async ({ chat }) => {
    await mockChat(chat, cartAnswer(3));
    await chat.goto("/");
    const ui = await openAssistant(chat);
    await ask(chat, QUESTION);
    await expect(ui.assistantTurns).toHaveCount(1);
    expect(await chat.evaluate(() => matchMedia("(forced-colors: active)").matches)).toBe(true);
    const marks = ui.assistantTurns.locator("strong");
    expect(await marks.count()).toBeGreaterThan(0);
    for (const mark of await marks.all()) {
      const { weight, underline } = await mark.evaluate((node) => ({ weight: parseInt(getComputedStyle(node).fontWeight, 10), underline: getComputedStyle(node).textDecorationLine }));
      expect(weight >= 600 || underline.includes("underline")).toBe(true);
      // The default bold alone would pass the line above; the underline is the rule this CSS adds.
      expect(underline).toContain("underline");
    }
  });

  test("the field keeps its border and it turns to Highlight on focus", async ({ chat }) => {
    await chat.goto("/");
    const ui = await openAssistant(chat);
    const form = chat.locator(".assistant-chat-form");
    expect(await form.evaluate((node) => parseFloat(getComputedStyle(node).borderTopWidth))).toBeGreaterThan(0);
    await ui.input.focus();
    const highlight = await chat.evaluate(() => {
      const probe = document.createElement("span");
      probe.style.color = "Highlight";
      document.body.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    });
    expect(await form.evaluate((node) => getComputedStyle(node).borderTopColor)).toBe(highlight);
  });

  test("the bubbles keep an edge when the system drops their fills", async ({ chat }) => {
    await mockChat(chat, cartAnswer(3));
    await chat.goto("/");
    const ui = await openAssistant(chat);
    await ask(chat, QUESTION);
    await expect(ui.assistantTurns).toHaveCount(1);
    for (const turn of [ui.userTurns.first(), ui.assistantTurns.first()]) {
      expect(await turn.evaluate((node) => parseFloat(getComputedStyle(node).borderTopWidth))).toBeGreaterThan(0);
    }
  });
});

test.describe("REQ-16: motion", () => {
  /** Computed animation and transition of an element: names and the longest duration, in ms. */
  const motionOf = (locator: ReturnType<Page["locator"]>) =>
    locator.first().evaluate((node) => {
      const cs = getComputedStyle(node);
      const ms = (list: string) => Math.max(...list.split(",").map((part) => parseFloat(part) * (part.trim().endsWith("ms") ? 1 : 1000)));
      return { animation: cs.animationName, animationMs: ms(cs.animationDuration), transitionMs: ms(cs.transitionDuration) };
    });

  test.describe("reduced", () => {
    test.use({ reducedMotion: "reduce" });

    test("turns, loader, panel, scroll button and chips have no animation or transition, and the scroll is instant", async ({ chat }) => {
      const mock = await mockChat(chat, cartAnswer(8), { hold: true });
      await chat.goto("/");
      const ui = assistantUi(chat);
      expect(await motionOf(ui.panel)).toMatchObject({ animation: "none", transitionMs: 0 });
      await openAssistant(chat);
      expect(await motionOf(ui.panel)).toMatchObject({ animation: "none", transitionMs: 0 });
      expect(await motionOf(ui.chips)).toMatchObject({ animation: "none", transitionMs: 0 });

      await ask(chat, QUESTION);
      await expect(ui.pending).toContainText("Pensando");
      expect(await motionOf(ui.pending)).toMatchObject({ animation: "none", transitionMs: 0 });
      expect(await motionOf(ui.userTurns)).toMatchObject({ animation: "none", transitionMs: 0 });
      expect(await motionOf(chat.locator(".assistant-loader"))).toMatchObject({ animation: "none" });
      expect(await motionOf(chat.locator(".assistant-scroll"))).toMatchObject({ animation: "none", transitionMs: 0 });

      // A settled answer, the FAB and the composer buttons too.
      mock.release();
      await expect(ui.assistantTurns).toHaveCount(1);
      expect(await motionOf(ui.assistantTurns)).toMatchObject({ animation: "none", transitionMs: 0 });
      expect(await motionOf(ui.fab)).toMatchObject({ animation: "none", transitionMs: 0 });
      expect(await motionOf(chat.locator(".assistant-chat-form button"))).toMatchObject({ animation: "none", transitionMs: 0 });
    });

    test("the log is at the target right after a send and right after Ir al último mensaje", async ({ chat }) => {
      await mockChat(chat, cartAnswer(8), { delayMs: 300 });
      await chat.goto("/");
      const ui = await openAssistant(chat);
      for (let turn = 1; turn <= 3; turn++) {
        await ask(chat, QUESTION);
        await expect(ui.assistantTurns).toHaveCount(turn);
      }
      expect(await ui.log.evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);
      const gap = () => ui.log.evaluate((node) => node.scrollHeight - node.scrollTop - node.clientHeight);

      // Read straight after the click, with no polling: the question and the pending turn are in view at once.
      await ui.log.evaluate((node) => node.scrollTo({ top: 0, behavior: "instant" }));
      await ui.input.fill(QUESTION);
      await ui.send.click();
      expect(await gap()).toBeLessThanOrEqual(1);
      await expect(ui.assistantTurns).toHaveCount(4);

      await ui.log.evaluate((node) => node.scrollTo({ top: 0, behavior: "instant" }));
      await expect(chat.locator(".assistant-scroll.visible")).toBeVisible();
      await chat.getByRole("button", { name: "Ir al último mensaje" }).click();
      expect(await gap()).toBeLessThanOrEqual(1);
    });
  });

  test("without reduced motion a message fades in within 200 ms", async ({ chat }) => {
    await mockChat(chat, cartAnswer(3));
    await chat.goto("/");
    const ui = await openAssistant(chat);
    await ask(chat, QUESTION);
    await expect(ui.assistantTurns).toHaveCount(1);
    for (const turn of [ui.userTurns, ui.assistantTurns]) {
      const motion = await motionOf(turn);
      expect(motion.animation).not.toBe("none");
      expect(motion.animationMs).toBeGreaterThan(0);
      expect(motion.animationMs).toBeLessThanOrEqual(200);
    }
  });
});

test.describe("Look: width and long tokens at 360 px", () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test("the user bubble is at most 80% wide, long tokens wrap and nothing overflows sideways", async ({ chat }) => {
    const token = "x".repeat(300);
    await mockChat(chat, buildAnswer({ lead: [{ text: `Resultado ${token}` }], sections: [{ title: "Ingredientes", items: [[{ text: token }]] }] }));
    await chat.goto("/");
    const ui = await openAssistant(chat);
    await ask(chat, `pregunta ${token}`);
    await expect(ui.assistantTurns).toHaveCount(1);

    const widths = await chat.evaluate(() => {
      const log = document.querySelector(".assistant-chat-log") as HTMLElement;
      const style = getComputedStyle(log);
      const content = log.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const user = (document.querySelector(".assistant-turn.user") as HTMLElement).getBoundingClientRect().width;
      return { content, user, logOverflow: log.scrollWidth - log.clientWidth, page: document.documentElement.scrollWidth - window.innerWidth };
    });
    expect(widths.user).toBeLessThanOrEqual(widths.content * 0.8 + 0.5);
    expect(widths.logOverflow).toBeLessThanOrEqual(0);
    expect(widths.page).toBeLessThanOrEqual(0);
    expect(await chat.locator(".assistant-chat").evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(0);
  });
});
