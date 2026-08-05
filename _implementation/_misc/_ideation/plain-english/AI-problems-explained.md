# What DataScope is trying to do

You drop in a data file — a spreadsheet, basically. The app looks at it and tells you what you've got: "this looks like an online-store dataset, about 10,000 customers and 45,000 orders, spanning 2021 to 2024, and it's good for working out customer lifetime value or churn."

Writing that sentence is the AI's only job. Everything else in the app is ordinary code doing ordinary counting.

---

## Problem 1: it makes things up, and it's very good at it

Not obvious gibberish. Three real examples we caught, all of which look completely professional:

- **Right number, wrong subject.** It wrote "fares for *survivors* averaged 1.6 standard deviations higher." The actual statistic was about ticket *class*, not survival. Real number, real column names, wrong thing attached to it.
- **Detail invented from nothing.** It wrote "5 years of daily weather data in *Manchester*." The city name was never sent to the AI — the app deliberately doesn't transmit the contents of cells. The real city was Springfield, and it was about 10 years, not 5.
- **Knowledge smuggled in from outside.** It wrote "the Titanic, which sank in April 1912." There is no date column anywhere in that file. It just remembered that from having read the internet.

---

## Problem 2: it isn't consistent, so testing is hard

Same file, same session, same question: it produced the 1912 line once, and the next time correctly said "not stated in the data." So a single clean test proves nothing. Everything has to be run five or more times before a result counts, which makes every experiment slow.

---

## Problem 3: it isn't a matter of picking a better AI

That's the tempting fix, and we've now ruled it out. The same three failures showed up on three different AI models, on three different ways of running them, from a small model on a machine in the house up to Google's newest. It's a flaw in how we're *asking*, not in which brain we asked.

---

## Problem 4: our safety checks check the wrong thing

We built two automatic checkers. One confirms the AI didn't alter any of the numbers. The other bans certain overconfident words like "proves" or "always."

Neither has any idea whether the sentence still *describes* the number it's stapled to. It's like a proofreader who verifies your spelling and that you filled in every box, but has no opinion on whether anything you wrote is true. That gap is the whole project.

---

## Problem 5: even when we force it to show its work, it fails a lot

The current best idea: make the AI cite, for every sentence, which specific computed number that sentence came from. Then code checks the citation.

At the model size we could realistically ship, **about 29% of the AI's sentences fail that check.** Google's big expensive model gets it right 91.5% of the time — but that's not the one that would run in the product. So we're left choosing between showing users roughly a third ungrounded text, or throwing out the failures and showing a visibly patchy, gappy panel.

---

## Problem 6: the failure that looks like success

This is the one I'd lose sleep over. On the largest test file, the AI produced perfectly well-formed, valid-looking output five times out of five — and **not one single claim in any of them was traceable to a real fact.** The headings it produced were: raw Chinese column names, the literal word "stock_prices", a guess at a company name, and an invented "Crypto Market Data for Ethereum."

Every automated health check on that run reported green, because "well-formed" and "true" are different tests and we'd only been running the first one. A shipped product could be 100% valid and 0% correct at precisely the big-file case the product exists for.

---

## Problem 7: you can't hide the data from it

To test whether the AI was actually *reading* the file or just *remembering* something famous, we stripped out all the names and values and sent only anonymous shape information — how many rows, how many distinct values per column. No actual data at all.

It identified the file as the well-known Titanic dataset **10 times out of 10, with high confidence**, reasoning: "891 rows is the exact row count of the standard Titanic training file." So the anonymisation doesn't anonymise, and the reading-versus-remembering question is harder to answer than we'd hoped.

---

## Problem 8: when the AI breaks, it lies about breaking

If the AI service fails or we hit our usage limit, the server responds "success" and quietly returns the original non-AI text. So "the AI is down" and "the AI read it and had nothing to add" are literally indistinguishable — to the app, and to our own testing tools. An early test scored 0% and couldn't tell us why. That one's a plain bug and needs fixing regardless of everything above.

---

## One honest correction, since it cuts the other way

Our scariest number was "254 cases where the AI got the counts or dates wrong." Turned out **248 of those 254 were a bug in our own grading script** — it couldn't recognise a date written as `2023-01-01`. The real count was 6, and all 6 are mild rounding ("23 months" called "2 years"), not wrong facts. Worth saying out loud: some of the AI's rap sheet was our own measurement error, and we only found it because someone went back and re-checked.

---

## Where it's actually heading

Two ideas are winning, and neither is "get a better AI":

1. **Stop asking for one paragraph.** Split the summary into slots and let each slot be filled by whoever can be trusted with it. Counts and date ranges get written by plain code — those literally cannot be wrong. Only the interpretive bits go to the AI, each sentence forced to cite its source number.
2. **Offer instead of assert.** Rather than the AI claiming "sales are seasonal," it offers a button: *"check whether sales are seasonal"* — which runs a real query against the real data. A question can't be a lie. This may dissolve most of the problem rather than solving it.

And the thing every AI approach has to beat: boring templated text with no AI involved at all. It's bland, it says less — and it cannot fabricate. If the AI can't clearly beat that, the answer is to ship the boring one. "The AI is invisible" is not a good reason to ship an AI that makes things up.
