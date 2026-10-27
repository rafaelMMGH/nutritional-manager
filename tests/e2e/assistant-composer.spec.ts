import type { Page } from "@playwright/test";
import { COUNTER_FROM, MAX_MESSAGE } from "../../src/lib/assistant";
import { assistantUi, cartAnswer, createChatUser, deleteChatUser, expect, mockChat, openAssistant, test } from "./assistant-helpers";

// The composer of the assistant panel. Spec assistant-chat-polish, US3: REQ-10 (client side).

const ENTER_IME = { key: "Enter", bubbles: true, cancelable: true };

test.beforeAll(() => createChatUser("composer"));
test.afterAll(() => deleteChatUser());

/** Opens the panel with a healthy mock; `requests` lists what reached the API. */
async function open(page: Page, options: Parameters<typeof mockChat>[2] = {}) {
  const mock = await mockChat(page, cartAnswer(), options);
  await page.goto("/");
  return { ui: await openAssistant(page), mock };
}

/** Lets pending page work (React updates, a request that would have been sent) settle. */
const settle = (page: Page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 50))));

const counterOf = (page: Page) => page.locator("#assistant-chat-panel .assistant-counter");

test.describe("REQ-10: the field and its buttons", () => {
  test("the field is labelled Pregunta and the buttons keep a native title", async ({ chat }) => {
    await chat.addInitScript(() => {
      (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = class {
        start() {}
        stop() {}
        abort() {}
      };
    });
    const { ui } = await open(chat);
    await expect(chat.getByRole("textbox", { name: "Pregunta", exact: true })).toBeVisible();
    await expect(ui.input).toHaveJSProperty("tagName", "TEXTAREA");
    await expect(ui.send).toHaveAttribute("title", "Enviar");
    await expect(ui.panel.getByRole("button", { name: "Dictar pregunta" })).toHaveAttribute("title", "Dictar pregunta");
  });

  test("Enviar is disabled when the field is empty or blank", async ({ chat }) => {
    const { ui } = await open(chat);
    await expect(ui.send).toBeDisabled();
    await ui.input.fill("   \n  ");
    await expect(ui.send).toBeDisabled();
    await ui.input.fill("hola");
    await expect(ui.send).toBeEnabled();
  });
});

test.describe("REQ-10: Enter on a desktop", () => {
  test("Shift+Enter adds a newline and Enter sends one 2-line message, then clears the field", async ({ chat }) => {
    const { ui, mock } = await open(chat);
    await ui.input.pressSequentially("línea 1");
    await ui.input.press("Shift+Enter");
    await ui.input.pressSequentially("línea 2");
    await expect(ui.input).toHaveValue("línea 1\nlínea 2");
    expect(mock.requests).toHaveLength(0);

    await ui.input.press("Enter");
    await expect(ui.assistantTurns).toHaveCount(1);
    expect(mock.requests.map((request) => request.message)).toEqual(["línea 1\nlínea 2"]);
    await expect(ui.input).toHaveValue("");
    await expect(ui.userTurns).toHaveText(["línea 1\nlínea 2"]);
  });

  test("a double Enter sends one request", async ({ chat }) => {
    const { ui, mock } = await open(chat, { hold: true });
    await ui.input.fill("hola");
    await ui.input.press("Enter");
    await ui.input.press("Enter");
    await expect(ui.pending).toHaveCount(1);
    await settle(chat);
    expect(mock.requests).toHaveLength(1);
    mock.release();
    await expect(ui.assistantTurns).toHaveCount(1);
  });

  test("IME composition never sends", async ({ chat }) => {
    const { ui, mock } = await open(chat);
    await ui.input.fill("こんにちは");
    // The key that confirms a composition candidate: either isComposing or the legacy keyCode 229.
    await ui.input.evaluate((node, init) => node.dispatchEvent(new KeyboardEvent("keydown", { ...init, isComposing: true })), ENTER_IME);
    await ui.input.evaluate((node, init) => node.dispatchEvent(new KeyboardEvent("keydown", { ...init, keyCode: 229 })), ENTER_IME);
    await settle(chat);
    expect(mock.requests).toHaveLength(0);
    await expect(ui.input).toHaveValue("こんにちは");

    await ui.input.press("Enter");
    await expect(ui.assistantTurns).toHaveCount(1);
    expect(mock.requests).toHaveLength(1);
  });

  test("Enter while pending does nothing, and the field stays editable", async ({ chat }) => {
    const { ui, mock } = await open(chat, { hold: true });
    await ui.input.fill("primera");
    await ui.input.press("Enter");
    await expect(ui.pending).toHaveCount(1);

    await expect(ui.input).toBeEditable();
    await ui.input.fill("segunda");
    await expect(ui.send).toBeDisabled();
    await ui.input.press("Enter");
    await settle(chat);
    expect(mock.requests).toHaveLength(1);
    await expect(ui.input).toHaveValue("segunda");
    mock.release();
    await expect(ui.assistantTurns).toHaveCount(1);
    await expect(ui.send).toBeEnabled();
  });
});

test.describe("REQ-10: Enter on a narrow screen", () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test("at 360 px Enter adds a newline and only Enviar sends", async ({ chat }) => {
    const { ui, mock } = await open(chat);
    await ui.input.pressSequentially("uno");
    await ui.input.press("Enter");
    await ui.input.pressSequentially("dos");
    await expect(ui.input).toHaveValue("uno\ndos");
    await settle(chat);
    expect(mock.requests).toHaveLength(0);

    await ui.send.click();
    await expect(ui.assistantTurns).toHaveCount(1);
    expect(mock.requests.map((request) => request.message)).toEqual(["uno\ndos"]);
  });
});

test.describe("REQ-10: the counter", () => {
  test("shows from 450 as n/500, not before, and is the field's description outside any live region", async ({ chat }) => {
    const { ui } = await open(chat);
    await ui.input.fill("a".repeat(COUNTER_FROM - 1));
    await expect(counterOf(chat)).toHaveCount(0);
    await expect(ui.input).not.toHaveAttribute("aria-describedby", /.+/);

    await ui.input.fill("a".repeat(COUNTER_FROM));
    await expect(counterOf(chat)).toHaveText("450/500");
    await expect(ui.input).toHaveAccessibleDescription("450/500");
    const describedBy = await ui.input.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    await expect(chat.locator(`#${describedBy}`)).toHaveClass(/assistant-counter/);
    const liveAncestor = await counterOf(chat).evaluate((node) => node.closest("[aria-live], [role=alert], [role=status], [role=log]") !== null);
    expect(liveAncestor).toBe(false);
  });

  test("over 500 it adds Máximo 500 caracteres, disables Enviar and Enter does nothing", async ({ chat }) => {
    const { ui, mock } = await open(chat);
    await ui.input.fill("a".repeat(MAX_MESSAGE + 1));
    await expect(counterOf(chat)).toContainText("501/500");
    await expect(counterOf(chat)).toContainText("Máximo 500 caracteres");
    await expect(ui.input).toHaveAccessibleDescription(/501\/500.*Máximo 500 caracteres/);
    await expect(ui.send).toBeDisabled();
    await ui.input.press("Enter");
    await settle(chat);
    expect(mock.requests).toHaveLength(0);
    await expect(ui.input).toHaveValue("a".repeat(MAX_MESSAGE + 1));
  });

  test("500 characters between spaces are answered, counted trimmed", async ({ chat }) => {
    const { ui, mock } = await open(chat);
    await ui.input.fill(`  ${"a".repeat(MAX_MESSAGE)}  `);
    await expect(counterOf(chat)).toHaveText("500/500");
    await expect(ui.send).toBeEnabled();
    await ui.send.click();
    await expect(ui.assistantTurns).toHaveCount(1);
    expect(mock.requests).toHaveLength(1);
    expect(mock.requests[0].message).toHaveLength(MAX_MESSAGE);
  });
});

test.describe("REQ-10: growth", () => {
  test("the field grows to 5 lines, then scrolls", async ({ chat }) => {
    const { ui } = await open(chat);
    const heights = async () => ui.input.evaluate((node) => ({ client: node.clientHeight, scroll: node.scrollHeight }));
    const lines = (count: number) => Array.from({ length: count }, (_, index) => `l${index + 1}`).join("\n");

    await ui.input.fill(lines(1));
    const one = await heights();
    await ui.input.fill(lines(3));
    expect((await heights()).client).toBeGreaterThan(one.client);
    await ui.input.fill(lines(5));
    const five = await heights();
    expect(five.scroll).toBeLessThanOrEqual(five.client);
    await ui.input.fill(lines(6));
    const six = await heights();
    expect(six.client).toBe(five.client);
    expect(six.scroll).toBeGreaterThan(six.client);
    await expect(ui.input).toHaveCSS("overflow-y", "auto");
    // It shrinks back with the content.
    await ui.input.fill(lines(1));
    expect((await heights()).client).toBe(one.client);
  });
});

test.describe("REQ-10: dictation", () => {
  test("the mic stays usable while a question is pending", async ({ chat }) => {
    await chat.addInitScript(() => {
      (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = class {
        start() {}
        stop() {}
        abort() {}
      };
    });
    const { ui, mock } = await open(chat, { hold: true });
    await ui.input.fill("hola");
    await ui.input.press("Enter");
    await expect(ui.pending).toHaveCount(1);
    const mic = ui.panel.getByRole("button", { name: "Dictar pregunta" });
    await expect(mic).toBeEnabled();
    await mic.click();
    await expect(ui.panel.getByRole("button", { name: "Detener dictado" })).toBeEnabled();
    await expect(ui.input).toBeEditable();
    mock.release();
  });

  test("a dictation error shows as an alert", async ({ chat }) => {
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
    const { ui } = await open(chat);
    await ui.panel.getByRole("button", { name: "Dictar pregunta" }).click();
    await expect(ui.panel.getByRole("alert")).toHaveText("Permite el acceso al micrófono para dictar.");
  });
});
