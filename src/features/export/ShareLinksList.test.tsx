import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor, within } from "@testing-library/react";
import { ShareLinksList } from "./ShareLinksList";
import { useSettingsStore } from "../../stores/settings";
import * as exportService from "../../services/export";

vi.mock("../../services/export", () => ({
  deleteShare: vi.fn(async () => ({ ok: true })),
}));

const link = {
  token: "tok-1",
  deleteToken: "del-1",
  kind: "structure" as const,
  label: "titanic",
  createdAt: "2026-07-23T00:00:00.000Z",
  ttlSeconds: 2_592_000,
};

beforeEach(() => {
  vi.clearAllMocks();
  useSettingsStore.setState({ shareLinks: [] });
});

describe("ShareLinksList", () => {
  it("renders nothing when there are no created share links", () => {
    const { container } = render(<ShareLinksList />);
    expect(container.textContent).toBe("");
  });

  it("lists a created share link with its kind and expiry", () => {
    useSettingsStore.setState({ shareLinks: [link] });
    const { container } = render(<ShareLinksList />);
    expect(within(container).getByText("titanic")).toBeTruthy();
    expect(container.textContent).toMatch(/structure only/i);
  });

  it("deletes via the ownership proof and removes the local entry on success", async () => {
    useSettingsStore.setState({ shareLinks: [link] });
    const { container } = render(<ShareLinksList />);

    fireEvent.click(
      within(container).getByRole("button", {
        name: /delete share link for titanic/i,
      }),
    );

    await waitFor(() =>
      expect(exportService.deleteShare).toHaveBeenCalledWith("tok-1", "del-1"),
    );
    await waitFor(() =>
      expect(useSettingsStore.getState().shareLinks).toEqual([]),
    );
  });

  it("keeps the local entry and shows a retry hint when delete fails", async () => {
    vi.mocked(exportService.deleteShare).mockResolvedValueOnce({
      ok: false,
      code: "unreachable",
    });
    useSettingsStore.setState({ shareLinks: [link] });
    const { container } = render(<ShareLinksList />);

    fireEvent.click(
      within(container).getByRole("button", {
        name: /delete share link for titanic/i,
      }),
    );

    await waitFor(() =>
      expect(container.textContent).toMatch(/couldn't delete/i),
    );
    expect(useSettingsStore.getState().shareLinks).toEqual([link]);
  });
});
