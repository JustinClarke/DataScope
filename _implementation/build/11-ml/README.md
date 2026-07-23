# 11 — ML Modules

**Tier:** backlog — designed, deferred (D1) · **Design:** §20.1 · **Depends on:** the core
tool working (post-Studio; §19 backlog item 1). Broker capability flags already exist
dormant (§9).

All ML runs **in-browser** (ml.js + Transformers.js), trained on DuckDB query results, in a
**dedicated ML Web Worker** (`src/workers/ml.worker.ts`, §16) with cancel button and 30 s
hard timeout (§17).

## Designed modules (§20.1)

- **K-Means Clustering** (`ml-kmeans`) — requires 2+ Quantitative. X/Y feature dropdowns,
  k slider (2–8). Animated scatter with step-by-step centroid movement to convergence;
  elbow chart (inertia for k=2..8). Educational panel: the assign/recompute loop.
- **Linear & Polynomial Regression** (`ml-regression`) — requires 2+ Quantitative. Linear
  vs polynomial (degree 2–3); fitted line/curve, equation display, R² gauge, residual plot.
  Educational panel: R² and least squares.
- **Decision Tree Classifier** (`ml-cart`) — requires Categorical target + features.
  Max-depth (2–10) and min-samples-per-leaf sliders; interactive D3/SVG tree (split
  condition, sample count, class distribution, Gini per node), hover-to-highlight data
  flow, confusion matrix, accuracy badge. Educational panel: Gini impurity and overfitting
  (train vs test).
- **Zero-Shot Text Classification** (`@xenova/transformers`, quantized BART/MobileBERT in
  the worker) — requires 1+ Textual. Custom labels, sample size (10/50/100 rows);
  prediction table with confidence, label distribution, per-label word cloud, latency
  metrics. **On-demand model download (~30–80MB) with explicit consent**, progress bar,
  aggressive caching, "Skip NLP" option. Educational panel: zero-shot classification.

## Performance targets (§20.1)

K-Means (10K rows, 5 features) < 2 s; regression fit (10K rows) < 500 ms; tree training
(10K rows, 5 features) < 3 s; K-Means animation > 30 fps under 5K points.

## Revival checklist

Re-verify ml.js/Transformers.js library state (the §20.1 survey is a 2026-07 snapshot);
expand this README into per-module leaf docs mirroring the issue shape; wire the dormant
broker flags to real modules; add the ML worker with cancel/timeout before any training UI.
