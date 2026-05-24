import { describe, expect, it } from "vitest";
import { cleanDisplayText } from "../utils/html-text";

describe("html text helpers", () => {
  it("decodes RSS HTML entities before rendering titles", () => {
    expect(cleanDisplayText("The AX stack: what&#8217;s fixed &amp; where you can win"))
      .toBe("The AX stack: what’s fixed & where you can win");
  });

  it("strips accidental markup from feed titles", () => {
    expect(cleanDisplayText("<b>GitHub</b> &mdash; agent updates")).toBe("GitHub - agent updates");
  });

  it("keeps escaped angle-bracket text that is not an HTML tag", () => {
    expect(cleanDisplayText("Using Promise&lt;Result&gt; safely")).toBe("Using Promise<Result> safely");
  });

  it("strips escaped HTML tags after decoding", () => {
    expect(cleanDisplayText("&lt;b&gt;GitHub&lt;/b&gt; &trade;")).toBe("GitHub TM");
  });
});
