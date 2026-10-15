// Works out the double dummy results for every deal and writes them to
// problems/dd.json, which the feedback screen shows under the deal.
// Usage: node scripts/dd.mjs
//
// The solver is DDS (github.com/dds-bridge/dds). The first run downloads
// it into vendor/ and compiles it with scripts/dd/dd-table.cpp, which
// takes a few seconds. Deals already in dd.json with the same hands are
// kept, so only new or changed deals are solved.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SEATS, STRAINS } from '../js/auction.js';

const root = new URL('..', import.meta.url).pathname;
const problemsDir = join(root, 'problems');
const outFile = join(problemsDir, 'dd.json');
const ddsDir = join(root, 'vendor/dds');
const solver = join(root, 'vendor/dd-table');
// The DDS version the tables were made with.
const DDS_COMMIT = '27f3720';

// DDS numbers seats N E S W, and vulnerability None, Both, NS, EW.
const DDS_VUL = { None: 0, All: 1, NS: 2, EW: 3 };
// DDS lists strains S H D C NT; we use STRAINS (C D H S N).
const DDS_STRAINS = ['S', 'H', 'D', 'C', 'N'];

function buildSolver() {
  if (!existsSync(ddsDir)) {
    console.log('Downloading DDS…');
    execFileSync('git', ['clone', 'https://github.com/dds-bridge/dds.git', ddsDir], { stdio: 'inherit' });
    execFileSync('git', ['-C', ddsDir, 'checkout', '--quiet', DDS_COMMIT], { stdio: 'inherit' });
  }
  console.log('Compiling DDS…');
  const sources = execFileSync('find', [join(ddsDir, 'library/src'), '-name', '*.cpp'], { encoding: 'utf8' })
    .trim().split('\n');
  execFileSync('c++', [
    '-std=c++20', '-O2', '-DNDEBUG', '-w', '-I', join(ddsDir, 'library/src'),
    ...sources, join(root, 'scripts/dd/dd-table.cpp'), '-o', solver,
  ], { stdio: 'inherit' });
}

// "N:<north> <east> <south> <west>", as DDS takes it.
const pbn = (deal) => `N:${SEATS.map((seat) => deal.hands[seat]).join(' ')}`;

const deals = readdirSync(problemsDir)
  .filter((file) => file.endsWith('.json') && file !== 'dd.json')
  .sort()
  .flatMap((file) => JSON.parse(readFileSync(join(problemsDir, file), 'utf8')).deals);

const old = existsSync(outFile) ? JSON.parse(readFileSync(outFile, 'utf8')) : {};
const todo = deals.filter((deal) => old[deal.id]?.hands !== pbn(deal));

const results = {};
if (todo.length) {
  if (!existsSync(solver)) buildSolver();
  const input = todo.map((deal) => `${SEATS.indexOf(deal.dealer)} ${DDS_VUL[deal.vul]} ${pbn(deal)}`).join('\n');
  const lines = execFileSync(solver, { input, encoding: 'utf8' }).trim().split('\n');
  todo.forEach((deal, i) => {
    const { tricks, par, contracts } = JSON.parse(lines[i]);
    const bySeat = Object.fromEntries(SEATS.map((seat, hand) => [
      seat,
      Object.fromEntries(STRAINS.map((strain) => [strain, tricks[DDS_STRAINS.indexOf(strain)][hand]])),
    ]));
    results[deal.id] = { hands: pbn(deal), tricks: bySeat, par: { score: par, contracts } };
  });
}

// Deals in the lesson files, in order. Deals no longer there are dropped.
const table = Object.fromEntries(deals.map((deal) => [deal.id, results[deal.id] ?? old[deal.id]]));
// Innermost objects and lists on one line, so the file stays readable.
const text = JSON.stringify(table, null, 2)
  .replace(/[{[][^{}[\]]*[}\]]/g, (inner) => inner.replace(/\s*\n\s*/g, ' ').replace(/\[ (.*) \]/, '[$1]'));
writeFileSync(outFile, `${text}\n`);
console.log(`Solved ${todo.length} deal${todo.length === 1 ? '' : 's'}; ${deals.length} in problems/dd.json.`);
