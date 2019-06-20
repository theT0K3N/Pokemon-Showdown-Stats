import 'source-map-support/register';
import '../debug';

import * as path from 'path';
import { Data, ID, toID } from 'ps';
import { Parser, Reports, Statistics, Stats } from 'stats';
import { workerData } from 'worker_threads';

import { Batch, Checkpoint, Checkpoints, Offset } from '../checkpoint';
import { Configuration } from '../config';
import * as fs from '../fs';
import { CheckpointStorage, LogStorage } from '../storage';

class StatsCheckpoint extends Checkpoint {
  readonly stats: Statistics;

  constructor(format: ID, shard: string, begin: Offset, end: Offset, stats: Statistics) {
    super(format, begin, end, shard);
    this.stats = stats;
  }

  serialize() {
    return JSON.stringify(this.stats);
  }

  static async read(storage: CheckpointStorage, format: ID, shard: string, begin: Offset, end: Offset) {
    const serialized = await storage.read(format, shard, begin, end);
    const stats = JSON.parse(serialized);
    return new StatsCheckpoint(format, shard, begin, end, stats);
  }
}

const POPULAR = new Set([
  'ou',
  'doublesou',
  'randombattle',
  'oususpecttest',
  'smogondoublessuspecttest',
  'doublesoususpecttest',
  'gen7pokebankou',
  'gen7ou',
  'gen7pokebankdoublesou',
  'gen7pokebankoususpecttest',
  'gen7oususpecttest',
  'gen7pokebankdoublesoususpecttest',
  'gen7doublesoususpecttest',
  'gen7doublesou',
] as ID[]);

const CUTOFFS = {
  default: ['0', '1500', '1630', '1760'],
  popular: ['0', '1500', '1695', '1825'],
};

// By default we group all the cutoff shards together (ie. compute all the cutoffs as part
// of a single batch). This means that for all but gen7monotype we read each log file only once.
const GROUP = 4;

// The number of report files written by `writeReports` (usage, leads, moveset, chaos, metagame).
const REPORTS = 5;

const MONOTYPES = new Set(
  Object.keys(Data.forFormat('gen7monotype').Types).map(t => `mono${toID(t)}` as ID)
);

interface StatsConfiguration extends Configuration {
  reports: string;
  group?: number;
}

export async function init(config: StatsConfiguration) {
  if (config.dryRun) return;

  await fs.rmrf(config.reports);
  await fs.mkdir(config.reports, { recursive: true });
  const monotype = path.resolve(config.reports, 'monotype');
  await fs.mkdir(monotype);
  await Promise.all([...mkdirs(config.reports), ...mkdirs(monotype)]);
}

// split(config: StatsConfiguration): boolean | {shards: string[], group: number}
export function split(config: StatsConfiguration) {
  return (format: ID) => {
    if (
      format.startsWith('seasonal') ||
      format.includes('random') ||
      format.includes('metronome') || 
      format.includes('superstaff')
    ) {
      return false; // skip
    } else if (format === 'gen7monotype') {
      const cutoffs = POPULAR.has(format) ? CUTOFFS.popular : CUTOFFS.default;
      const shards = cutoffs.slice();
      for (const cutoff of cutoffs) {
        for (const type of MONOTYPES) {
          shards.push(`${cutoff}-${type}`);
        }
      }
      return { shards, group: config.group || GROUP };
    } else {
      const shards = (POPULAR.has(format) ? CUTOFFS.popular : CUTOFFS.default).slice();
      return { shards, group: config.group || GROUP };
    }
  };
}

function mkdirs(dir: string) {
  const mkdir = (d: string) => fs.mkdir(path.resolve(dir, d));
  return [mkdir('chaos'), mkdir('leads'), mkdir('moveset'), mkdir('metagame')];
}

// apply(batches: Batch[]|GroupedBatch[], config: StatsConfiguration): void
async function apply(batches: GroupedBatch[], config: StatsConfiguration) {
  const logStorage = LogStorage.connect(config);
  const checkpointStorage = CheckpointStorage.connect(config);

  for (const [i, { format, begin, end, shards }] of batches.entries()) {
    const data = Data.forFormat(format);

    // Figure out which shards we're going to be updating
    const state: Array<{cutoff: number, tag?: ID, stats: Statistics}> = [];
    for (const shard of shards) {
      const [cutoff, tag] = shard.split('-');
      state.push({
        cutoff: Number(cutoff),
        tag: tag ? tag as ID : undefined,
        stats: Stats.create(),
      });
    }

    // Actually process the logs, updating state accordingly
    const offset = `${format}: ${Checkpoints.formatOffsets(begin, end)}`;
    LOG(`Processing ${size} log(s) from batch ${i + 1}/${batches.length} - ${offset}`);
    let processed: Array<Promise<void>> = [];
    for (const log of await logStorage.select(format, begin, end)) {
      if (processed.length >= config.maxFiles) {
        LOG(`Waiting for ${processed.length} log(s) from ${format} to be parsed`);
        await Promise.all(processed);
        processed = [];
      }

      processed.push(processLog(logStorage, data, log, state, config.dryRun));
    }
    if (processed.length) {
      LOG(`Waiting for ${processed.length} log(s) from ${format} to be parsed`);
      await Promise.all(processed);
    }

    // Write checkpoints for each shard that we've computed
    let writes = [];
    for (const {cutoff, tag, stats} of state) {
      if (writes.length >= config.maxFiles) {
        LOG(`Waiting for ${writes.length} checkpoints(s) from ${format} to be written`);
        await Promise.all(writes);
        writes [];
      }
      const shard = tag ? `${cutoff}-${tag}` : `${cutoff}`;
      const checkpoint = new StatsCheckpoint(format, shard, begin, end, stats);
      LOG(`Writing checkpoint <${checkpoint}>`);
      writes.push(checkpointStorage.write(checkpoint));
    }
    if (writes.length) {
      LOG(`Waiting for ${writes.length} checkpoints(s) from ${format} to be written`);
      await Promise.all(writes);
    }
    MLOG(true);
  }
}

async function processLog(
  logStorage: LogStorage,
  data: Data,
  log: string,
  state: Array<{cutoff: number, tag?: ID, stats: Statistics}>,
  dryRun?: boolean
) {
  VLOG(`Processing ${log}`);
  if (dryRun) return;
  try {
    const raw = JSON.parse(await logStorage.read(log));
    const battle = Parser.parse(raw, data);
    for (const {cutoff, tag, stats} of state) {
      VLOG(`Updating ${cutoff}${tag ? tag : ''} stats for ${log}`);
      Stats.update(data, battle, cutoff, stats, tag);
    }
  } catch (err) {
    console.error(`${log}: ${err.message}`);
  }
}

// combine(shards: {format: ID, shard?: string}, config: StatsConfiguration): void
async function combine(shards: Array<{format: ID, shard: string}>, config: StatsConfiguration) {
  let writes = [];
  for (const {format, shard} of shards) {
    if (writes.length + REPORTS >= config.maxFiles) {
      LOG(`Waiting for ${writes.length} report(s) to be written`);
      await Promise.all(writes);
      writes = [];
      MLOG(true);
    }
    LOG(`Combining checkpoint(s) for ${format} (${shard})`);
    const stats = config.dryRun ? Stats.create() : await aggregate(config, format, shard);
    const [cutoff, tag] = shard.split('-');

    writes.push(...writeReports(config, format, Number(cutoff), shards, tag ? tag as ID : undefined));
  }
  if (writes.length) {
    LOG(`Waiting for ${writes.length} report(s) for to be written`);
    await Promise.all(writes);
    MLOG(true);
  }
}

async function aggregate(config: StatsConfiguration, format: ID, shard: string): Promise<Statistics> {
  const checkpointStorage = CheckpointStorage.connect(config);
  const stats = Stats.create();
  // Floating point math is commutative but *not* necessarily associative, meaning that we can
  // potentially get different results depending on the order we add the Stats in. The sorting
  // CheckpointStorage#list *could* be used to help with stability, but we are letting the reads
  // race here to improve performance. Furthermore, there is no guarantee runs with different batch
  // sizes/checkpoints will return the same results or that they will be equivalent to arbitrary
  // precision with a run which does not use batches at all. For the best accuracy we should be
  // adding up the smallest values first, but this requires deeper architectural changes and has
  // performance implications. https://en.wikipedia.org/wiki/Floating-point_arithmetic
  let n = 0;
  let combines = [];
  const N = Math.min(config.maxFiles, config.batchSize.combine);
  const checkpoints = await checkpointStorage.list(format, shard);
  const size = checkpoints.length;
  for (const [i, { begin, end }] of checkpoints.entries()) {
    if (n >= N) {
      LOG(`Waiting for ${combines.length}/${size} checkpoint(s) for ${format} (${shard}) to be aggregated`);
      await Promise.all(combines);
      n = 0;
      combines = [];
    }

    combines.push(
      StatsCheckpoint.read(checkpointStorage, format, shard, begin, end).then(checkpoint => {
        LOG(`Aggregating checkpoint ${i + 1}/${size} <${checkpoint}>`);
        Stats.combine(stats, checkpoint.stats);
        MLOG(true);
      })
    );
    n++;
  }
  if (combines.length) {
    LOG(`Waiting for ${combines.length} checkpoint(s) for ${format} (${shard}) to be aggregated`);
    await Promise.all(combines);
  }
  MLOG(true);

  return stats;
}

// TODO: pass in Data to all reports being written!
function writeReports(
  config: StatsConfiguration,
  format: ID,
  cutoff: number,
  stats: Statistics,
  tag?: ID
) {
  LOG(`Writing reports for ${format} for cutoff ${cutoff}` + (tag ? ` (${tag})` : ''));
  if (config.dryRun) return new Array(REPORTS).fill(Promise.resolve());

  const file = tag ? `${format}-${tag}-${cutoff}` : `${format}-${cutoff}`;
  const usage = Reports.usageReport(format, stats);

  const reports =
    format === 'gen7monotype' && tag ? path.join(config.reports, 'monotype') : config.reports;
  const min = config.all ? [0, -Infinity] : [20, 0.5];
  const writes = [];
  writes.push(fs.writeFile(path.resolve(reports, `${file}.txt`), usage));
  const leads = Reports.leadsReport(format, stats);
  writes.push(fs.writeFile(path.resolve(reports, 'leads', `${file}.txt`), leads));
  const movesets = Reports.movesetReports(format, stats, cutoff, tag, min);
  writes.push(fs.writeFile(path.resolve(reports, 'moveset', `${file}.txt`), movesets.basic));
  writes.push(fs.writeFile(path.resolve(reports, 'chaos', `${file}.json`), movesets.detailed));
  const metagame = Reports.metagameReport(stats);
  writes.push(fs.writeFile(path.resolve(reports, 'metagame', `${file}.txt`), metagame));
  return writes;
}

if (workerData) {
  (async () =>
    workerData.type === 'apply'
      ? apply(workerData.formats, workerData.config)
      : combine(workerData.formats, workerData.config))().catch(err => console.error(err));
}
