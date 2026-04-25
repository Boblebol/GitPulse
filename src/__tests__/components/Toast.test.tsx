import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppProvider, useAppContext } from "../../context/AppContext";
import { ToastContainer } from "../../components/Toast";

function TestComponentWithNotification() {
  const { addNotification } = useAppContext();
  return (
    <div>
      <button onClick={() => addNotification("Test message", "success")}>
        Add Success
      </button>
      <button onClick={() => addNotification("Error message", "error")}>
        Add Error
      </button>
      <ToastContainer />
    </div>
  );
}

describe("ToastContainer", () => {
  it("renders empty container without notifications", () => {
    render(
      <AppProvider>
        <ToastContainer />
      </AppProvider>
    );

    const container = document.querySelector(".fixed.top-4");
    expect(container).toBeInTheDocument();
    expect(container?.children.length).toBe(0);
  });

  it("displays success notification", async () => {
    const user = userEvent.setup();
    render(
      <AppProvider>
        <TestComponentWithNotification />
      </AppProvider>
    );

    const button = screen.getByRole("button", { name: "Add Success" });
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText("Test message")).toBeInTheDocument();
    });
  });

  it("displays error notification", async () => {
    const user = userEvent.setup();
    render(
      <AppProvider>
        <TestComponentWithNotification />
      </AppProvider>
    );

    const button = screen.getByRole("button", { name: "Add Error" });
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText("Error message")).toBeInTheDocument();
    });
  });

  it("auto-dismisses notifications after 3 seconds", async () => {
    const user = userEvent.setup();

    render(
      <AppProvider>
        <TestComponentWithNotification />
      </AppProvider>
    );

    const button = screen.getByRole("button", { name: "Add Success" });
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText("Test message")).toBeInTheDocument();
    });

    // Wait for auto-dismiss (3 seconds + buffer)
    await waitFor(
      () => {
        expect(screen.queryByText("Test message")).not.toBeInTheDocument();
      },
      { timeout: 5000 }
    );
  });

  it("removes notification when close button is clicked", async () => {
    const user = userEvent.setup();
    render(
      <AppProvider>
        <TestComponentWithNotification />
      </AppProvider>
    );

    const button = screen.getByRole("button", { name: "Add Success" });
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText("Test message")).toBeInTheDocument();
    });

    // Find the close button within the notification (the last button with no name)
    const allButtons = screen.getAllByRole("button");
    const closeButton = allButtons[allButtons.length - 1]; // Last button is the close button
    await user.click(closeButton);

    await waitFor(() => {
      expect(screen.queryByText("Test message")).not.toBeInTheDocument();
    });
  });

  it("displays multiple notifications", async () => {
    const user = userEvent.setup();
    render(
      <AppProvider>
        <TestComponentWithNotification />
      </AppProvider>
    );

    const successButton = screen.getByRole("button", { name: "Add Success" });
    const errorButton = screen.getByRole("button", { name: "Add Error" });

    await user.click(successButton);
    await user.click(errorButton);

    await waitFor(() => {
      expect(screen.getByText("Test message")).toBeInTheDocument();
      expect(screen.getByText("Error message")).toBeInTheDocument();
    });
  });

  it("displays correct styling for success notification", async () => {
    const user = userEvent.setup();
    render(
      <AppProvider>
        <TestComponentWithNotification />
      </AppProvider>
    );

    const button = screen.getByRole("button", { name: "Add Success" });
    await user.click(button);

    await waitFor(() => {
      const notification = screen.getByText("Test message").closest("div");
      expect(notification).toHaveClass("bg-tertiary");
      expect(notification).toHaveClass("text-on-tertiary");
    });
  });

  it("displays correct styling for error notification", async () => {
    const user = userEvent.setup();
    render(
      <AppProvider>
        <TestComponentWithNotification />
      </AppProvider>
    );

    const button = screen.getByRole("button", { name: "Add Error" });
    await user.click(button);

    await waitFor(() => {
      const notification = screen.getByText("Error message").closest("div");
      expect(notification).toHaveClass("bg-error");
      expect(notification).toHaveClass("text-on-error");
    });
  });

  it("renders notification with correct structure", async () => {
    const user = userEvent.setup();
    render(
      <AppProvider>
        <TestComponentWithNotification />
      </AppProvider>
    );

    const button = screen.getByRole("button", { name: "Add Success" });
    await user.click(button);

    await waitFor(() => {
      const notification = screen.getByText("Test message").closest("div");
      expect(notification).toHaveClass("flex");
      expect(notification).toHaveClass("items-center");
      expect(notification).toHaveClass("gap-3");
      expect(notification).toHaveClass("rounded-lg");
      expect(notification).toHaveClass("shadow-lg");
    });
  });

  it("removes notification with close button in sequence", async () => {
    const user = userEvent.setup();
    render(
      <AppProvider>
        <TestComponentWithNotification />
      </AppProvider>
    );

    const successButton = screen.getByRole("button", { name: "Add Success" });
    const errorButton = screen.getByRole("button", { name: "Add Error" });

    // Add two notifications
    await user.click(successButton);
    await user.click(errorButton);

    await waitFor(() => {
      expect(screen.getByText("Test message")).toBeInTheDocument();
      expect(screen.getByText("Error message")).toBeInTheDocument();
    });

    // Remove first notification
    const allButtons = screen.getAllByRole("button");
    const closeButtonForSuccess = allButtons[allButtons.length - 2];
    await user.click(closeButtonForSuccess);

    await waitFor(() => {
      expect(screen.queryByText("Test message")).not.toBeInTheDocument();
      expect(screen.getByText("Error message")).toBeInTheDocument();
    });
  });
});
