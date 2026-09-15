import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { COST_CENTS_MAX } from '@ubiquiti-todo/shared';
import { CostInput } from './CostInput';

describe('CostInput', () => {
  it('shows a placeholder when null, and the formatted amount otherwise', () => {
    const { rerender } = render(<CostInput costCents={null} onSave={vi.fn()} />);
    expect(screen.getByText('Add cost…')).toBeInTheDocument();

    rerender(<CostInput costCents={1250} onSave={vi.fn()} />);
    expect(screen.getByText('$12.50')).toBeInTheDocument();
  });

  it('commits a valid value on blur', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<CostInput costCents={null} onSave={onSave} />);

    await user.click(screen.getByRole('button'));
    const input = screen.getByPlaceholderText('0.00');
    await user.type(input, '4.999');
    await user.tab(); // blur

    expect(onSave).toHaveBeenCalledWith(500); // rounded to the nearest cent
  });

  it('reverts silently on invalid input — no onSave call', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<CostInput costCents={null} onSave={onSave} />);

    await user.click(screen.getByRole('button'));
    await user.type(screen.getByPlaceholderText('0.00'), 'abc');
    await user.tab();

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Add cost…')).toBeInTheDocument(); // back to view mode, unchanged
  });

  it('refuses a value over COST_CENTS_MAX', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<CostInput costCents={null} onSave={onSave} />);

    await user.click(screen.getByRole('button'));
    const overMax = ((COST_CENTS_MAX + 100) / 100).toFixed(2);
    await user.type(screen.getByPlaceholderText('0.00'), overMax);
    await user.tab();

    expect(onSave).not.toHaveBeenCalled();
  });

  it('Escape discards without saving, keeping the original value', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<CostInput costCents={1000} onSave={onSave} />);

    await user.click(screen.getByRole('button'));
    await user.clear(screen.getByPlaceholderText('0.00'));
    await user.type(screen.getByPlaceholderText('0.00'), '99.99');
    await user.keyboard('{Escape}');

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('$10.00')).toBeInTheDocument();
  });

  it('does not call onSave when the value is unchanged', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<CostInput costCents={1000} onSave={onSave} />);

    await user.click(screen.getByRole('button'));
    await user.tab(); // blur with no edits

    expect(onSave).not.toHaveBeenCalled();
  });
});
