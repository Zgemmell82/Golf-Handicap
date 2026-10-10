# Golf Handicap Tracker

A static web app that tracks golf rounds and calculates a Handicap Index using World Handicap System rules.

- Score differential = (113 / slope) × (adjusted gross − course rating − PCC)
- Index = average of the best N differentials from your last 20 rounds (N per the WHS table, with the small-sample adjustments for 3–6 rounds), capped at 54.0
- Course handicap calculator (index × slope/113 + rating − par)
- Data is stored in your browser (localStorage); export/import as JSON

## Run

Open `index.html`, or serve the folder (`python3 -m http.server`). Deployed via GitHub Pages.

## Test

`node --test tests/handicap.test.js`
