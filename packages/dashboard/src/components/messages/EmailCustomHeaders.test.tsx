import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { EmailCustomHeaders } from './EmailCustomHeaders';
import { EmailHeaders } from '@dittofeed/isomorphic-lib/src/types/emailHeaders';

describe('EmailCustomHeaders', () => {
  it('renders empty state with add button', () => {
    const onChange = jest.fn();
    render(<EmailCustomHeaders headers={[]} onChange={onChange} />);

    expect(screen.getByText('Custom Headers')).toBeInTheDocument();
    expect(screen.getByText('Add Header')).toBeInTheDocument();
  });

  it('renders existing headers', () => {
    const headers: EmailHeaders = [
      { name: 'X-PM-Message-Stream', value: 'broadcast' },
    ];
    const onChange = jest.fn();
    render(<EmailCustomHeaders headers={headers} onChange={onChange} />);

    expect(screen.getByDisplayValue('X-PM-Message-Stream')).toBeInTheDocument();
    expect(screen.getByDisplayValue('broadcast')).toBeInTheDocument();
  });

  it('calls onChange when adding a header', () => {
    const onChange = jest.fn();
    render(<EmailCustomHeaders headers={[]} onChange={onChange} />);

    fireEvent.click(screen.getByText('Add Header'));
    expect(onChange).toHaveBeenCalledWith([{ name: '', value: '' }]);
  });

  it('calls onChange when removing a header', () => {
    const headers: EmailHeaders = [
      { name: 'X-PM-Message-Stream', value: 'broadcast' },
      { name: 'X-Priority', value: '1' },
    ];
    const onChange = jest.fn();
    render(<EmailCustomHeaders headers={headers} onChange={onChange} />);

    const deleteButtons = screen.getAllByRole('button', { name: /remove header/i });
    fireEvent.click(deleteButtons[0]);
    expect(onChange).toHaveBeenCalledWith([{ name: 'X-Priority', value: '1' }]);
  });

  it('disables inputs when disabled prop is true', () => {
    const headers: EmailHeaders = [
      { name: 'X-Test', value: 'value' },
    ];
    const onChange = jest.fn();
    render(
      <EmailCustomHeaders headers={headers} onChange={onChange} disabled />
    );

    const inputs = screen.getAllByRole('textbox');
    inputs.forEach((input) => {
      expect(input).toBeDisabled();
    });
  });

  it('shows validation errors for reserved headers', () => {
    const headers: EmailHeaders = [{ name: 'From', value: 'test@test.com' }];
    const onChange = jest.fn();
    render(<EmailCustomHeaders headers={headers} onChange={onChange} />);

    expect(screen.getByText(/cannot override reserved header/i)).toBeInTheDocument();
  });
});
