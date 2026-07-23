// §14 bundled sample datasets, selectable from the ingestion screen.

export interface SampleFile {
  url: string;
  tableName: string;
}

export interface SampleManifestEntry {
  id: string;
  label: string;
  description: string;
  files: SampleFile[];
}

export const SAMPLE_MANIFEST: SampleManifestEntry[] = [
  {
    id: 'ecommerce',
    label: 'E-commerce mini-warehouse',
    description: 'Four related tables — customers, orders, order items, products. Cross-table SQL and joins.',
    files: [
      { url: '/samples/ecommerce/customers.csv', tableName: 'customers' },
      { url: '/samples/ecommerce/products.csv', tableName: 'products' },
      { url: '/samples/ecommerce/orders.csv', tableName: 'orders' },
      { url: '/samples/ecommerce/order_items.csv', tableName: 'order_items' },
    ],
  },
  {
    id: 'titanic',
    label: 'Titanic Passengers',
    description: 'Age and fare distributions, categorical breakdown by class and survival.',
    files: [{ url: '/samples/titanic.csv', tableName: 'titanic' }],
  },
  {
    id: 'stock_prices',
    label: 'Daily Stock Prices',
    description: 'Ten years of daily OHLCV data — time series and correlation.',
    files: [{ url: '/samples/stock_prices.csv', tableName: 'stock_prices' }],
  },
  {
    id: 'product_reviews',
    label: 'Product Reviews',
    description: 'Ratings and free-text reviews — categorical breakdown and text search.',
    files: [{ url: '/samples/product_reviews.csv', tableName: 'product_reviews' }],
  },
  {
    id: 'weather',
    label: 'City Weather Data',
    description: 'Ten years of daily temperature, humidity, and wind — time series and correlation.',
    files: [{ url: '/samples/weather.csv', tableName: 'weather' }],
  },
];
