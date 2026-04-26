import {
  createTimeRange,
  shiftTimeRange,
  timeRangeToQuery,
} from "../../utils/timeRange";

describe("timeRange utilities", () => {
  it("creates an all-time range without date bounds", () => {
    const range = createTimeRange("all", "2026-04-26");

    expect(range).toEqual({
      mode: "all",
      anchorDate: "2026-04-26",
      fromDate: null,
      toDate: null,
    });
  });

  it("creates inclusive last-N-day presets", () => {
    expect(createTimeRange("last_7", "2026-04-26")).toMatchObject({
      fromDate: "2026-04-20",
      toDate: "2026-04-26",
    });
    expect(createTimeRange("last_30", "2026-04-26")).toMatchObject({
      fromDate: "2026-03-28",
      toDate: "2026-04-26",
    });
  });

  it("creates week ranges using Monday as week start", () => {
    expect(createTimeRange("week", "2026-04-26")).toMatchObject({
      fromDate: "2026-04-20",
      toDate: "2026-04-26",
    });
  });

  it("creates month ranges for the full calendar month", () => {
    expect(createTimeRange("month", "2026-04-26")).toMatchObject({
      fromDate: "2026-04-01",
      toDate: "2026-04-30",
    });
  });

  it("moves week and month ranges by one period", () => {
    expect(shiftTimeRange(createTimeRange("week", "2026-04-26"), -1)).toMatchObject({
      fromDate: "2026-04-13",
      toDate: "2026-04-19",
    });
    expect(shiftTimeRange(createTimeRange("month", "2026-04-26"), 1)).toMatchObject({
      fromDate: "2026-05-01",
      toDate: "2026-05-31",
    });
  });

  it("normalizes custom ranges so fromDate is not after toDate", () => {
    expect(
      createTimeRange("custom", "2026-04-26", {
        fromDate: "2026-04-20",
        toDate: "2026-04-10",
      })
    ).toMatchObject({
      fromDate: "2026-04-10",
      toDate: "2026-04-20",
    });
  });

  it("converts all-time range to broad query bounds for existing commands", () => {
    expect(timeRangeToQuery(createTimeRange("all", "2026-04-26"))).toEqual({
      fromDate: "0001-01-01",
      toDate: "9999-12-31",
    });
  });
});
