import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent, within } from '@testing-library/react';
import { SharedStructureReportView } from './SharedStructureReportView';
import type { StructureReport } from '../../lib/structureReport';

const report: StructureReport = {
  dspsVersion: '1.0.0',
  generatedAt: '2026-07-23T00:00:00.000Z',
  tables: [
    {
      tableName: 'titanic',
      rowCount: 891,
      columnCount: 2,
      columns: [
        { name: 'fare', semanticType: 'Quantitative', physicalType: 'DOUBLE', nullPercentage: 0, cardinality: 200 },
        { name: 'survived', semanticType: 'Categorical', physicalType: 'BIGINT', nullPercentage: 0, cardinality: 2 },
      ],
    },
  ],
  insights: [
    {
      tableName: 'titanic',
      rule: 'duplicates',
      description: 'no duplicate rows found',
      provenance: 'derived-this-run',
      snapshot: { date: '2026-07-23T00:00:00.000Z', fileHash: null },
    },
  ],
};

describe('SharedStructureReportView', () => {
  it('renders schema, types, and profile aggregates — never raw data rows', () => {
    const { container } = render(<SharedStructureReportView report={report} onClose={vi.fn()} />);
    expect(within(container).getByRole('heading', { name: 'titanic' })).toBeTruthy();
    expect(container.textContent).toContain('891 rows × 2 cols');
    expect(container.textContent).toContain('fare');
    expect(container.textContent).toContain('Quantitative');
  });

  it('states plainly that structure only, no data rows, is what this is', () => {
    const { container } = render(<SharedStructureReportView report={report} onClose={vi.fn()} />);
    expect(container.textContent).toMatch(/no data rows included/i);
  });

  it('shows relationships only when the report carries them', () => {
    const { container: withoutRels } = render(<SharedStructureReportView report={report} onClose={vi.fn()} />);
    expect(withoutRels.textContent).not.toContain('Relationships');

    const withRelationships: StructureReport = {
      ...report,
      relationships: [
        { childTable: 'orders', childColumn: 'customer_id', parentTable: 'customers', parentColumn: 'id', confidence: 'confident', containment: 0.9, evidence: 'x' },
      ],
    };
    const { container } = render(<SharedStructureReportView report={withRelationships} onClose={vi.fn()} />);
    expect(container.textContent).toContain('orders.customer_id');
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    const { container } = render(<SharedStructureReportView report={report} onClose={onClose} />);
    fireEvent.click(within(container).getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
