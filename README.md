# Golf Handicap Tracker

A static web app that tracks golf rounds and calculates a Handicap Index using World Handicap System rules.

- Score differential = (113 / slope) × (adjusted gross − course rating − PCC)
- Index = average of the best N differentials from your last 20 rounds (N per the WHS table, with the small-sample adjustments for 3–6 rounds), capped at 54.0
- 9-hole rounds supported: pairs of 9-hole differentials are combined into one 18-hole differential; an unpaired 9-hole round uses an expected differential (0.52 × index + 1.2) for the other nine. Enter 9-hole rating and slope for 9-hole rounds.
- Enter just a total score, or optionally hole-by-hole (summed for you)
- Import past rounds from a CSV file or pasted spreadsheet rows (columns auto-matched; duplicates skipped)
- Course handicap calculator (index × slope/113 + rating − par)
- Data is stored in your browser (localStorage); export/import as JSON

## Run

Open `index.html`, or serve the folder (`python3 -m http.server`). Deployed via GitHub Pages.

## Test

`node --test tests/*.test.js`
