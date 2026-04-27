import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import ProductTour from "../../components/ProductTour";
import Sidebar from "../../components/Sidebar";
import { AppProvider } from "../../context/AppContext";

jest.mock("../../hooks/useRepos", () => ({
  useRepos: jest.fn(() => ({ data: [] })),
  useWorkspaces: jest.fn(() => ({ data: [] })),
}));

function renderProductTour() {
  return render(
    <MemoryRouter>
      <AppProvider>
        <ProductTour />
      </AppProvider>
    </MemoryRouter>,
  );
}

function renderSidebarWithProductTour() {
  return render(
    <MemoryRouter>
      <AppProvider>
        <Sidebar />
        <ProductTour />
      </AppProvider>
    </MemoryRouter>,
  );
}

describe("ProductTour", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("renders the first product tour step on first launch", () => {
    renderProductTour();

    expect(
      screen.getByRole("dialog", { name: "GitPulse product tour" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Try the demo first")).toBeInTheDocument();
    expect(screen.getByText("Step 1 of 6")).toBeInTheDocument();
  });

  it("navigates forward and backward through tour steps", async () => {
    const user = userEvent.setup();
    renderProductTour();

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Create a workspace")).toBeInTheDocument();
    expect(screen.getByText("Step 2 of 6")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("Try the demo first")).toBeInTheDocument();
    expect(screen.getByText("Step 1 of 6")).toBeInTheDocument();
  });

  it("focuses the close button when opened", async () => {
    renderProductTour();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Close tour" })).toHaveFocus();
    });
  });

  it("closes when Escape is pressed", async () => {
    const user = userEvent.setup();
    renderProductTour();

    expect(
      screen.getByRole("dialog", { name: "GitPulse product tour" }),
    ).toBeInTheDocument();

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "GitPulse product tour" }),
      ).not.toBeInTheDocument();
    });
  });

  it("dismisses and persists the tour when finished", async () => {
    const user = userEvent.setup();
    renderProductTour();

    for (let step = 0; step < 5; step += 1) {
      await user.click(screen.getByRole("button", { name: "Next" }));
    }

    expect(screen.getByText("Clean aliases before trusting metrics")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Finish tour" }));

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "GitPulse product tour" }),
      ).not.toBeInTheDocument();
    });
    expect(window.localStorage.getItem("gitpulse.productTour.dismissed")).toBe(
      "true",
    );
  });

  it("does not render after the tour has been dismissed", () => {
    window.localStorage.setItem("gitpulse.productTour.dismissed", "true");

    renderProductTour();

    expect(
      screen.queryByRole("dialog", { name: "GitPulse product tour" }),
    ).not.toBeInTheDocument();
  });

  it("can be reopened from the sidebar after dismissal", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("gitpulse.productTour.dismissed", "true");

    renderSidebarWithProductTour();

    expect(
      screen.queryByRole("dialog", { name: "GitPulse product tour" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Product Tour" }));

    expect(
      screen.getByRole("dialog", { name: "GitPulse product tour" }),
    ).toBeInTheDocument();
  });

  it("toggles demo mode from the sidebar", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("gitpulse.productTour.dismissed", "true");

    renderSidebarWithProductTour();

    await user.click(screen.getByRole("button", { name: "Try Demo" }));

    expect(window.localStorage.getItem("gitpulse.demoMode.enabled")).toBe("true");
    expect(screen.getByRole("button", { name: "Exit Demo" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Exit Demo" }));

    expect(window.localStorage.getItem("gitpulse.demoMode.enabled")).toBeNull();
    expect(screen.getByRole("button", { name: "Try Demo" })).toBeInTheDocument();
  });
});
