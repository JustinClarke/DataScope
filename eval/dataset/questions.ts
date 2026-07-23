// The D40 labeled question/expected-answer set (§11.4) — the expensive
// artifact, curated over the §14 bundled sample datasets. Each item's
// `referenceSql` is executed against the same eval engine the generated SQL
// runs against; result-correctness is execution-match (order-insensitive,
// numerically rounded), not string comparison against `referenceSql` — a
// differently-shaped but equivalent query still scores correct.
export interface EvalQuestion {
  id: string;
  /** Matches an `EvalDataset.id` from dataset/tables.ts. */
  dataset: string;
  question: string;
  referenceSql: string;
  /** One-word tags for slicing the report by query shape. */
  tags: string[];
}

export const QUESTIONS: EvalQuestion[] = [
  // ── titanic ───────────────────────────────────────────────────────────
  { id: 'titanic-01', dataset: 'titanic', question: 'How many passengers are there?', referenceSql: 'SELECT count(*) AS n FROM titanic', tags: ['aggregate'] },
  { id: 'titanic-02', dataset: 'titanic', question: 'How many passengers survived?', referenceSql: 'SELECT count(*) AS n FROM titanic WHERE "Survived" = 1', tags: ['filter'] },
  { id: 'titanic-03', dataset: 'titanic', question: 'What is the average fare?', referenceSql: 'SELECT round(avg("Fare"), 2) AS avg_fare FROM titanic', tags: ['aggregate'] },
  { id: 'titanic-04', dataset: 'titanic', question: 'What is the survival rate by passenger class?', referenceSql: 'SELECT "Pclass", round(avg("Survived"::DOUBLE), 4) AS survival_rate FROM titanic GROUP BY "Pclass" ORDER BY "Pclass"', tags: ['groupby'] },
  { id: 'titanic-05', dataset: 'titanic', question: 'How many male and how many female passengers were there?', referenceSql: 'SELECT "Sex", count(*) AS n FROM titanic GROUP BY "Sex"', tags: ['groupby'] },
  { id: 'titanic-06', dataset: 'titanic', question: 'What was the oldest passenger age?', referenceSql: 'SELECT max("Age") AS oldest FROM titanic', tags: ['aggregate'] },
  { id: 'titanic-07', dataset: 'titanic', question: 'How many passengers embarked from each port?', referenceSql: 'SELECT "Embarked", count(*) AS n FROM titanic GROUP BY "Embarked" ORDER BY "Embarked"', tags: ['groupby'] },
  { id: 'titanic-08', dataset: 'titanic', question: 'What is the average fare paid by survivors versus non-survivors?', referenceSql: 'SELECT "Survived", round(avg("Fare"), 2) AS avg_fare FROM titanic GROUP BY "Survived" ORDER BY "Survived"', tags: ['groupby'] },
  { id: 'titanic-09', dataset: 'titanic', question: 'How many passengers under age 18 were there?', referenceSql: 'SELECT count(*) AS n FROM titanic WHERE "Age" < 18', tags: ['filter'] },
  { id: 'titanic-10', dataset: 'titanic', question: 'List the 5 passengers who paid the highest fare, showing name and fare.', referenceSql: 'SELECT "Name", "Fare" FROM titanic ORDER BY "Fare" DESC LIMIT 5', tags: ['topn'] },
  { id: 'titanic-11', dataset: 'titanic', question: 'What percentage of first-class passengers survived?', referenceSql: 'SELECT round(100.0 * avg("Survived"::DOUBLE), 1) AS pct FROM titanic WHERE "Pclass" = 1', tags: ['filter', 'aggregate'] },
  { id: 'titanic-12', dataset: 'titanic', question: 'How many passengers had no siblings or spouses aboard?', referenceSql: 'SELECT count(*) AS n FROM titanic WHERE "SibSp" = 0', tags: ['filter'] },

  // ── stock_prices ──────────────────────────────────────────────────────
  { id: 'stock-01', dataset: 'stock_prices', question: 'How many trading days are in the dataset?', referenceSql: 'SELECT count(*) AS n FROM stock_prices', tags: ['aggregate'] },
  { id: 'stock-02', dataset: 'stock_prices', question: 'What was the highest closing price ever recorded?', referenceSql: 'SELECT max("Close") AS max_close FROM stock_prices', tags: ['aggregate'] },
  { id: 'stock-03', dataset: 'stock_prices', question: 'What was the lowest closing price ever recorded?', referenceSql: 'SELECT min("Close") AS min_close FROM stock_prices', tags: ['aggregate'] },
  { id: 'stock-04', dataset: 'stock_prices', question: 'What is the average trading volume?', referenceSql: 'SELECT round(avg("Volume")) AS avg_volume FROM stock_prices', tags: ['aggregate'] },
  { id: 'stock-05', dataset: 'stock_prices', question: 'What was the total trading volume in 2018?', referenceSql: "SELECT sum(\"Volume\") AS total_volume FROM stock_prices WHERE extract(year FROM \"Date\") = 2018", tags: ['filter', 'timeseries'] },
  { id: 'stock-06', dataset: 'stock_prices', question: 'What was the average closing price per year?', referenceSql: 'SELECT extract(year FROM "Date") AS year, round(avg("Close"), 2) AS avg_close FROM stock_prices GROUP BY year ORDER BY year', tags: ['groupby', 'timeseries'] },
  { id: 'stock-07', dataset: 'stock_prices', question: 'On how many days did the close price finish higher than the open price?', referenceSql: 'SELECT count(*) AS n FROM stock_prices WHERE "Close" > "Open"', tags: ['filter'] },
  { id: 'stock-08', dataset: 'stock_prices', question: 'What were the 5 highest-volume trading days? Show the date and volume.', referenceSql: 'SELECT "Date", "Volume" FROM stock_prices ORDER BY "Volume" DESC LIMIT 5', tags: ['topn'] },
  { id: 'stock-09', dataset: 'stock_prices', question: 'What was the closing price on 2016-01-04?', referenceSql: "SELECT \"Close\" FROM stock_prices WHERE \"Date\" = DATE '2016-01-04'", tags: ['filter'] },
  { id: 'stock-10', dataset: 'stock_prices', question: 'What is the average daily price range (high minus low)?', referenceSql: 'SELECT round(avg("High" - "Low"), 2) AS avg_range FROM stock_prices', tags: ['aggregate'] },
  { id: 'stock-11', dataset: 'stock_prices', question: 'How many days had volume greater than 3,000,000?', referenceSql: 'SELECT count(*) AS n FROM stock_prices WHERE "Volume" > 3000000', tags: ['filter'] },
  { id: 'stock-12', dataset: 'stock_prices', question: 'What was the first and last trading date in the dataset?', referenceSql: 'SELECT min("Date") AS first_date, max("Date") AS last_date FROM stock_prices', tags: ['aggregate', 'timeseries'] },

  // ── weather ───────────────────────────────────────────────────────────
  { id: 'weather-01', dataset: 'weather', question: 'How many weather records are there?', referenceSql: 'SELECT count(*) AS n FROM weather', tags: ['aggregate'] },
  { id: 'weather-02', dataset: 'weather', question: 'How many distinct cities are in the dataset?', referenceSql: 'SELECT count(DISTINCT "City") AS n FROM weather', tags: ['aggregate'] },
  { id: 'weather-03', dataset: 'weather', question: 'What is the average high temperature for each city?', referenceSql: 'SELECT "City", round(avg("TempHighC"), 2) AS avg_high FROM weather GROUP BY "City" ORDER BY "City"', tags: ['groupby'] },
  { id: 'weather-04', dataset: 'weather', question: 'What was the highest wind speed ever recorded?', referenceSql: 'SELECT max("WindKph") AS max_wind FROM weather', tags: ['aggregate'] },
  { id: 'weather-05', dataset: 'weather', question: 'What is the average humidity across all records?', referenceSql: 'SELECT round(avg("Humidity"), 2) AS avg_humidity FROM weather', tags: ['aggregate'] },
  { id: 'weather-06', dataset: 'weather', question: 'How many days had a high temperature above 30 degrees Celsius?', referenceSql: 'SELECT count(*) AS n FROM weather WHERE "TempHighC" > 30', tags: ['filter'] },
  { id: 'weather-07', dataset: 'weather', question: 'What is the average temperature range (high minus low) per city?', referenceSql: 'SELECT "City", round(avg("TempHighC" - "TempLowC"), 2) AS avg_range FROM weather GROUP BY "City" ORDER BY "City"', tags: ['groupby'] },
  { id: 'weather-08', dataset: 'weather', question: 'Which city had the single highest recorded temperature? Show the city and temperature.', referenceSql: 'SELECT "City", "TempHighC" FROM weather ORDER BY "TempHighC" DESC LIMIT 1', tags: ['topn'] },
  { id: 'weather-09', dataset: 'weather', question: 'What was the average high temperature per year?', referenceSql: 'SELECT extract(year FROM "Date") AS year, round(avg("TempHighC"), 2) AS avg_high FROM weather GROUP BY year ORDER BY year', tags: ['groupby', 'timeseries'] },
  { id: 'weather-10', dataset: 'weather', question: 'How many records have humidity below 30?', referenceSql: 'SELECT count(*) AS n FROM weather WHERE "Humidity" < 30', tags: ['filter'] },
  { id: 'weather-11', dataset: 'weather', question: 'What is the lowest low temperature ever recorded, and in which city?', referenceSql: 'SELECT "City", "TempLowC" FROM weather ORDER BY "TempLowC" ASC LIMIT 1', tags: ['topn'] },
  { id: 'weather-12', dataset: 'weather', question: 'What is the average wind speed for each city?', referenceSql: 'SELECT "City", round(avg("WindKph"), 2) AS avg_wind FROM weather GROUP BY "City" ORDER BY "City"', tags: ['groupby'] },

  // ── product_reviews ───────────────────────────────────────────────────
  { id: 'reviews-01', dataset: 'product_reviews', question: 'How many reviews are there in total?', referenceSql: 'SELECT count(*) AS n FROM product_reviews', tags: ['aggregate'] },
  { id: 'reviews-02', dataset: 'product_reviews', question: 'What is the average rating across all reviews?', referenceSql: 'SELECT round(avg("Rating"), 2) AS avg_rating FROM product_reviews', tags: ['aggregate'] },
  { id: 'reviews-03', dataset: 'product_reviews', question: 'How many reviews have a rating of 5?', referenceSql: 'SELECT count(*) AS n FROM product_reviews WHERE "Rating" = 5', tags: ['filter'] },
  { id: 'reviews-04', dataset: 'product_reviews', question: 'How many reviews does each product have?', referenceSql: 'SELECT "ProductId", count(*) AS n FROM product_reviews GROUP BY "ProductId" ORDER BY "ProductId"', tags: ['groupby'] },
  { id: 'reviews-05', dataset: 'product_reviews', question: 'Which product has the highest average rating? Show the product id and its average rating.', referenceSql: 'SELECT "ProductId", round(avg("Rating"), 2) AS avg_rating FROM product_reviews GROUP BY "ProductId" ORDER BY avg_rating DESC LIMIT 1', tags: ['groupby', 'topn'] },
  { id: 'reviews-06', dataset: 'product_reviews', question: 'How many reviews had a rating of 2 or lower?', referenceSql: 'SELECT count(*) AS n FROM product_reviews WHERE "Rating" <= 2', tags: ['filter'] },
  { id: 'reviews-07', dataset: 'product_reviews', question: 'How many reviews were written in 2023?', referenceSql: 'SELECT count(*) AS n FROM product_reviews WHERE extract(year FROM "ReviewDate") = 2023', tags: ['filter', 'timeseries'] },
  { id: 'reviews-08', dataset: 'product_reviews', question: 'What is the distribution of ratings — how many reviews at each rating value?', referenceSql: 'SELECT "Rating", count(*) AS n FROM product_reviews GROUP BY "Rating" ORDER BY "Rating"', tags: ['groupby'] },
  { id: 'reviews-09', dataset: 'product_reviews', question: 'Which product has the most reviews? Show the product id and review count.', referenceSql: 'SELECT "ProductId", count(*) AS n FROM product_reviews GROUP BY "ProductId" ORDER BY n DESC LIMIT 1', tags: ['groupby', 'topn'] },
  { id: 'reviews-10', dataset: 'product_reviews', question: 'What is the earliest and latest review date?', referenceSql: 'SELECT min("ReviewDate") AS earliest, max("ReviewDate") AS latest FROM product_reviews', tags: ['aggregate', 'timeseries'] },

  // ── ecommerce (multi-table joins) ────────────────────────────────────
  { id: 'ecom-01', dataset: 'ecommerce', question: 'How many customers are there?', referenceSql: 'SELECT count(*) AS n FROM customers', tags: ['aggregate'] },
  { id: 'ecom-02', dataset: 'ecommerce', question: 'How many orders are there?', referenceSql: 'SELECT count(*) AS n FROM orders', tags: ['aggregate'] },
  { id: 'ecom-03', dataset: 'ecommerce', question: 'How many customers are there per country?', referenceSql: 'SELECT country, count(*) AS n FROM customers GROUP BY country ORDER BY country', tags: ['groupby'] },
  { id: 'ecom-04', dataset: 'ecommerce', question: 'How many orders have status "completed"?', referenceSql: "SELECT count(*) AS n FROM orders WHERE status = 'completed'", tags: ['filter'] },
  { id: 'ecom-05', dataset: 'ecommerce', question: 'What is the total revenue across all order items (quantity times unit price)?', referenceSql: 'SELECT round(sum(quantity * unit_price), 2) AS revenue FROM order_items', tags: ['aggregate', 'join'] },
  { id: 'ecom-06', dataset: 'ecommerce', question: 'Which product category has the highest total revenue?', referenceSql: 'SELECT p.category, round(sum(oi.quantity * oi.unit_price), 2) AS revenue FROM order_items oi JOIN products p ON oi.product_id = p.product_id GROUP BY p.category ORDER BY revenue DESC LIMIT 1', tags: ['join', 'groupby', 'topn'] },
  { id: 'ecom-07', dataset: 'ecommerce', question: 'How many orders has each customer placed? Show the top 5 customers by order count.', referenceSql: 'SELECT customer_id, count(*) AS n FROM orders GROUP BY customer_id ORDER BY n DESC LIMIT 5', tags: ['groupby', 'topn'] },
  { id: 'ecom-08', dataset: 'ecommerce', question: 'What is the total number of items sold per product category?', referenceSql: 'SELECT p.category, sum(oi.quantity) AS total_qty FROM order_items oi JOIN products p ON oi.product_id = p.product_id GROUP BY p.category ORDER BY p.category', tags: ['join', 'groupby'] },
  { id: 'ecom-09', dataset: 'ecommerce', question: 'List the names and emails of customers from the US.', referenceSql: "SELECT name, email FROM customers WHERE country = 'US'", tags: ['filter'] },
  { id: 'ecom-10', dataset: 'ecommerce', question: 'What is the average order value, counting only completed orders?', referenceSql: "SELECT round(avg(order_total), 2) AS avg_order_value FROM (SELECT o.order_id, sum(oi.quantity * oi.unit_price) AS order_total FROM orders o JOIN order_items oi ON o.order_id = oi.order_id WHERE o.status = 'completed' GROUP BY o.order_id) t", tags: ['join', 'aggregate'] },
  { id: 'ecom-11', dataset: 'ecommerce', question: 'How many distinct products have been ordered at least once?', referenceSql: 'SELECT count(DISTINCT product_id) AS n FROM order_items', tags: ['aggregate'] },
  { id: 'ecom-12', dataset: 'ecommerce', question: 'What is the most expensive product? Show its name and price.', referenceSql: 'SELECT name, unit_price FROM products ORDER BY unit_price DESC LIMIT 1', tags: ['topn'] },
];
