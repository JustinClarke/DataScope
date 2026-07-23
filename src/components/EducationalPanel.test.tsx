import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { EducationalPanel } from './EducationalPanel';
import { EducationalPanelProvider } from '../app/EducationalPanelContext';
import { useEducationalPanel } from '../app/useEducationalPanel';

describe('EducationalPanel', () => {
  it('renders empty state when no content is set', () => {
    render(
      <EducationalPanelProvider>
        <EducationalPanel />
      </EducationalPanelProvider>
    );

    expect(screen.getByText('Nothing to explain yet')).toBeTruthy();
  });

  it('renders pushed content when available', () => {
    function TestComponent() {
      const { setContent } = useEducationalPanel();
      useEffect(() => {
        setContent('SELECT * FROM table;');
      }, [setContent]);

      return <EducationalPanel />;
    }

    render(
      <EducationalPanelProvider>
        <TestComponent />
      </EducationalPanelProvider>
    );

    expect(screen.getByText('SELECT * FROM table;')).toBeTruthy();
  });

  it('renders React nodes as content', () => {
    function TestComponent() {
      const { setContent } = useEducationalPanel();
      useEffect(() => {
        setContent(<div data-testid="custom-content">Custom Content</div>);
      }, [setContent]);

      return <EducationalPanel />;
    }

    render(
      <EducationalPanelProvider>
        <TestComponent />
      </EducationalPanelProvider>
    );

    expect(screen.getByTestId('custom-content')).toBeTruthy();
    expect(screen.getByText('Custom Content')).toBeTruthy();
  });
});
