import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import SignInClient from "./sign-in-client";

vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));

describe("sign-in provider presentation", () => {
  it("shows recognizable Google and Yahoo provider actions", () => {
    const markup = renderToStaticMarkup(<SignInClient />);
    expect(markup).toContain("Continue with Google");
    expect(markup).toContain("Continue with Yahoo");
    expect(markup).toContain('data-provider-icon="google"');
    expect(markup).toContain('data-provider-icon="yahoo"');
    expect(markup).toContain('class="provider-button provider-google"');
    expect(markup).toContain('class="provider-button provider-yahoo"');
  });

  it("keeps the provider actions wired to their existing Auth.js providers", () => {
    const source = readFileSync("app/sign-in/sign-in-client.tsx", "utf8");
    expect(source).toContain('signIn("google", { redirectTo: "/" })');
    expect(source).toContain('signIn("yahoo", { redirectTo: "/" })');
    expect(source).toContain('signIn("approved-email"');
  });

  it("uses member-friendly approved-email wording", () => {
    const markup = renderToStaticMarkup(<SignInClient />);
    expect(markup).toContain("Approved email address");
    expect(markup).toContain("Administrators must sign in with Google or Yahoo");
    expect(markup.indexOf("</form>")).toBeLessThan(markup.indexOf('data-provider-icon="google"'));
    expect(markup).not.toContain("<span>Continue with Google</span>");
    expect(markup).not.toContain("does not verify ownership");
  });
});
