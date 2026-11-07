import { describe, expect, it } from "vitest";
import { renderNotification } from "./email-templates";
import { renderAdminEmail, validateEmailDraft } from "./admin-email";
const draft = { id: "11111111-1111-4111-8111-111111111111", recipientIds: ["user1"], subject: "Club update", message: "Hello volunteers!", signature: "DCC Bar Team" };
describe("admin composed email", () => {
  it("validates fields and deduplicates recipients", () => expect(validateEmailDraft({ ...draft, recipientIds: ["user1", "user1"] }).recipientIds).toEqual(["user1"]));
  it.each([{ recipientIds: [] }, { subject: "" }, { subject: "hello\r\nBcc: other@example.com" }, { message: "" }, { signature: "x".repeat(4001) }])("rejects invalid draft %s", changes => expect(() => validateEmailDraft({ ...draft, ...changes })).toThrow());
  it("renders signature and message as escaped multiline plain text", () => {
    const email = renderAdminEmail({ ...draft, message: "Hello\n<script>alert(1)</script>" });
    expect(email.text).toBe("Hello\n<script>alert(1)</script>\n\nDCC Bar Team");
    expect(email.html).toContain("&lt;script&gt;"); expect(email.html).not.toContain("<script>");
    expect(email.subject).toBe("Club update");
  });
});

it("outbox renders the composed message and signature without generic alert wording", () => {
  const email = renderNotification("ADMIN_ALERT", { adminComposed: true, subject: "Club update", message: "Hello volunteers!", signature: "DCC Bar Team" });
  expect(email).toEqual(renderAdminEmail(draft));
});
