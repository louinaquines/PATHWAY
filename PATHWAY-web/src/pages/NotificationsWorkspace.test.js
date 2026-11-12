import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import NotificationsTab from "./NotificationsTab";
import { adminRequest } from "../adminApi";
jest.mock("../components/AttendanceAccess", () => ({
  __esModule: true,
  default: ({ children }) =>
    children({ isCurrent: () => true, onDenied: jest.fn() }),
}));
jest.mock("../adminApi", () => ({ adminRequest: jest.fn() }));
jest.mock("../components/AnnouncementEmailDelivery", () => () => null);
const row = {
  id: "a",
  title: "Document ready",
  message: "Please review",
  read: false,
  createdAt: "2026-11-12T01:00:00Z",
};
beforeEach(() => {
  adminRequest.mockReset();
  adminRequest.mockImplementation(async (path) =>
    path.includes("/counts")
      ? { unread: 1 }
      : path.includes("/read")
        ? { read: true }
        : path.includes("/a?")
          ? row
          : { records: [row], hasMore: true, cursor: "next" },
  );
});
const show = () =>
  render(
    <NotificationsTab
      userId="c"
      section={{ id: "s", name: "BSED" }}
      sections={[{ id: "s", name: "BSED" }]}
    />,
  );
test("opens details without marking read", async () => {
  show();
  fireEvent.click(
    await screen.findByRole("button", { name: /Document ready/ }),
  );
  await screen.findByRole("dialog");
  expect(adminRequest.mock.calls.some(([p]) => p.includes("/read"))).toBe(
    false,
  );
  fireEvent.click(screen.getByRole("button", { name: "Mark as read" }));
  await waitFor(() =>
    expect(adminRequest.mock.calls.some(([p]) => p.includes("/read"))).toBe(
      true,
    ),
  );
});
test("page changes use server cursor", async () => {
  show();
  await screen.findByText("Document ready");
  fireEvent.click(screen.getByRole("button", { name: "Next page" }));
  await waitFor(() =>
    expect(
      adminRequest.mock.calls.some(([p]) => p.includes("cursor=next")),
    ).toBe(true),
  );
});
test("announcement cancel discards draft", async () => {
  show();
  fireEvent.click(screen.getByRole("button", { name: "Post announcement" }));
  fireEvent.change(screen.getByLabelText("Title"), {
    target: { value: "Draft" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  fireEvent.click(screen.getByRole("button", { name: "Post announcement" }));
  expect(screen.getByLabelText("Title")).toHaveValue("");
});
