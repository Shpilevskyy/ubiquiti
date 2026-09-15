import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SubtaskProgress } from './SubtaskProgress';

describe('SubtaskProgress', () => {
  it('renders nothing when there are no subtasks', () => {
    const { container } = render(<SubtaskProgress done={0} total={0} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the done/total count', () => {
    render(<SubtaskProgress done={1} total={3} />);
    expect(screen.getByText('1/3')).toBeInTheDocument();
  });

  it('renders 0/N when none are done yet', () => {
    render(<SubtaskProgress done={0} total={2} />);
    expect(screen.getByText('0/2')).toBeInTheDocument();
  });
});
