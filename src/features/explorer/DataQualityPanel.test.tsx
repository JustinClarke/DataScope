import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor, within } from '@testing-library/react';
import { DataQualityPanel } from './DataQualityPanel';
import { EducationalPanelProvider } from '../../app/EducationalPanelContext';
import { useEducationalPanel } from '../../app/useEducationalPanel';
import type { DatasetQualityReport } from '../../services/dataQuality';
import type { TableRegistryEntry } from '../../types';

const { loadDatasetQualityReportMock } = vi.hoisted(() => ({ loadDatasetQualityReportMock: vi.fn() }));
vi.mock('../../services/dataQuality', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/dataQuality')>();
  return { ...actual, loadDatasetQualityReport: loadDatasetQualityReportMock };
});

const { runInConsoleMock } = vi.hoisted(() => ({ runInConsoleMock: vi.fn() }));
vi.mock('../../services/runPath', () => ({ runInConsole: runInConsoleMock }));

function ContentProbe() {
  const { content } = useEducationalPanel();
  return <div data-testid="edu-content">{content}</div>;
}

function renderPanel(tables: TableRegistryEntry[]) {
  return render(
    <EducationalPanelProvider>
      <DataQualityPanel tables={tables} />
      <ContentProbe />
    </EducationalPanelProvider>,
  );
}

const customers: TableRegistryEntry = {
  id: 't-customers',
  tableName: 'customers',
  datasetId: 'ds-1',
  origin: 'sample',
  rowCount: 100,
  columnCount: 1,
  memoryBytes: 100,
  createdAt: new Date().toISOString(),
};

describe('DataQualityPanel (S2)', () => {
  it('renders nothing with zero registered tables', () => {
    const { container } = renderPanel([]);
    expect(container.querySelector('[data-testid="data-quality-panel"]')).toBeNull();
    expect(loadDatasetQualityReportMock).not.toHaveBeenCalled();
  });

  it('shows the loading line while the report is in flight', () => {
    loadDatasetQualityReportMock.mockReturnValue(new Promise(() => {}));
    const { container } = renderPanel([customers]);
    expect(within(container).getByText('Checking data quality…')).toBeTruthy();
  });

  it('renders Quality Warnings and Health Checks Passed groups from a mocked report', async () => {
    const report: DatasetQualityReport = {
      warnings: [
        {
          id: 't-customers:null-pattern:email',
          tableId: 't-customers',
          tableName: 'customers',
          rule: 'null-pattern',
          description: 'Missing values concentrated in customers.email (61.0% null).',
          sql: 'SELECT COUNT(*) FROM customers',
        },
      ],
      passedRules: ['duplicates', 'zero-variance'],
    };
    loadDatasetQualityReportMock.mockResolvedValue(report);

    const { container } = renderPanel([customers]);

    await waitFor(() => expect(within(container).getByText(/customers\.email/)).toBeTruthy());
    expect(within(container).getByText('Quality Warnings')).toBeTruthy();
    expect(within(container).getByText('Health Checks Passed')).toBeTruthy();
    expect(within(container).getByText('No duplicate rows detected.')).toBeTruthy();
    expect(within(container).getByText('No zero-variance columns detected.')).toBeTruthy();
  });

  it('collapses and expands via its own chevron', async () => {
    loadDatasetQualityReportMock.mockResolvedValue({
      warnings: [
        {
          id: 't-customers:duplicates',
          tableId: 't-customers',
          tableName: 'customers',
          rule: 'duplicates',
          description: '5 fully duplicated rows detected in customers.',
          sql: 'SELECT 1',
        },
      ],
      passedRules: [],
    });

    const { container } = renderPanel([customers]);
    await waitFor(() => expect(within(container).getByText(/fully duplicated rows/)).toBeTruthy());

    const toggle = within(container).getByRole('button', { name: /Data Quality & Health/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(within(container).queryByText(/fully duplicated rows/)).toBeNull();

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(within(container).getByText(/fully duplicated rows/)).toBeTruthy();
  });

  it('"Show SQL" opens the educational panel with the finding\'s sql', async () => {
    loadDatasetQualityReportMock.mockResolvedValue({
      warnings: [
        {
          id: 't-customers:duplicates',
          tableId: 't-customers',
          tableName: 'customers',
          rule: 'duplicates',
          description: '5 fully duplicated rows detected in customers.',
          sql: 'SELECT COUNT(*) FROM customers',
        },
      ],
      passedRules: [],
    });

    const { container } = renderPanel([customers]);
    const button = await waitFor(() => within(container).getByText('Show SQL'));
    fireEvent.click(button);

    const probe = within(container).getByTestId('edu-content');
    expect(within(probe).getByText('SELECT COUNT(*) FROM customers')).toBeTruthy();
  });

  it('runs a finding\'s query in the console (S4) — D68e\'s duplicates destination', async () => {
    loadDatasetQualityReportMock.mockResolvedValue({
      warnings: [
        {
          id: 't-customers:duplicates',
          tableId: 't-customers',
          tableName: 'customers',
          rule: 'duplicates',
          description: '5 fully duplicated rows detected in customers.',
          sql: 'SELECT * FROM customers QUALIFY COUNT(*) OVER () > 1',
        },
      ],
      passedRules: [],
    });

    const { container } = renderPanel([customers]);
    const run = await waitFor(() => within(container).getByRole('button', { name: /run/i }));
    fireEvent.click(run);

    expect(runInConsoleMock).toHaveBeenCalledWith('SELECT * FROM customers QUALIFY COUNT(*) OVER () > 1');
  });
});
