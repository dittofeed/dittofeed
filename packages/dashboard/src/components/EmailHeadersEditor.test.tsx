import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EmailHeadersEditor } from "./EmailHeadersEditor";

// Note: These tests require @testing-library/react and vitest configured
// in the dashboard package

describe("EmailHeadersEditor", () => {
  it("renders empty state", () => {
    const onChange = vi.fn();
    render(<EmailHeadersEditor headers={[]} onChange={onChange} />);
    expect(screen.getByText(/No custom headers configured/)).toBeDefined();
  });

  it("renders existing headers", () => {
    const onChange = vi.fn();
    const headers = [
      { name: "X-PM-Message-Stream", value: "broadcast" },
    ];
    render(<EmailHeadersEditor headers={headers} onChange={onChange} />);
    const nameInput = screen.getByDisplayValue("X-PM-Message-Stream");
    const valueInput = screen.getByDisplayValue("broadcast");
    expect(nameInput).toBeDefined();
    expect(valueInput).toBeDefined();
  });

  it("calls onChange when add button is clicked", () => {
    const onChange = vi.fn();
    render(<EmailHeadersEditor headers={[]} onChange={onChange} />);
    const addButton = screen.getByText("Add Header");
    fireEvent.click(addButton);
    expect(onChange).toHaveBeenCalledWith([{ name: "", value: "" }]);
  });

  it("calls onChange when remove button is clicked", () => {
    const onChange = vi.fn();
    const headers = [
      { name: "X-Custom", value: "test" },
    ];
    render(<EmailHeadersEditor headers={headers} onChange={onChange} />);
    const removeButton = screen.getByLabelText("Remove header");
    fireEvent.click(removeButton);
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
