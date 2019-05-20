import {Data, ID, toID} from 'ps';

import {Outcome} from './parser';
import {MetagameStatistics, Statistics, Usage} from './stats';
import * as util from './util';

const PRECISION = 1e10;

interface MovesetStatistics {
  'Raw count': number;
  'usage': number;
  'Viability Ceiling': [number, number, number, number];
  'Abilities': {[key: string]: number};
  'Items': {[key: string]: number};
  'Spreads': {[key: string]: number};
  'Happiness': {[key: string]: number};
  'Moves': {[key: string]: number};
  'Teammates': {[key: string]: number};
  'Checks and Counters': {[key: string]: EncounterStatistics};
}

interface EncounterStatistics {
  koed: number;
  switched: number;
  n: number;
  p: number;
  d: number;
  score: number;
}

export const Reports = new class {
  usageReport(format: ID, stats: Statistics, battles: number) {
    const sorted = Array.from(stats.pokemon.entries());
    if (['challengecup1v1', '1v1'].includes(format)) {
      sorted.sort((a, b) => b[1].usage.real - a[1].usage.real || a[0].localeCompare(b[0]));
    } else {
      sorted.sort((a, b) => b[1].usage.weighted - a[1].usage.weighted || a[0].localeCompare(b[0]));
    }

    let s = ` Total battles: ${battles}\n`;
    const avg = battles ? Math.round((stats.usage.weighted / battles / 12) * 1e3) / 1e3 : 0;
    const avgd = avg === Math.floor(avg) ? `${avg.toFixed(1)}` : `${avg}`;
    s += ` Avg. weight/team: ${avgd}\n`;
    s += ` + ---- + ------------------ + --------- + ------ + ------- + ------ + ------- + \n`;
    s += ` | Rank | Pokemon            | Usage %   | Raw    | %       | Real   | %       | \n`;
    s += ` + ---- + ------------------ + --------- + ------ + ------- + ------ + ------- + \n`;

    const total = {
      raw: Math.max(1.0, stats.usage.raw),
      real: Math.max(1.0, stats.usage.real),
      weighted: Math.max(1.0, stats.usage.weighted),
    };

    for (const [i, entry] of sorted.entries()) {
      const species = entry[0];
      const usage = entry[1].usage;
      if (usage.raw === 0) break;

      const rank = (i + 1).toFixed().padEnd(4);
      const poke = util.getSpecies(species, format).species.padEnd(18);
      const use = (100 * usage.weighted / total.weighted * 6).toFixed(5).padStart(8);
      const raw = usage.raw.toFixed().padEnd(6);
      const rawp = (100 * usage.raw / total.raw * 6).toFixed(3).padStart(6);
      const real = usage.real.toFixed().padEnd(6);
      const realp = (100 * usage.real / total.real * 6).toFixed(3).padStart(6);
      s += ` | ${rank} | ${poke} | ${use}% | ${raw} | ${rawp}% | ${real} | ${realp}% | \n`;
    }
    s += ` + ---- + ------------------ + --------- + ------ + ------- + ------ + ------- + \n`;
    return s;
  }

  leadsReport(format: ID, stats: Statistics, battles: number) {
    let s = ` Total leads: ${battles * 2}\n`;
    s += ' + ---- + ------------------ + --------- + ------ + ------- + \n';
    s += ' | Rank | Pokemon            | Usage %   | Raw    | %       | \n';
    s += ' + ---- + ------------------ + --------- + ------ + ------- + \n';

    const total = {raw: 0, weighted: 0};
    total.raw = Math.max(1.0, stats.leads.raw);
    total.weighted = Math.max(1.0, stats.leads.weighted);

    const sorted = Array.from(stats.pokemon.entries())
                       .sort(
                           (a, b) => b[1].lead.weighted - a[1].lead.weighted ||
                               b[1].lead.raw - a[1].lead.raw || a[0].localeCompare(b[0]));
    for (const [i, entry] of sorted.entries()) {
      const species = entry[0];
      const usage = entry[1].lead;
      if (usage.raw === 0) break;

      const rank = (i + 1).toFixed().padEnd(4);
      const poke = util.getSpecies(species, format).species.padEnd(18);
      const use = (100 * usage.weighted / total.weighted).toFixed(5).padStart(8);
      const raw = usage.raw.toFixed().padEnd(6);
      const pct = (100 * usage.raw / total.raw).toFixed(3).padStart(6);
      s += ` | ${rank} | ${poke} | ${use}% | ${raw} | ${pct}% | \n`;
    }

    s += ' + ---- + ------------------ + --------- + ------ + ------- + \n';
    return s;
  }

  movesetReports(
      format: ID, stats: Statistics, battles: number, cutoff = 1500, tag: ID|null = null) {
    const movesetStats = toMovesetStatistics(format, stats);
    const basic = this.movesetReport(format, stats, movesetStats);
    const detailed = this.detailedMovesetReport(format, stats, battles, cutoff, tag, movesetStats);
    return {basic, detailed};
  }

  movesetReport(format: ID, stats: Statistics, movesetStats?: Map<ID, MovesetStatistics>) {
    movesetStats = movesetStats || toMovesetStatistics(format, stats);

    const data = util.dataForFormat(format);
    const WIDTH = 40;

    const heading = (n: string) => ` | ${n}`.padEnd(WIDTH + 2) + '| \n';
    const other = (t: number, f = 1) =>
        ` | Other ${(f * 100 * (1 - t)).toFixed(3).padStart(6)}%`.padEnd(WIDTH + 2) + '| \n';
    const display = (n: string, w: number) =>
        ` | ${n} ${(100 * w).toFixed(3).padStart(6)}%`.padEnd(WIDTH + 2) + '| \n';

    const sep = ` +${'-'.repeat(WIDTH)}+ \n`;
    let s = '';
    for (const [species, moveset] of movesetStats.entries()) {
      if (moveset.usage < 0.0001) break;  // 1/100th of a percent

      const p = stats.pokemon.get(species)!;

      s += sep;
      s += ` | ${util.getSpecies(species, data).species}`.padEnd(WIDTH + 2) + '| \n';
      s += sep;
      s += ` | Raw count: ${moveset['Raw count']}`.padEnd(WIDTH + 2) + '| \n';
      const avg =
          p.weights.count ? `${Math.floor(p.weights.sum / p.weights.count).toFixed(1)}` : '---';
      s += ` | Avg. weight: ${avg}`.padEnd(WIDTH + 2) + '| \n';
      const ceiling = Math.floor(moveset['Viability Ceiling'][1]);
      s += ` | Viability Ceiling: ${ceiling}`.padEnd(WIDTH + 2) + '| \n';
      s += sep;

      let total = 0;
      s += heading('Abilities');
      for (const [i, ability] of Object.keys(moveset['Abilities']).entries()) {
        if (i > 5) {
          s += other(total);
          break;
        }
        const weight = moveset['Abilities'][ability] / p.count;
        const o = data.getAbility(ability);
        s += display((o && o.name) || ability, weight);
        total += weight;
      }
      s += sep;
      total = 0;
      s += heading('Items');
      for (const [i, item] of Object.keys(moveset['Items']).entries()) {
        if (total > 0.95) {
          s += other(total);
          break;
        }
        const weight = moveset['Items'][item] / p.count;
        const o = data.getItem(item);
        s += display(item === 'nothing' ? 'Nothing' : (o && o.name) || item, weight);
        total += weight;
      }
      s += sep;
      total = 0;
      s += heading('Spreads');
      for (const [i, spread] of Object.keys(moveset['Spreads']).entries()) {
        if (total > 0.95 || i > 5) {
          s += other(total);
          break;
        }
        const weight = moveset['Spreads'][spread] / p.count;
        s += display(spread, weight);
        total += weight;
      }
      s += sep;
      total = 0;
      s += heading('Moves');
      for (const [i, move] of Object.keys(moveset['Moves']).entries()) {
        if (total > 0.95) {
          s += other(total, 4);
          break;
        }
        const weight = moveset['Moves'][move] / p.count;
        const o = data.getMove(move);
        s += display(move === '' ? 'Nothing' : (o && o.name) || move, weight);
        total += weight / 4;
      }
      s += sep;
      total = 0;
      s += heading('Teammates');
      for (const [i, teammate] of Object.keys(moveset['Teammates']).entries()) {
        if (total > 0.95 || i > 10) break;
        const w = moveset['Teammates'][teammate];
        const weight = w / p.count;
        s += ` | ${teammate} +${(100 * weight).toFixed(3).padStart(6)}%`.padEnd(WIDTH + 2) + '| \n';
        if (w < 0.005 * p.count) break;
        total += weight / 5;
      }
      s += sep;
      s += heading('Checks and Counters');
      for (const [i, cc] of Object.keys(moveset['Checks and Counters']).entries()) {
        if (i > 10) break;
        const v = moveset['Checks and Counters'][cc];
        if (v.score < 0.5) break;

        const score = (100 * v.score).toFixed(3).padStart(6);
        const p = (100 * v.p).toFixed(2).padStart(3);
        const d = (100 * v.d).toFixed(2).padStart(3);
        s += ` | ${cc} ${score} (${p}\u00b1${d})`.padEnd(WIDTH + 1) + '| \n';
        const ko = 100 * v.koed / v.n;
        const koed = ko.toFixed(1).padStart(2);
        const sw = (100 * v.switched / v.n);
        const switched = sw.toFixed(1).padStart(2);
        s += ` |\t (${koed}% KOed / ${switched}% switched out)`.padEnd(WIDTH + 2) + '| \n';
        if (ko < 10 || sw < 10) s += ' ';
      }
      s += sep;
    }

    return s;
  }

  detailedMovesetReport(
      format: ID, stats: Statistics, battles: number, cutoff = 1500, tag: ID|null = null,
      movesetStats?: Map<ID, MovesetStatistics>) {
    movesetStats = movesetStats || toMovesetStatistics(format, stats);

    const info = {
      'metagame': format,
      'cutoff': cutoff,
      'cutoff deviation': 0,
      'team type': tag,
      'number of battles': battles,
    };

    const d = util.dataForFormat(format);
    const data: {[key: string]: object} = {};
    for (const [species, moveset] of movesetStats.entries()) {
      if (moveset.usage < 0.0001) break;  // 1/100th of a percent
      const m: any = Object.assign({}, moveset);
      m['Checks and Counters'] = forDetailed(m['Checks and Counters']);
      data[util.getSpecies(species, d).species] = m;
    }

    return JSON.stringify({info, data});
  }

  metagameReport(stats: Statistics) {
    const metagame = stats.metagame;
    const W = Math.max(1.0, stats.usage.weighted);

    const tags =
        Array.from(metagame.tags.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    let s = '';
    for (const [tag, weight] of tags) {
      s += ` ${tag}`.padEnd(30, '.');
      s += `${(weight / W).toFixed(5).padStart(8)}%\n`;
    }
    s += '\n';

    if (!metagame.stalliness.length) return s;
    const stalliness = metagame.stalliness.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

    // Figure out a good bin range by looking at .1% and 99.9% points
    const index = Math.floor(stalliness.length / 1000);
    let low = stalliness[index][0];
    let high = stalliness[stalliness.length - index - 1][0];
    if (low > 0) {
      low = 0;
    } else if (high < 0) {
      high = 0;
    }

    // Rough guess at number of bins - possible the minimum?
    let nbins = 13;
    const size = (high - low) / (nbins - 1);
    // Try to find a prettier bin size, zooming into 0.05 at most.
    const binSize =
        [10, 5, 2.5, 2, 1.5, 1, 0.5, 0.25, 0.2, 0.1, 0.05].find(bs => size > bs) || 0.05;
    let histogram = [[0, 0]];
    for (let x = binSize; x + binSize / 2 < high; x += binSize) {
      histogram.push([x, 0]);
    }
    for (let x = -binSize; x - binSize / 2 > low; x -= binSize) {
      histogram.push([x, 0]);
    }
    histogram = histogram.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    nbins = histogram.length;

    const start = 0;
    // FIXME: Python comparison of an array and a number = break immediately.
    // for (; start < stalliness.length; start++) {
    //   if (stalliness[start] >= histogram[0][0] - binSize / 2) break;
    // }
    let j = 0;
    for (let i = start; i < stalliness.length; i++) {
      while (stalliness[i][0] > histogram[0][0] + binSize * (j * 0.5)) j++;
      if (j >= nbins) break;
      histogram[j][1] = histogram[j][1] + stalliness[i][1];
    }
    let max = 0;
    for (let i = 0; i < nbins; i++) {
      if (histogram[i][1] > max) max = histogram[i][1];
    }

    // Maximum number of blocks to go across
    const MAX_BLOCKS = 30;
    const blockSize = Math.floor(max / MAX_BLOCKS);

    if (blockSize <= 0) return s;

    let x = 0;
    let y = 0;
    for (const [val, weight] of stalliness) {
      x += val * weight;
      y += weight;
    }

    s += ` Stalliness (mean: ${(x / y).toFixed(3).padStart(6)})\n`;
    for (const h of histogram) {
      let line = '     |';
      if (h[0] % (2 * binSize) < Math.floor(binSize / 2)) {
        line = ' ';
        if (h[0] > 0) {
          line += '+';
        } else if (h[0] === 0) {
          line += ' ';
        }
        line += `${h[0].toFixed(1).padStart(3)}|`;
      }
      s += line + '#'.repeat(Math.floor((h[1] + blockSize / 2) / blockSize)) + '\n';
    }
    s += ` more negative = more offensive, more positive = more stall\n`;
    s += ` one # = ${(100.0 * blockSize / y).toFixed(2).padStart(5)}%`;
    return s;
  }

  updateReport() {}  // TODO rises and drops
};

function toMovesetStatistics(format: ID, stats: Statistics) {
  const sorted = Array.from(stats.pokemon.entries());
  const real = ['challengecup1v1', '1v1'].includes(format);
  if (['randombattle', 'challengecup', 'challengcup1v1', 'seasonal'].includes(format)) {
    sorted.sort((a, b) => a[0].localeCompare(b[0]));
  } else if (real) {
    sorted.sort((a, b) => b[1].usage.real - a[1].usage.real || a[0].localeCompare(b[0]));
  } else {
    sorted.sort((a, b) => b[1].usage.weighted - a[1].usage.weighted || a[0].localeCompare(b[0]));
  }
  const data = util.dataForFormat(format);

  const movesets: Map<ID, MovesetStatistics> = new Map();
  for (const entry of sorted) {
    const species = entry[0];
    const pokemon = entry[1];
    const usage = real ? pokemon.usage.real : pokemon.usage.weighted;
    const gxes = Array.from(pokemon.gxes.values()).sort((a, b) => b - a);
    const viability: [number, number, number, number] = gxes.length ?
        [
          gxes.length, gxes[0], gxes[Math.ceil(0.01 * gxes.length) - 1],
          gxes[Math.ceil(0.2 * gxes.length) - 1]
        ] :
        [0, 0, 0, 0];
    movesets.set(species, {
      'Raw count': pokemon.count,
      'usage': round(usage),
      'Viability Ceiling': viability,
      'Abilities': toObject(pokemon.abilities),
      'Items': toObject(pokemon.items),
      'Spreads': toObject(pokemon.spreads),
      'Happiness': toObject(pokemon.happinesses),
      'Moves': toObject(pokemon.moves),
      'Teammates': getTeammates(format, pokemon.teammates, pokemon.count, stats),  // TODO empty
      'Checks and Counters':
          getChecksAndCounters(pokemon.encounters, s => util.getSpecies(species, data).species),
    });
  }

  return movesets;
}

function getTeammates(format: ID, teammates: Map<ID, number>, count: number, stats: Statistics):
    {[key: string]: number} {
  const real = ['challengecup1v1', '1v1'].includes(format);
  const m: Map<string, number> = new Map();
  for (const [id, w] of teammates.entries()) {
    const species = util.getSpecies(id, format).species;
    const s = stats.pokemon.get(id);
    m.set(species, s ? (w - count * (real ? s.usage.real : s.usage.weighted)) : 0);
  }
  return toObject(m);
}

function getChecksAndCounters(
    encounters: Map<ID, number[/* Outcome */]>, display: (id: string) => string) {
  const cc: Array<[string, EncounterStatistics]> = [];
  for (const [id, outcomes] of encounters.entries()) {
    // Outcome.POKE1_KOED...Outcome.DOUBLE_SWITCH
    const n = outcomes.slice(6).reduce((a, b) => a + b);
    if (n <= 20) continue;

    const koed = outcomes[Outcome.POKE1_KOED];
    const switched = outcomes[Outcome.POKE2_SWITCHED_OUT];
    const p = (koed + switched) / n;
    const d = Math.sqrt(p * (1.0 - p) / n);
    const score = p - 4 * d;
    cc.push([id, {koed, switched, n, p, d, score}]);
  }

  const sorted = cc.sort((a, b) => (b[1].score - a[1].score || a[0].localeCompare(b[0])));
  const obj: {[key: string]: EncounterStatistics} = {};
  for (const [k, v] of sorted) {
    obj[display(k)] = v;
  }
  return obj;
}

function forDetailed(cc: {[key: string]: EncounterStatistics}) {
  const obj: {[key: string]: [number, number, number]} = {};
  for (const [k, v] of Object.entries(cc)) {
    obj[k] = [v.n, v.p, v.d];
  }
  return obj;
}

function toObject(map: Map<number|string, number>) {
  const obj: {[key: string]: number} = {};
  const sorted = Array.from(map.entries())
                     .sort((a, b) => b[1] - a[1] || a[0].toString().localeCompare(b[0].toString()));
  for (const [k, v] of sorted) {
    obj[k.toString()] = round(v);
  }
  return obj;
}

function round(v: number) {
  return Math.round(v * PRECISION) / PRECISION;
}

function parseUsageReport(report: string) {
  const usage: Map<ID, number> = new Map();
  const lines = report.split('\n');
  const battles = Number(lines[0].slice(16));

  for (let i = 5; i < lines.length; i++) {
    const line = lines[i].split('|');
    if (line.length < 3) break;
    const name = line[2].slice(1).trim();
    const pct = Number(line[3].slice(1, line[3].indexOf('%'))) / 100;
    usage.set(toID(name), pct);
  }

  return {usage, battles};
}