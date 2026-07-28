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
    description: 'Four tables. Cross-table SQL and joins.',
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
    description: 'Age/fare stats, categorical survival breakdown.',
    files: [{ url: '/samples/titanic.csv', tableName: 'titanic' }],
  },
  {
    id: 'stock_prices',
    label: 'Daily Stock Prices',
    description: 'Daily OHLCV data. Time series correlation.',
    files: [{ url: '/samples/stock_prices.csv', tableName: 'stock_prices' }],
  },
  {
    id: 'product_reviews',
    label: 'Product Reviews',
    description: 'Ratings & free-text. Text search examples.',
    files: [{ url: '/samples/product_reviews.csv', tableName: 'product_reviews' }],
  },
  {
    id: 'weather',
    label: 'City Weather Data',
    description: 'Temp, humidity, wind. Time series examples.',
    files: [{ url: '/samples/weather.csv', tableName: 'weather' }],
  },
];
