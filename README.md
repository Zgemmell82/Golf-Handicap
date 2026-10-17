# Promise Tracker

A mobile-first web app (installable PWA) that shows whether elected officials kept their promises, with the evidence and sources behind every rating.

**Status: working prototype running on a FICTIONAL sample dataset.** Every official, promise, vote and dollar amount in `data/` is invented (see `scripts/make-sample.mjs`) and the app shows a banner saying so. Real data comes from the pipeline below.

## What's in it
- State onboarding (50 states, DC, territories) with optional ZIP to find your House district; a ZIP spanning several districts asks for a street address (Census geocoder)
- "Your Representatives" home with scorecards, browse-any-state tile map, state pages (delegation scorecard, members, recent votes)
- Official profiles: promises with expandable evidence cards and "How we rated this", votes, campaign money with rule-based "possible conflict" flags, contact and committees
- Directory with search and filters (party, chamber, committee, issue, promise status), compare-two-officials, favorites, and an in-app alerts feed
- Methodology page with a live party bias check

## Rules (all in `js/core.js`, same for every official)
- "Kept" or "Broken" needs 2 independent sources (different outlets); otherwise it is shown as Unverifiable with the reason
- Confidence High/Medium/Low from source count, primary-record presence and reliability; contested ratings are capped until sources span the spectrum
- Conflict flag only when a promise names an industry and filings show at least $25,000 and 5% of receipts from it; wording is neutral
- `scripts/validate-data.mjs` rejects data with missing sources or loaded language ("lied", "betrayed", ...)

## Data model
`data/*.json`: `officials` (chamber field supports house/senate/governor/state/local), `promises`, `votes`, `finance`, `sources` (reliability + lean ratings), `categories`, `zip`, `meta`.

## Run / test
```
python3 -m http.server   # then open http://localhost:8000
node --test tests/*.test.js
node scripts/validate-data.mjs
```

## Real data pipeline (next steps)
Needs free keys from api.data.gov for Congress.gov and OpenFEC, stored as GitHub secrets. Planned scripts: roster (unitedstates/congress-legislators), ZIP-to-district (Census), votes (Congress.gov / Voteview), finance (OpenFEC). Promises are researched with required source links and human review; they are not auto-published.
