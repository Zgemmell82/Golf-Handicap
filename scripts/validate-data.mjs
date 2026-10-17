// Fails (exit 1) if the dataset breaks the rules in js/core.js validateData().
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const Core = createRequire(import.meta.url)('../js/core.js');
const dir = process.argv[2] ? process.argv[2].replace(/\/?$/, '/') : new URL('../data/', import.meta.url).pathname;
const load = (n) => JSON.parse(readFileSync(dir + n + '.json', 'utf8'));
const d = { officials: load('officials'), promises: load('promises'), votes: load('votes'), sources: load('sources'), categories: load('categories') };
const errors = Core.validateData(d);
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`OK: ${d.officials.length} officials, ${d.promises.length} promises, ${d.votes.length} votes`);
