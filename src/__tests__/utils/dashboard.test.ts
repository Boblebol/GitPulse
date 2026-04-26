import { activityRowsToChartPoints } from "../../utils/dashboard";

describe("dashboard utilities", () => {
  it("maps activity rows to commit chart points", () => {
    expect(
      activityRowsToChartPoints([
        {
          date: "2026-04-01",
          commits: 2,
          insertions: 10,
          deletions: 4,
          files_touched: 3,
        },
      ])
    ).toEqual([{ date: "2026-04-01", value: 2 }]);
  });
});
