import { expect, test as base, type Page } from "@playwright/test";

export { expect };

type Options = {
  /**
   * Issues this test is expected to cause (a mocked failure, for example). The list is a multiset: each entry is
   * consumed by exactly one matching issue. A matching issue beyond the declared count fails the test, and so does
   * an entry nothing consumed.
   *
   * Do not pass an array of two or more RegExps to `test.use` directly: Playwright 1.63 (isFixtureTuple) reads an
   * array whose second item is an object as `[value, options]`, and a RegExp is an object. Wrap it with `expectIssues`.
   */
  expectedIssues: RegExp[];
};

/** Builds the `expectedIssues` value for `test.use`, in the tuple form that is never misread as `[value, options]`. */
export function expectIssues(...patterns: RegExp[]): RegExp[] {
  return [patterns, {}] as unknown as RegExp[];
}

/** Records page errors, console errors and failed API calls of `page` into `issues`. Use it for pages the test opens itself. */
export function watch(page: Page, issues: string[]) {
  page.on("pageerror", (error) => issues.push(`page error: ${error.message}`));
  page.on("console", (message) => message.type() === "error" && issues.push(`console: ${message.text().slice(0, 200)}`));
  page.on("response", (response) => {
    if (response.url().includes("/api/") && response.status() >= 400) issues.push(`${response.request().method()} ${new URL(response.url()).pathname} → ${response.status()}`);
  });
}

export const test = base.extend<Options & { issues: string[] }>({
  expectedIssues: [[], { option: true }],
  // Any page error, console error or failed API call fails the test that caused it. Warnings do not.
  issues: [
    async ({ page, expectedIssues }, use) => {
      const issues: string[] = [];
      watch(page, issues);
      await use(issues);

      // Each issue consumes the first pattern that matches it, so list the most specific patterns first.
      // lastIndex is reset before every match: a /g or /y regex would otherwise carry state between issues and tests.
      const matches = (pattern: RegExp, issue: string) => {
        pattern.lastIndex = 0;
        return pattern.test(issue);
      };
      const unconsumed = [...expectedIssues];
      const unexpected = issues.filter((issue) => {
        const index = unconsumed.findIndex((pattern) => matches(pattern, issue));
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
