import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ToastContainer } from "./Toast";
import type { ToastItem } from "../types";

describe("ToastContainer component", () => {
  it("renders nothing when toasts array is empty", () => {
    const { container } = render(<ToastContainer toasts={[]} onDismiss={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders multiple toasts with correct messages and calls onDismiss on click", () => {
    const onDismiss = vi.fn();
    const sampleToasts: ToastItem[] = [
      { id: "1", type: "success", message: "Saved successfully!" },
      { id: "2", type: "error", message: "Something went wrong" },
    ];

    render(<ToastContainer toasts={sampleToasts} onDismiss={onDismiss} />);

    expect(screen.getByText("Saved successfully!")).toBeInTheDocument();
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();

    const dismissBtns = screen.getAllByRole("button", { name: /Dismiss notification/i });
    expect(dismissBtns).toHaveLength(2);

    fireEvent.click(dismissBtns[0]);
    expect(onDismiss).toHaveBeenCalledWith("1");
  });
});
