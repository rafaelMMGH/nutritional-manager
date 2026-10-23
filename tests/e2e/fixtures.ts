import { expect, test as base } from "@playwright/test";

export { expect };

type Options = {
  /**
   * Issues this test is expected to cause (a mocked failure, for example). The list is a multiset: each entry is
   * consumed by exactly one matching issue. A matching issue beyond the declared count fails the test, and so does
   * an entry nothing consumed.
   */
  expectedIssues: RegExp[];
};

export const test = base.extend<Options & { issues: string[] }>({
  expectedIssues: [[], { option: true }],
  // Any page error, console error or failed API call fails the test that caused it. Warnings do not.
  issues: [
    async ({ page, expectedIssues }, use) => {
      const issues: string[] = [];
      page.on("pageerror", (error) => issues.push(`page error: ${error.message}`));
      page.on("console", (message) => message.type() === "error" && issues.push(`console: ${message.text().slice(0, 200)}`));
      page.on("response", (response) => {
        if (response.url().includes("/api/") && response.status() >= 400) issues.push(`${response.request().method()} ${new URL(response.url()).pathname} → ${response.status()}`);
      });
      await use(issues);

      const unconsumed = [...expectedIssues];
      const unexpected = issues.filter((issue) => {
        const index = unconsumed.findIndex((pattern) => pattern.test(issue));
        if (index === -1) return true;
        unconsumed.splice(index, 1);
        return false;
      });
      expect(unexpected, "console errors or failed API calls").toEqual([]);
      expect(unconsumed.map(String), "expected issues that never happened").toEqual([]);
    },
    { auto: true }
  ]
});
