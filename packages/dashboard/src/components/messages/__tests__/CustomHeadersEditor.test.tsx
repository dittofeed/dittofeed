import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import CustomHeadersEditor from "../CustomHeadersEditor";
import { CustomEmailHeaders } from "@dittofeed/isomorphic-lib/src/emailHeaders";

describe("CustomHeadersEditor", () => {
  const mockOnChange = jest.fn();

  beforeEach(() => {
    mockOnChange.mockClear();
  });

  it("renders empty state with info message", () => {
    render(<CustomHeadersEditor headers={[]} onChange={mockOnChange} />);
    expect(screen.getByText(/No custom headers configured/)).toBeInTheDocument();
  });

  it("renders existing headers", () => {
    const headers: CustomEmailHeaders = [
      { name: "X-PM-Message-Stream", value: "broadcast" },
    ];
    render(<CustomHeadersEditor headers={headers} onChange={mockOnChange} />);
    expect(screen.getByDisplayValue("X-PM-Message-Stream")).toBeInTheDocument();
    expect(screen.getByDisplayValue("broadcast")).toBeInTheDocument();
  });

  it("calls onChange when adding a header", () => {
    render(<CustomHeadersEditor headers={[]} onChange={mockOnChange} />);
    const addButton = screen.getByText("Add Header");
    fireEvent.click(addButton);
    expect(mockOnChange).toHaveBeenCalledWith([{ name: "X-", value: "" }]);
  });

  it("calls onChange when removing a header", () => {
    const headers: CustomEmailHeaders = [
      { name: "X-Test", value: "value1" },
      { name: "X-Other", value: "value2" },
    ];
    render(<CustomHeadersEditor headers={headers} onChange={mockOnChange} />);
    const deleteButtons = screen.getAllByRole("button", { name: /delete/i });
    fireEvent.click(deleteButtons[0]);
    expect(mockOnChange).toHaveBeenCalledWith([
      { name: "X-Other", value: "value2" },
    ]);
  });

  it("disables inputs when disabled prop is true", () => {
    const headers: CustomEmailHeaders = [
      { name: "X-Test", value: "value" },
    ];
    render(
      <CustomHeadersEditor
        headers={headers}
        onChange={mockOnChange}
        disabled={true}
      />
    );
    const inputs = screen.getAllByRole("textbox");
    inputs.forEach((input) => {
      expect(input).toBeDisabled();
    });
  });

  it("disables add button when max headers reached", () => {
    const headers: CustomEmailHeaders = Array.from({ length: 20 }, (_, i) => ({
      name: `X-Header-${i}`,
      value: `value-${i}`,
    }));
    render(<CustomHeadersEditor headers={headers} onChange={mockOnChange} />);
    const addButton = screen.getByText("Add Header");
    expect(addButton.closest("button")).toBeDisabled();
  });
});
