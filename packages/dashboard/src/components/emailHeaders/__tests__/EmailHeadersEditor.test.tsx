import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { EmailHeadersEditor } from "../EmailHeadersEditor";
import { EmailHeader } from "isomorphic-lib/src/emailHeaders";

describe("EmailHeadersEditor", () => {
  it("should render empty state", () => {
    const onChange = jest.fn();
    render(<EmailHeadersEditor headers={[]} onChange={onChange} />);
    expect(screen.getByText(/No custom headers configured/)).toBeInTheDocument();
  });

  it("should render existing headers", () => {
    const headers: EmailHeader[] = [
      { name: "X-PM-Message-Stream", value: "broadcast" },
    ];
    const onChange = jest.fn();
    render(<EmailHeadersEditor headers={headers} onChange={onChange} />);
    expect(screen.getByDisplayValue("X-PM-Message-Stream")).toBeInTheDocument();
    expect(screen.getByDisplayValue("broadcast")).toBeInTheDocument();
  });

  it("should call onChange when adding a header", () => {
    const onChange = jest.fn();
    render(<EmailHeadersEditor headers={[]} onChange={onChange} />);
    fireEvent.click(screen.getByText("Add Header"));
    expect(onChange).toHaveBeenCalledWith([{ name: "", value: "" }]);
  });

  it("should call onChange when removing a header", () => {
    const headers: EmailHeader[] = [
      { name: "X-Custom", value: "value" },
    ];
    const onChange = jest.fn();
    render(<EmailHeadersEditor headers={headers} onChange={onChange} />);
    const deleteButtons = screen.getAllByRole("button", { name: "" });
    // The delete button
    fireEvent.click(deleteButtons[deleteButtons.length - 1]);
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("should be disabled when disabled prop is true", () => {
    const onChange = jest.fn();
    render(<EmailHeadersEditor headers={[]} onChange={onChange} disabled />);
    expect(screen.getByText("Add Header").closest("button")).toBeDisabled();
  });
});
