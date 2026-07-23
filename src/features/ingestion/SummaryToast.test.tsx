import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { SummaryToast } from './SummaryToast';

describe('SummaryToast', () => {
  it('calls onDismiss when the close button is clicked', () => {
    const onDismiss = vi.fn();
    const { getByLabelText } = render(<SummaryToast ingestedCount={2} skipped={[]} onDismiss={onDismiss} />);
    fireEvent.click(getByLabelText('Dismiss'));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
