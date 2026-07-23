# Analyst Discovery Guidance

**Scope:** product positioning / audience validation note
**Where it belongs:** `_implementation/product/` alongside strategy and competitive-landscape docs.

## Recommendation

Do not cold-message a large batch of analysts to learn the whole job market. Instead, run a small, structured discovery pass with 5–8 people:

- 1 privacy-constrained data worker
- 1–2 SQL-competent analysts
- 1–2 business analysts who avoid SQL
- 1–2 people who inherit data from others and have to make sense of it

This is enough to surface the real workflow friction without spending time on broad, low-signal outreach.

## What to ask

Ask only about the first 10 minutes of the workflow when a new dataset lands:

1. What is the first thing you do when a new export or folder shows up?
2. Where do you get stuck most often?
3. What do you need to produce next: a chart, a summary, a deck, a SQL query, or a report?
4. What makes a tool trustworthy enough to become part of your day-to-day workflow?

## Product implication

The right wedge is not “build an AI analyst for everyone.”

The wedge is narrower and more defensible:

- drop files or folders
- understand structure fast
- answer the “what have I been handed?” question immediately
- produce a no-SQL or guided result path
- export the result for a deck, spreadsheet, or follow-up workflow

That aligns with the existing product identity in the repo: DataScope is a browser-native analytics IDE for understanding data structure, not a generic chat-with-CSV tool.

## Bottom line

Yes, the project is worth building.

But the best next step is not a mass outreach campaign. It is a small interview loop that validates the orientation-tax pain, the no-SQL analyst path, and the privacy-first framing before the product is tailored further.
