import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { SidebarGroup } from './SidebarGroup';

describe('SidebarGroup', () => {
  it('renders children only when expanded', () => {
    const { container, rerender } = render(
      <SidebarGroup label="DATA" expanded={false} onToggle={() => {}}>
        <button>Ingest</button>
      </SidebarGroup>,
    );
    expect(container.textContent).not.toContain('Ingest');

    rerender(
      <SidebarGroup label="DATA" expanded={true} onToggle={() => {}}>
        <button>Ingest</button>
      </SidebarGroup>,
    );
    expect(container.textContent).toContain('Ingest');
  });

  it('calls onToggle when the header is clicked', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <SidebarGroup label="DATA" expanded={false} onToggle={onToggle}>
        <button>Ingest</button>
      </SidebarGroup>,
    );
    fireEvent.click(container.querySelector('button')!);
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('renders a badge when given one', () => {
    const { container } = render(
      <SidebarGroup label="DATA" expanded={true} onToggle={() => {}} badge="Tables (3)">
        <button>Ingest</button>
      </SidebarGroup>,
    );
    expect(container.textContent).toContain('Tables (3)');
  });

  it('reflects expanded state via aria-expanded', () => {
    const { container } = render(
      <SidebarGroup label="DATA" expanded={true} onToggle={() => {}}>
        <button>Ingest</button>
      </SidebarGroup>,
    );
    expect(container.querySelector('button[aria-expanded="true"]')).not.toBeNull();
  });
});
