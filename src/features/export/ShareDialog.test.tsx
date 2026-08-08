import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor, within } from "@testing-library/react";
import { ShareDialog } from "./ShareDialog";
import * as exportService from "../../services/export";
import type { TableRegistryEntry } from "../../types";

vi.mock("../../services/export", () => ({
  buildShareBuffer: vi.fn(async () => new Uint8Array([1, 2, 3])),
  saveToCloud: vi.fn(async () => ({
    ok: true,
    token: "tok-1",
    deleteToken: "del-1",
    ttlSeconds: 2_592_000,
  })),
  PARQUET_CONTENT_TYPE: "application/vnd.apache.parquet",
  STRUCTURE_REPORT_CONTENT_TYPE: "application/vnd.datascope.dsps+json",
}));

const plainTable: TableRegistryEntry = {
  id: "t-1",
  tableName: "titanic",
  datasetId: "ds-1",
  origin: "file",
  rowCount: 891,
  columnCount: 3,
  memoryBytes: 4096,
  createdAt: "2026-07-23T00:00:00.000Z",
  columns: [
    {
      name: "passenger_id",
      semanticType: "Identifier",
      physicalType: "BIGINT",
      cardinality: 891,
      nullPercentage: 0,
      min: 1,
      max: 891,
      mean: null,
      stdDev: null,
    },
    {
      name: "fare",
      semanticType: "Quantitative",
      physicalType: "DOUBLE",
      cardinality: 200,
      nullPercentage: 0,
      min: 0,
      max: 512,
      mean: 32,
      stdDev: 49,
    },
  ],
};

const sensitiveTable: TableRegistryEntry = {
  ...plainTable,
  id: "t-2",
  tableName: "customers",
  columns: [
    ...plainTable.columns!,
    {
      name: "email",
      semanticType: "Textual",
      physicalType: "VARCHAR",
      cardinality: 891,
      nullPercentage: 0,
      min: null,
      max: null,
      mean: null,
      stdDev: null,
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ShareDialog", () => {
  it("defaults to the structure-only step, with a structure-only save action", () => {
    const { container } = render(
      <ShareDialog table={plainTable} onClose={vi.fn()} />,
    );
    expect(
      within(container).getByRole("button", { name: /save to cloud/i }),
    ).toBeTruthy();
    expect(
      within(container).queryByRole("button", { name: /save full dataset/i }),
    ).toBeNull();
  });

  it("renders no sensitive-column nudge when nothing matches — silence, never an all-clear line", () => {
    const { container } = render(
      <ShareDialog table={plainTable} onClose={vi.fn()} />,
    );
    expect(container.textContent).not.toMatch(/personal data/i);
    expect(container.textContent).not.toMatch(/none found/i);
  });

  it("renders the positives-only nudge when a likely-sensitive column is present", () => {
    const { container } = render(
      <ShareDialog table={sensitiveTable} onClose={vi.fn()} />,
    );
    expect(container.textContent).toMatch(/may contain personal data/i);
    expect(container.textContent).toContain("email");
  });

  it("requires an explicit, distinct second step to escalate to a full-dataset share", () => {
    const { container } = render(
      <ShareDialog table={plainTable} onClose={vi.fn()} />,
    );

    fireEvent.click(
      within(container).getByRole("button", {
        name: /include raw data rows instead/i,
      }),
    );

    expect(
      within(container).getByRole("button", {
        name: /save full dataset \(includes raw rows\)/i,
      }),
    ).toBeTruthy();
    expect(
      within(container).queryByRole("button", { name: /^save to cloud/i }),
    ).toBeNull();
  });

  it("saves the structure-only artifact as DSPS JSON, not Parquet, by default", async () => {
    const { container } = render(
      <ShareDialog table={plainTable} onClose={vi.fn()} />,
    );
    fireEvent.click(
      within(container).getByRole("button", { name: /save to cloud/i }),
    );

    await waitFor(() =>
      expect(exportService.saveToCloud).toHaveBeenCalledTimes(1),
    );
    const [, contentType] = vi.mocked(exportService.saveToCloud).mock.calls[0];
    expect(contentType).toBe("application/vnd.datascope.dsps+json");
    expect(exportService.buildShareBuffer).not.toHaveBeenCalled();
  });

  it("saves the escalated full-dataset artifact as the Parquet export buffer", async () => {
    const { container } = render(
      <ShareDialog table={plainTable} onClose={vi.fn()} />,
    );
    fireEvent.click(
      within(container).getByRole("button", {
        name: /include raw data rows instead/i,
      }),
    );
    fireEvent.click(
      within(container).getByRole("button", { name: /save full dataset/i }),
    );

    await waitFor(() =>
      expect(exportService.saveToCloud).toHaveBeenCalledTimes(1),
    );
    expect(exportService.buildShareBuffer).toHaveBeenCalledWith(plainTable);
    const [, contentType] = vi.mocked(exportService.saveToCloud).mock.calls[0];
    expect(contentType).toBe("application/vnd.apache.parquet");
  });

  it("shows the disclosure copy (storage + 30-day TTL) before anything uploads", () => {
    const { container } = render(
      <ShareDialog table={plainTable} onClose={vi.fn()} />,
    );
    expect(exportService.saveToCloud).not.toHaveBeenCalled();
    expect(container.textContent).toMatch(/30 days/);
    expect(container.textContent).toMatch(/no data rows included/i);
  });

  it("shows the share link after a successful save", async () => {
    const { container } = render(
      <ShareDialog table={plainTable} onClose={vi.fn()} />,
    );
    fireEvent.click(
      within(container).getByRole("button", { name: /save to cloud/i }),
    );

    await waitFor(() => within(container).getByText(/share link created/i));
    expect(container.textContent).toContain("?share=tok-1");
  });

  it("renders a friendly error and stays open on a rate-limit rejection", async () => {
    vi.mocked(exportService.saveToCloud).mockResolvedValueOnce({
      ok: false,
      code: "rate-limited",
    });
    const { container } = render(
      <ShareDialog table={plainTable} onClose={vi.fn()} />,
    );
    fireEvent.click(
      within(container).getByRole("button", { name: /save to cloud/i }),
    );

    await waitFor(() => expect(container.textContent).toMatch(/rate limit/i));
    expect(
      within(container).getByRole("button", { name: /save to cloud/i }),
    ).toBeTruthy();
  });

  it("renders a paused/unavailable state on a kill-switch 503", async () => {
    vi.mocked(exportService.saveToCloud).mockResolvedValueOnce({
      ok: false,
      code: "paused",
    });
    const { container } = render(
      <ShareDialog table={plainTable} onClose={vi.fn()} />,
    );
    fireEvent.click(
      within(container).getByRole("button", { name: /save to cloud/i }),
    );

    await waitFor(() =>
      expect(container.textContent).toMatch(/temporarily paused/i),
    );
  });
});
