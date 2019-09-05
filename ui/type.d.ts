// stats.pokemonshowdown.com/
//   2019-08/
//     gen7ou/
//       1825.json -- Statistics
//       1825/
//         index.json -- just used by UI
//         weights.json -- used to juice sort orders
//         bigram.json -- used to fix weights
//         ...
//         charizard.json -- UsageStatistics
//     gen7monotype/
//       1760/
//         ...
//       monowater/
//         1760/
//           ...

// https://stats.pokemonshowdown.com/2019-08/gen7ou/1825/ (displays index.json)
// https://stats.pokemonshowdown.com/2019-08/gen7ou/1825/charizard (displays charizard.json)

// Can't rely completely on filesystem routing = actually add serving logic (aliases, items, trends etc)

// Not published as NPM = too large
// continue to support legacy for 6-12 months?

// Libraries
// Pokemon-Showdown-Stats/ = @pokemon-showdown/logs (logs-processing?)
//   Pokemon-Showdown-Stats/stats* = @pokemon-showdown/stats (logs2stats?)
//   Pokemon-Showdown-Stats/anon* = @pokemon-showdown/anon (/ anonymizer?, logs-anonymizer)
//   Pokemon-Showdown-Stats/ui = @pokemon-showdown/stats-ui (included for ECP)
//   Pokemon-Showdown/XXX - @pokemon-showdown/XXX (stats-helper? processed-stats?) = further processing = bucketting, percentiles, applying bigrams

export interface TaggedStatistics {
  total: WeightedStatistics;
  tags: { [id: string]: WeightedStatistics };
}

export interface WeightedStatistics {
  [num: number]: Statistics;
}

export interface Statistics {
  battles: number;
  pokemon: { [name: string]: UsageStatistics };
  metagame: MetagameStatistics;
}

export interface Index { // TODO: better name...
  // TODO: something with usage for each species, probably leads as well?
}
export interface Weights { // TODO: better name...
  species: { [name: string]: number };
  abilities: { [name: string]: number };
  items: { [name: string]: number };
  moves: { [name: string]: number };
}

export interface UsageStatistics {
  // TODO: some measure of raw count
  // TODO: some message of 'weighted' count
  // lead: Usage; // TODO: something to indicate leads

  // TODO: drop?
  // usage: Usage;
  // raw: { weight: number; count: number };
  // saved: { weight: number; count: number };

  // 'Display Name': NN.NNN
  abilities: { [name: string]: number };
  items: { [name: string]: number };
  moves: { [name: string]: number };
  stats: { [compact: string]: number };
  teammates: { [name: string]: number };
  counter: { [name: string]: any }; // TODO: what does this look like?

  // happinesses: { [num: number]: number }; // TODO: DROP?
  // spreads: { [spread: string]: number }; // TODO: DROP?

  // encounters: { [id: string]: number /* Outcome */[] };
  // gxes: { [id: string /* ID */]: number }; // TODO: dont even track, who cares about viability?
}

export interface MetagameStatistics {
  tags: { [id: string /* ID */]: number };
  stalliness: Array<[number, number]>; // TODO: how to encode histogram?
}