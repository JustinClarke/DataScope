# Palantir: Forward Deployed Software Engineer, International Government
## Round 1 prep · recruiter screen with Yasmin Al Nuaimi · 20-30 min

---

## 0. What this call actually is

Read the email again: *"walk through your experience and, most importantly, **who you are**
(well, as much as the interviewer can learn in 20-30 minutes). There'll be room at the end for
your questions."*

That's a recruiter screen, not a technical round. In 20-30 minutes she's deciding three things:

1. Can you tell a coherent story about yourself without rambling?
2. Is your interest in Palantir specific, or did you apply everywhere?
3. Are you SWE or FDSE shaped, and do the logistics work (mobility, visa, availability)?

She isn't going to interrogate your dbt medallion boundaries or ask how you'd scale to petabytes
air-gapped. Keep that loaded for the hiring manager round. Tonight, work on narrative and
motivation.

> The most common way people fail this stage isn't technical. It's giving a generic answer to
> "why Palantir." Strong engineers get cut here for it.

---

## 1. The 90-second opener: "tell me about yourself"

Say this out loud three times before the call and time it. If it runs past 100 seconds, cut the
VNS paragraph.

> "I'm a software engineer based in Dubai. I build data-heavy products end to end, front end
> through to the data layer.
>
> I started as the sole engineer at LiteStore, a multi-tenant retail platform in India. Eleven
> brands across three mall locations, and I owned all of it: the architecture, the client
> relationship, deployment, the handover. I led the migration to Next.js and took average page
> load from three seconds down to about six hundred milliseconds. The platform did around 2.2
> crore in GMV across tenants.
>
> Then I did analytics consulting at VNS in London, embedded with eight to ten clients on the
> Microsoft Fabric stack. A lot of that job was translating vague reporting requests into
> something that actually reconciled against the source data.
>
> Since then I've been building two things. Off The Pace is an F1 analytics platform: a dbt
> warehouse of 60 models with 443 enforced data-quality tests, 5 ML models exported to ONNX, and
> a React front end that runs the SQL in the browser with no server at all. And DataScope, which
> is a browser-native analytics workspace where the whole engine runs client-side. Nothing gets
> uploaded, and with AI switched off it makes zero network requests after load.
>
> The thread through all of it is that I like owning a problem from the messy input all the way
> to the thing someone actually uses. And I care a lot about whether the system is *correct*, not
> just whether it runs."

If you'd rather open on current work than walk chronologically, swap the LiteStore paragraph to
the end and start with: "Right now I'm splitting time between two things, a browser-native
analytics workspace I'm building solo and a community security platform I'm building for a
client."

The shape works because it's chronological, every claim has a number attached, and the last line
is a values statement that sets up everything else you want to say.

---

## 2. "Why Palantir? Why FDSE? Why international government?"

Three separate questions. Answer all three, because this is what decides tomorrow.

### Why FDSE and not SWE

This is your strongest honest answer, because you've actually done the job:

> "Because the shape of it is what I've already been doing, just without the scale. At LiteStore
> I was one person sitting between a client who described what they wanted in business terms and
> a system that had to actually deliver it. VNS was the same thing across ten clients. The hard
> part was never the SQL, it was working out what the stakeholder actually meant.
>
> A pure SWE role would take the half of that I find least interesting and give me more of it. I
> want the part where you're in the room with the person whose problem it is."

### Why international government

Don't perform a geopolitical position you don't hold. She's heard the rehearsed version hundreds
of times and it's obvious. Say something true instead. Three options, pick whichever is actually
yours:

**The consequence angle.** "The dashboards I built at VNS changed a retail client's Tuesday. I
want to work where the output actually matters, where somebody makes a real decision on it."

**The regional angle**, which you should use because you live here. "I'm based in Dubai and I've
worked across India, the UK and the UAE. Government software in this region is being built out
right now rather than maintained. I'd rather be somewhere that's building capability than
somewhere optimising something that already exists."

**The hard-problem angle.** "Government data is the messiest version of the problem. Legacy
systems, no clean schema, and real constraints on where compute is even allowed to run. That's
where the engineering gets genuinely hard. DataScope came out of that instinct. I built it so the
entire engine runs on the client and nothing leaves the machine, because the interesting
constraint to me is 'what if you can't send this anywhere.'"

The third one is your best card. It connects something you actually built to the constraint their
government clients live under. Lead with it, then add the regional angle.

### If she pushes on ethics

She might. Palantir is direct about this and expects you to be too. Don't dodge it and don't
over-affirm it. Honest and composed beats enthusiastic:

> "I've read the criticism and I don't think it's stupid. My position is that this software gets
> built either way, and I'd rather it's built by people who are being asked hard questions about
> it than by people who aren't. If I'm going to work on it, I want to understand the deployment
> I'm on. And I'd rather be somewhere that argues about this openly than somewhere that pretends
> the question doesn't exist."

Then stop talking and let her respond.

---

## 3. Your six anecdotes

Pick by what she asks. Don't recite all of them.

### A. Sole ownership under a real client: LiteStore
> Sole engineer, 11 retail brands, 3 mall locations. Owned frontend architecture, multi-tenant
> theming, the analytics, client comms, branding decisions, Workspace admin and deployment. Led
> the CRA to Next.js 12 migration around statically pre-rendered routes, taking load from 3.0s to
> 0.6s. Built the multi-tenant system on a central Tailwind config with per-tenant design tokens,
> which supported a 48-hour full brand transition with no forked stylesheets. Platform did Rs 2.2
> Cr+ GMV. Then documented the architecture and recruited and onboarded my own successor.

Use this for ownership, ambiguity, client-facing work, or "tell me about something you're proud
of." The successor detail is the one that makes interviewers sit up, because it says you think
past your own tenure.

### B. Stakeholder translation: VNS Solutions
> Eight to ten clients across retail, F&B and e-commerce. 12+ Power BI dashboards, roughly 12
> hours a week of manual work removed. Cut refresh times from about 45 minutes to about 20 on
> multi-million-row datasets. Plus a lot of manual reconciliation, comparing dashboard output back
> against raw source, because a dashboard nobody trusts is worth nothing.

Use this for non-technical stakeholders, requirements gathering, or data trust.

### C. Catching yourself being wrong: the Off The Pace leakage audit
> "The model was going to look good and be lying, so I built two gates into CI. One is a static
> audit where sqlglot parses the compiled SQL and checks that nothing forward-looking crosses into
> the training set. The other is adversarial: I train a probe to recover the race year from the
> feature set, and it hits 0.9999, which *proves* that feature would leak if I left it in. Both
> gates block the build."

Use this for rigour, intellectual honesty, or "how do you know your work is right." It's your best
pure-engineering story because it's about distrusting your own output, which is the trait FDSE
work actually needs.

### D. Correctness as a hard gate: the Off The Pace decomposition
> "Every lap gets decomposed into seven additive components: fuel, tyre compound, track rubber,
> ambient conditions, constructor, dirty air and driver skill. The invariant is that those seven
> terms have to reconstruct the actual lap time to within 0.0001 seconds or CI fails the build.
> The observed residual is about 1.4e-14, which is machine precision. The point isn't the number.
> It's that the model can't silently drift, because 'the parts must sum to the whole' is enforced
> rather than assumed."

Use this for system design instinct or "walk me through a technical decision." It's also literally
decomposition, which is the near-universal onsite round later, so planting it now helps.

### E. Building for the constraint: DataScope
> "It's an analytics workspace where you drop a folder of files into the browser and it tells you
> what you've actually been handed: what tables exist, what the columns mean, how they relate,
> what's broken. The whole engine is DuckDB-Wasm running in a web worker. Nothing is uploaded.
> With AI off it makes no network requests at all after load and you can verify that in DevTools.
> The production build is a folder of static files, so it runs off a disk with the cable
> unplugged. AI is three modes: fully off, a local model via WebLLM on WebGPU, or an API mode, and
> the deterministic modules still work in every one of them."

Use this for "what are you working on now", air-gapped or secure environments, and
privacy-by-design. It's your single most relevant project to International Government, so say that
out loud rather than hoping she infers it.

### F. Building for users who aren't like you: SecureNest
> "I'm building a community security platform for a client. Mobile-first, React Native on iOS and
> Android, targeting residential communities of 50 to 200 units. The interesting part isn't the
> stack, it's that there are three completely different user types on three different surfaces: an
> admin cockpit on web, a resident app, and a gate guard app.
>
> The gate guard drove most of the design. That's someone standing at a physical gate, on a cheap
> phone, with unreliable connectivity, under time pressure, who didn't sign up to learn software.
> So the guard app logs in with a PIN rather than an OTP flow. There's an offline strategy because
> the network genuinely drops. And it's multi-tenant underneath, because one facilities-management
> company runs several communities.
>
> Building for the guard is a completely different discipline from building for the admin. If the
> guard app is even slightly annoying at 7am it doesn't get used, and then none of the data
> downstream is real."

Use this for building for non-technical users, stakeholder empathy, multi-role systems, or the
friction question in §4. It's arguably your best FDSE-fit story: real client work with commercial
intent, and the gate guard is exactly the FDE user profile, someone with low technical literacy
working under pressure in a constrained environment where adoption decides everything.

> **Framing note.** Call this client work, not a side project. "I'm building it for a client who's
> backing it commercially" is a much stronger signal than "I made a thing." Don't volunteer that
> the client is your uncle unless she asks directly. If she does, say it plainly, it isn't a
> problem. What matters is that someone with money on the line picked you to build it.

---

## 4. The friction question, and the most likely behavioural probe

*"You deploy something and a senior official rejects it because it contradicts a report they've
trusted for a decade. They want your tool out. What do you do?"*

The trap is defending the maths. If you reach for "well, the model is correct" you've failed the
round.

> "First I'd assume they might be right, because a decade-old report usually encodes something
> real that isn't in my data. So I wouldn't start by defending the number.
>
> What I'd actually do is audit their legacy report with them. Map its metric definitions into my
> data layer and find exactly where the two diverge, because it's almost always a definition
> mismatch rather than a maths error. A different date boundary, a different exclusion rule, a
> different denominator. Then I can show them the specific line where the two disagree and let
> them tell me which definition is correct operationally. Often theirs is.
>
> The other half of it is that they don't trust a black box, and they're right not to. So the tool
> has to show its work: where a number came from, what it excluded, how confident it is. That's a
> principle I actually build to. In DataScope, inferred relationships between tables get labelled
> with their evidence and confidence rather than asserted as fact, and the natural-language-to-SQL
> path emits a full trace you can inspect. Same instinct.
>
> The goal isn't winning the argument. It's that the tool makes them better at the job they
> already know how to do."

I'd have this one close to memorised. It's the highest-probability question in the call and it's
where this role gets decided.

---

## 5. Logistics she will ask about

| Topic | Your answer |
| :--- | :--- |
| Location | Dubai, UAE |
| Work authorisation | UAE Family Residence Visa, no sponsorship required |
| Availability to start | Immediately |
| Mobility | Decide this tonight. FDSE International Government means travel and possibly extended time on client sites. Know your real answer to "could you be based outside the UAE for weeks at a time." Don't say yes if it's no. |
| Interview availability | Give the widest window you can, since she said more availability moves faster. Have your calendar open when you take the call. |
| Restricted regions | The email lists regions you can't be in during the interview window. You're in Dubai, so it doesn't apply and you don't need to raise it. |
| Security screening | International Government roles often involve background checks or nationality-based eligibility. If she raises it, answer plainly and briefly without over-explaining. |

---

## 6. Your questions for her

Ask two or three. She's on a schedule.

1. "Is this scoped as FDSE specifically, or does the SWE/FDSE split get decided later in the
   loop?" Practical, and it shows you know the two are different.
2. "What does a typical International Government engagement look like day to day? Are FDSEs
   embedded on client site, or working from a regional hub?" This is the mobility question asked
   from your side, and the answer is genuinely useful to you.
3. "What does the rest of the process look like, and what timeline are you working to?" Always
   ask. It also tells you how much runway you have to prep the technical rounds.

If there's room and you actually want to know: "What separates the FDSEs who do well in this
vertical from the ones who struggle?" Recruiters usually have a real answer to that one.

---

## 7. Traps, to read last before the call

**Don't use words you didn't earn.** Say "a dbt warehouse with enforced data-quality tests," not
"a sparse telemetry state-space pipeline." If you use a term you have to be able to define it
cold, because recruiters pass your phrasing to engineers verbatim.

**Don't oversell how finished DataScope is.** It has real gaps you documented yourself: export,
the Studio arc, the ML modules. If she asks what isn't done, say so. "Here's what works, here's
what's still open" reads as senior. Claiming it's finished reads as junior.

**Don't lead with Off The Pace when the question is about fit.** LiteStore and SecureNest are the
FDSE-shaped stories, with real stakeholders and real adoption risk. Off The Pace and DataScope are
the depth stories. Match the story to the question.

**Don't perform conviction about geopolitics.** Composed and honest beats rehearsed and emphatic
every time.

**Know your own number discrepancy.** Your resume.yaml says 168 races ingested and 147 fully
processed; the Off The Pace README says 149. If you cite a race count, say "around 150 races
processed" rather than a precise figure you can't defend. 137,447 laps, 60 dbt models, 443 tests
and 5 ML models are all solid, so lean on those.

**Silence is fine.** Two seconds of thinking after a hard question reads as considered. Rushing to
fill it reads as anxious.

---

## Appendix, for later rounds

Not needed for a 20-minute screen. Skim once, don't rehearse.

**Onsite structure.** Roughly three 60-minute rounds pulled from Decomposition, Re-engineering,
Coding, Learning and System Design. Decomposition is near-universal, and Off The Pace's seven-term
additive model and seven-stage CI pipeline are both natural material for it. The technical screen
before that is CodePair or Karat, or HackerRank (coding, SQL, sometimes an API task, around 90
minutes), with practical problems rather than LeetCode puzzles. The final round is the hiring
manager: deep project dive plus values.

**If air-gapped or sovereign-cloud scaling comes up.** Your honest position is that DataScope's
client-side ceiling is real. It warns at 50MB, samples at 100MB, and refuses above 300MB with
guidance rather than hanging the tab. That refusal is a design decision, not a limitation you're
hiding. Scaling past it without egress means on-prem or sovereign-cloud compute with local
indexing and tiered storage. Say that as reasoning, not as something you've done, because you
haven't, and claiming otherwise is the fastest way to lose a technical interviewer.

**Portfolio depth if they want more range.** The MSc recommendation engine (cold-start solved via
hierarchical similarity, 1M-row dataset in under 200MB), the SQL Disaster Response System
(11-entity MySQL schema with CHECK constraints enforcing occupancy ≤ capacity at the schema level,
relevant if relational modelling comes up), and the HR Archetype tool. One-liners only, none of
these need prep time.

---

## Sample run-through

A full mock of the call, start to finish, using the scripted answers above. Read it once for
pacing, then practice answering cold rather than reading it back.

**Yasmin:** "Hi Justin, thanks so much for making time today. This should be pretty relaxed. I
mainly want to get a sense of your background and what's brought you to Palantir. Walk me through
your experience, and tell me a bit about yourself?"

**Justin:** "I'm a software engineer based in Dubai. I build data-heavy products end to end, front
end through to the data layer.

I started as the sole engineer at LiteStore, a multi-tenant retail platform in India. Eleven
brands across three mall locations, and I owned all of it: the architecture, the client
relationship, deployment, the handover. I led the migration to Next.js and took average page load
from three seconds down to about six hundred milliseconds. The platform did around 2.2 crore in
GMV across tenants.

Then I did analytics consulting at VNS in London, embedded with eight to ten clients on the
Microsoft Fabric stack. A lot of that job was translating vague reporting requests into something
that actually reconciled against the source data.

Since then I've been building two things. Off The Pace is an F1 analytics platform, a dbt
warehouse of 60 models with 443 enforced data-quality tests, 5 ML models exported to ONNX, and a
React front end that runs the SQL in the browser with no server at all. And DataScope, a
browser-native analytics workspace where the whole engine runs client-side, nothing uploaded, zero
network requests once AI's off.

The thread through all of it is that I like owning a problem from the messy input all the way to
the thing someone actually uses, and I care a lot about whether the system is correct, not just
whether it runs."

**Yasmin:** "That's a great range, thank you. So, why Palantir specifically? And I'd love to
understand whether you see yourself as more SWE or FDSE."

**Justin:** "FDSE, and it's because the shape of the job is what I've already been doing, just
without the scale. At LiteStore I was one person sitting between a client who described what they
wanted in business terms and a system that had to actually deliver it. VNS was the same thing
across ten clients. The hard part was never the SQL, it was working out what the stakeholder
actually meant.

A pure SWE role would take the half of that I find least interesting and give me more of it. I
want the part where you're in the room with the person whose problem it is."

**Yasmin:** "Makes sense. And why International Government specifically, rather than, say, our
commercial side?"

**Justin:** "Government data is the messiest version of the problem. Legacy systems, no clean
schema, real constraints on where compute is even allowed to run. That's where the engineering
gets genuinely hard. DataScope actually came out of that instinct. I built it so the entire engine
runs on the client and nothing leaves the machine, because the interesting constraint to me is
'what if you can't send this anywhere.' As I understand it, that's close to what Apollo has to
solve to get Gotham running inside disconnected government environments, just at a completely
different scale. I'd rather be working on that problem than a version of it that assumes the
network's always there.

And I'm based in Dubai, I've worked across India, the UK and the UAE. Government software in this
region is being built out right now rather than maintained, and I'd rather be somewhere building
capability than somewhere optimising something that already exists."

*(Naming Gotham and Apollo here does two things: it proves this wasn't a copy-paste application,
and it hands her a specific, quotable line for her notes rather than a vague mission statement.
Only use this if you'd actually recognise the names if she asks a follow-up. Don't reach past what
you read on the products page.)*

**Yasmin:** "I appreciate that. I'll be direct, since we get this a lot. Palantir takes a fairly
public, non-neutral position on this kind of work. How do you think about that personally?"

**Justin:** "I've read the criticism and I don't think it's stupid. My position is that this
software gets built either way, and I'd rather it's built by people who are being asked hard
questions about it than by people who aren't. If I'm going to work on it, I want to understand the
deployment I'm on. And I'd rather be somewhere that argues about this openly than somewhere that
pretends the question doesn't exist."

**Yasmin:** *(pause)* "Fair enough. Let's talk about something concrete. Is there a project or
moment you're especially proud of?"

**Justin:** "Sole engineer, 11 retail brands, 3 mall locations at LiteStore. I owned frontend
architecture, multi-tenant theming, the analytics, client comms, branding decisions, deployment,
all of it. Led the CRA to Next.js 12 migration, took load from 3.0 seconds to 0.6. Built the
multi-tenant system on a shared Tailwind config with per-tenant tokens, which supported a 48-hour
full brand transition with no forked stylesheets.

But the thing I'm actually proudest of is that before I left, I documented the whole architecture
and recruited and onboarded my own successor. I think that says more about how I work than the
migration number does."

**Yasmin:** "That's a good detail, most people don't think about that part. One more. Imagine
you've deployed something, and a senior official rejects your dashboard because it contradicts a
report they've trusted for a decade. They're frustrated, they want it out. What do you do?"

**Justin:** "First I'd assume they might be right, because a decade-old report usually encodes
something real that isn't in my data. So I wouldn't start by defending the number.

What I'd actually do is audit their legacy report with them, map its metric definitions into my
data layer, and find exactly where the two diverge. It's almost always a definition mismatch
rather than a maths error, a different date boundary, a different exclusion rule. Then I show them
the specific line where they disagree and let them tell me which definition is correct
operationally. Often theirs is.

The other half is that they don't trust a black box, and they're right not to. So the tool has to
show its work. That's a principle I actually build to. In DataScope, inferred relationships
between tables are labelled with their evidence and confidence rather than asserted as fact. Same
instinct here. The goal isn't winning the argument, it's making them better at the job they already
know how to do."

**Yasmin:** "Good answer. Okay, quick logistics. You're in Dubai, work authorisation sorted?"

**Justin:** "UAE Family Residence Visa, no sponsorship needed, available immediately."

**Yasmin:** "Perfect. And International Government roles can involve travel, sometimes extended
time on client sites. How do you feel about that?"

**Justin:** "Fully open. I don't have constraints that would keep me tied to one location. I'm
happy to be on client sites for extended stretches if that's what the engagement needs."

**Yasmin:** "Great, that's useful to know. I think that's most of what I needed. Do you have any
questions for me?"

**Justin:** "A couple. First, is this role scoped as FDSE specifically, or does the SWE/FDSE split
get decided later in the loop?"

**Yasmin:** "For International Government it's usually scoped fairly early, and based on what
you've said today I think FDSE is the right track, but the panel makes the final call."

**Justin:** "Good to know. Second, what does a typical International Government engagement look
like day to day? Are FDSEs embedded on client site, or working from a regional hub?"

**Yasmin:** "It varies by engagement, but for this region it's often a mix, some hub time, some
client-site time, and it can shift depending on the deployment phase. I can put you in touch with
someone closer to the work if that'd help later in the process."

**Justin:** "That'd be great, thanks. Last one, and it's the one I'm actually most curious about:
what separates the FDSEs who do well in this vertical from the ones who struggle?"

*(This question is doing real work. Recruiters answer dozens of "what's the process/timeline"
questions a day on autopilot; this one asks for her opinion, and people remember being asked for
their opinion more than they remember what you said about yourself. It also signals you're
thinking past getting the offer to actually succeeding in the role, which reads as senior.)*

**Yasmin:** "Honestly, the ones who struggle usually treat it like a pure engineering job and get
frustrated when the client moves slower or asks for something that doesn't make technical sense on
paper. The ones who do well are curious about the client's world, not just the data model, they
adapt without needing everything spelled out, and they can hold a room without over-explaining. It
sounds like you've already had to do a version of that."

**Justin:** "That tracks with what I liked most about the client-facing work I've done, so that's
good to hear."

**Yasmin:** "That's what I needed today, and this has been one of the stronger conversations I've
had this week. What does the rest of the process look like, is what you're probably wondering,
so: after this we'd move you to a technical screen, then an onsite loop of a few rounds, then a
final hiring manager conversation. We're moving quickly on this req, so realistically three to
four weeks end to end if things go well. I'll follow up by email either way."

**Justin:** "Perfect, thank you, I really appreciate the time today."

**Yasmin:** "Thanks Justin, talk soon."

---

**What's doing the work in that close:** the last question wasn't logistics, it was a real question
she likely enjoyed answering, and Justin's reply to her answer was short and let her keep talking
rather than pivoting back to himself. The strongest note in her write-up ends up being her own
words about what good FDSEs do, with Justin quietly agreeing, not a closing pitch from him. That's
the whole technique: the more of the conversation that ends up being things *she* said and
believes, the more convincing the call is on rereading her own notes later.

---

*Prep doc, untracked. Add it to `.gitignore` or move it out of the repo before you commit.*
