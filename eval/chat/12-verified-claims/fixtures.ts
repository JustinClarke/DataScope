import type { EvidencePacket } from './evidence';

// Fixed evidence shaped like experiment 11 output. The worked values make the
// audited "January decreased" statement false: January is greater than December.
export const monthlyRevenue: EvidencePacket = {
  id: 'monthly-revenue',
  metric: 'sum(order_items.quantity * products.unit_price)',
  unit: 'USD',
  completeness: 'complete',
  rows: [
    { rowId: 'dec-2021', label: 'December 2021 revenue', value: 12_500 },
    { rowId: 'jan-2022', label: 'January 2022 revenue', value: 13_750 },
    { rowId: 'feb-2022', label: 'February 2022 revenue', value: 11_250 },
  ],
};
