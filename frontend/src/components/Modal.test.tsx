import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmModal, PromptModal } from "./Modal";

describe("ConfirmModal component", () => {
  it("renders nothing when options is null", () => {
    const { container } = render(<ConfirmModal options={null} onClose={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders title, message, and triggers onConfirm", async () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(
      <ConfirmModal
        options={{
          title: "Delete File?",
          message: "This will remove the file.",
          confirmLabel: "Delete",
          variant: "danger",
          onConfirm,
        }}
        onClose={onClose}
      />
    );

    expect(screen.getByText("Delete File?")).toBeInTheDocument();
    expect(screen.getByText("This will remove the file.")).toBeInTheDocument();

    const confirmBtn = screen.getByRole("button", { name: "Delete" });
    fireEvent.click(confirmBtn);

    expect(onConfirm).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it("triggers onCancel when Cancel button is clicked", () => {
    const onCancel = vi.fn();
    const onClose = vi.fn();
    render(
      <ConfirmModal
        options={{
          title: "Cancel Check",
          message: "Check cancel behavior",
          onConfirm: vi.fn(),
          onCancel,
        }}
        onClose={onClose}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("handles Escape key cleanly", () => {
    const onClose = vi.fn();
    render(
      <ConfirmModal
        options={{
          title: "Escape Check",
          message: "Pressing escape should dismiss",
          onConfirm: vi.fn(),
        }}
        onClose={onClose}
      />
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("PromptModal component", () => {
  it("renders title, input, and submits entered text", async () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(
      <PromptModal
        options={{
          title: "AI Prompt",
          message: "Enter instructions",
          placeholder: "Type here...",
          confirmLabel: "Generate",
          onConfirm,
        }}
        onClose={onClose}
      />
    );

    const input = screen.getByPlaceholderText("Type here...");
    fireEvent.change(input, { target: { value: "Create a hello world function" } });

    const submitBtn = screen.getByRole("button", { name: "Generate" });
    fireEvent.click(submitBtn);

    expect(onConfirm).toHaveBeenCalledWith("Create a hello world function");
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
