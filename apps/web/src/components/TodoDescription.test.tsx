import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TodoDescription } from './TodoDescription';

describe('TodoDescription', () => {
  it('view mode shows a placeholder when empty, and renders markdown otherwise', () => {
    const { rerender } = render(<TodoDescription descriptionMd={null} onSave={vi.fn()} />);
    expect(screen.getByText('Add a description…')).toBeInTheDocument();

    rerender(<TodoDescription descriptionMd="**bold**" onSave={vi.fn()} />);
    expect(screen.getByText('bold').tagName).toBe('STRONG'); // rendered, not literal "**bold**"
  });

  it('clicking enters edit mode with the current value in a textarea', async () => {
    const user = userEvent.setup();
    render(<TodoDescription descriptionMd="Existing text" onSave={vi.fn()} />);

    await user.click(screen.getByRole('button'));
    const textarea = screen.getByRole('textbox');
    expect(textarea).toHaveValue('Existing text');
  });

  it('commits the new value on blur', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<TodoDescription descriptionMd="Old" onSave={onSave} />);

    await user.click(screen.getByRole('button'));
    await user.clear(screen.getByRole('textbox'));
    await user.type(screen.getByRole('textbox'), 'New');
    await user.tab();

    expect(onSave).toHaveBeenCalledWith('New');
  });

  it('commits on Cmd/Ctrl+Enter without needing a blur', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<TodoDescription descriptionMd="Old" onSave={onSave} />);

    await user.click(screen.getByRole('button'));
    await user.clear(screen.getByRole('textbox'));
    await user.type(screen.getByRole('textbox'), 'New{Control>}{Enter}{/Control}');

    expect(onSave).toHaveBeenCalledWith('New');
  });

  it('Escape discards without saving and reverts to view mode', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<TodoDescription descriptionMd="Old" onSave={onSave} />);

    await user.click(screen.getByRole('button'));
    await user.type(screen.getByRole('textbox'), ' more text');
    await user.keyboard('{Escape}');

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Old')).toBeInTheDocument();
  });

  it('does not call onSave when blurring with no changes made', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<TodoDescription descriptionMd="Unchanged" onSave={onSave} />);

    await user.click(screen.getByRole('button'));
    await user.tab();

    expect(onSave).not.toHaveBeenCalled();
  });

  // specs/09-markdown-descriptions.md: an incoming realtime update while the textarea is open
  // (e.g. useListSocket applying a broadcast to the query cache mid-edit) must not overwrite what
  // the user is actively typing — the new value should only appear once they exit edit mode.
  it('an incoming prop update while editing does not clobber the open draft', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const { rerender } = render(<TodoDescription descriptionMd="Original" onSave={onSave} />);

    await user.click(screen.getByRole('button'));
    await user.type(screen.getByRole('textbox'), ' + my edits');
    expect(screen.getByRole('textbox')).toHaveValue('Original + my edits');

    // Simulates a realtime broadcast landing mid-edit: the cache (and therefore this prop)
    // changes to a value the user never typed.
    rerender(<TodoDescription descriptionMd="Someone else's edit" onSave={onSave} />);

    expect(screen.getByRole('textbox')).toHaveValue('Original + my edits'); // untouched

    await user.tab(); // commit
    expect(onSave).toHaveBeenCalledWith('Original + my edits');
  });

  it('re-entering edit mode after exiting picks up the latest prop value, not the stale draft', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<TodoDescription descriptionMd="Original" onSave={vi.fn()} />);

    await user.click(screen.getByRole('button'));
    await user.type(screen.getByRole('textbox'), ' + typed');
    await user.keyboard('{Escape}'); // discard, back to view mode

    // The mid-edit broadcast lands after the user has exited edit mode.
    rerender(<TodoDescription descriptionMd="Server's latest value" onSave={vi.fn()} />);
    expect(screen.getByText("Server's latest value")).toBeInTheDocument();

    await user.click(screen.getByRole('button'));
    expect(screen.getByRole('textbox')).toHaveValue("Server's latest value");
  });
});
