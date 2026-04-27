import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FieldHint from "../../components/FieldHint";
import HelpTooltip from "../../components/HelpTooltip";
import PageHelp from "../../components/PageHelp";

describe("Help primitives", () => {
  it("shows tooltip content on keyboard focus", async () => {
    const user = userEvent.setup();

    render(
      <HelpTooltip label="What is churn?">
        Churn is insertions plus deletions, weighted by how recently a file changed.
      </HelpTooltip>,
    );

    const trigger = screen.getByRole("button", { name: "What is churn?" });
    expect(
      screen.queryByText(/weighted by how recently/i),
    ).not.toBeInTheDocument();

    await user.tab();

    expect(trigger).toHaveFocus();
    expect(screen.getByText(/weighted by how recently/i)).toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-describedby");
  });

  it("closes tooltip content when Escape is pressed", async () => {
    const user = userEvent.setup();

    render(
      <HelpTooltip label="What is scope?">
        Scope decides whether analytics use one repo or the whole workspace.
      </HelpTooltip>,
    );

    await user.tab();
    expect(screen.getByText(/whole workspace/i)).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(screen.queryByText(/whole workspace/i)).not.toBeInTheDocument();
  });

  it("renders field hint text with a stable id", () => {
    render(
      <FieldHint id="repo-path-hint">
        Use the absolute path to a local Git repository.
      </FieldHint>,
    );

    const hint = screen.getByText(/absolute path/i);
    expect(hint).toHaveAttribute("id", "repo-path-hint");
  });

  it("renders page help as a collapsed details block", () => {
    render(
      <PageHelp
        title="How to read this page"
        items={[
          "Start with the summary cards.",
          "Use tooltips for metric definitions.",
        ]}
      />,
    );

    const disclosure = screen.getByText("How to read this page").closest("details");
    expect(disclosure).toBeInTheDocument();
    expect(disclosure).not.toHaveAttribute("open");
    expect(screen.getByText("Start with the summary cards.")).toBeInTheDocument();
  });
});
