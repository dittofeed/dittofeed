import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { EmailHeadersEditor } from './EmailHeadersEditor';
import { EmailHeader } from 'isomorphic-lib/src/types/emailHeaders';

describe('EmailHeadersEditor', () => {
  const mockOnChange = jest.fn();

  beforeEach(() => {
    mockOnChange.mockClear();
  });

  it('renders empty state', () => {
    render(<EmailHeadersEditor headers={[]} onChange={mockOnChange} />);
    expect(screen.getByText(/No custom headers configured/)).toBeInTheDocument();
  });

  it('renders existing headers', () => {
    const headers: EmailHeader[] = [
      { name: 'X-PM-Message-Stream', value: 'broadcast' },
    ];
    render(<EmailHeadersEditor headers={headers} onChange={mockOnChange} />);
    const nameInput = screen.getByDisplayValue('X-PM-Message-Stream');
    const valueInput = screen.getByDisplayValue('broadcast');
    expect(nameInput).toBeInTheDocument();
    expect(valueInput).toBeInTheDocument();
  });

  it('calls onChange when adding a header', () => {
    render(<EmailHeadersEditor headers={[]} onChange={mockOnChange} />);
    fireEvent.click(screen.getByText('Add Header'));
    expect(mockOnChange).toHaveBeenCalledWith([{ name: '', value: '' }]);
  });

  it('calls onChange when removing a header', () => {
    const headers: EmailHeader[] = [
      { name: 'X-Test', value: 'value' },
    ];
    render(<EmailHeadersEditor headers={headers} onChange={mockOnChange} />);
    const deleteButtons = screen.getAllByRole('button', { name: '' });
    // Find the delete button (IconButton)
    const deleteBtn = deleteButtons.find(btn => btn.querySelector('[data-testid="DeleteIcon"]'));
    if (deleteBtn) {
      fireEvent.click(deleteBtn);
      expect(mockOnChange).toHaveBeenCalledWith([]);
    }
  });

  it('disables inputs when disabled prop is true', () => {
    const headers: EmailHeader[] = [
      { name: 'X-Test', value: 'value' },
    ];
    render(<EmailHeadersEditor headers={headers} onChange={mockOnChange} disabled />);
    const nameInput = screen.getByDisplayValue('X-Test');
    expect(nameInput).toBeDisabled();
  });
});
