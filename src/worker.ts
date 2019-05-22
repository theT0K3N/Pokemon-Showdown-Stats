import * as path from 'path';
import {Data, ID, toID} from 'ps';
import {Parser, Reports, Statistics, Stats, TaggedStatistics} from 'stats';
import {workerData} from 'worker_threads';

import * as fs from './fs';
import * as state form './state';
import * as main from './main';

interface Checkpoint {
  begin: string;
  end: string;
  stats: Stats;
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
  default: [0, 1500, 1630, 1760],
  popular: [0, 1500, 1695, 1825],
};

const BATCH_SIZE = 1000; // TODO: What should the default for this be?

const monotypes = (data: Data) => new Set(Object.keys(data.Types).map(t => `mono${toID(t)}` as ID));

interface Options extends main.Options {
  reportsPath: string;
}


async function process(formats: main.FormatData[], options: Options) {
  // If we are configured to use checkpoints we will check to see if a checkpoints directory
  // already exists - if so we need to resume from the checkpoint, otherwise we need to
  // create the checkpoint directory setup and write the checkpoints as we process the logs.
  const batches = 
  if (options.checkpoints) {
    // The checkpoints directory is to be structured as follows:
    //
    //     <checkpoints>
    //     └── format
    //         └── YYYY-MM-DD
    //             └── HHMMSS.json
    //

    // If we're checkpointing we need a batch size.
    options.batchSize = options.batchSize || BATCH_SIZE;
  }

  // All of the reports we're writing
  const writes: Array<Promise<void>> = [];
  for (const [format, batches] of formats.entries()) {
    const cutoffs = POPULAR.has(format) ? CUTOFFS.popular : CUTOFFS.default;
    const data = Data.forFormat(format);
    const stats = Stats.create();
    // TODO: chunk the number of files we read instead of all at once
    const logs: Array<Promise<void>> = [];
    for (const file of files) {
      logs.push(processLog(data, file, cutoffs, stats));
    }
    await Promise.all(logs);

    const b = stats.battles;
    for (const [c, s] of stats.total.entries()) {
      writes.push(...writeReports(options.reportsPath, format, c, s, b));
    }

    for (const [t, ts] of stats.tags.entries()) {
      for (const [c, s] of ts.entries()) {
        writes.push(...writeReports(options.reportsPath, format, c, s, b, t));
      }
    }
  }
  await Promise.all(writes);
}

async function processLog(data: Data, file: string, cutoffs: number[], stats: TaggedStatistics) {
  try {
    const raw = JSON.parse(await fs.readFile(file, 'utf8'));
    // TODO: save checkpoints/IR (by chunk)
    const battle = Parser.parse(raw, data);
    const tags = data.format === 'gen7monotype' ? monotypes(data) : undefined;
    Stats.update(data, battle, cutoffs, stats, tags);
  } catch (err) {
    console.error(`${file}: ${err.message}`);
  }
}

function writeReports(
    reports: string, format: ID, cutoff: number, stats: Statistics, battles: number, tag?: ID) {
  const file = tag ? `${format}-${tag}-${cutoff}` : `${format}-${cutoff}`;
  const usage = Reports.usageReport(format, stats, battles);

  const writes: Array<Promise<void>> = [];
  writes.push(fs.writeFile(path.resolve(reports, `${file}.txt`), usage));
  const leads = Reports.leadsReport(format, stats, battles);
  writes.push(fs.writeFile(path.resolve(reports, 'leads', `${file}.txt`), leads));
  // const movesets = Reports.movesetReports(format, stats, battles, cutoff, tag, [0, -Infinity]);
  const movesets = Reports.movesetReports(format, stats, battles, cutoff, tag);
  writes.push(fs.writeFile(path.resolve(reports, 'moveset', `${file}.txt`), movesets.basic));
  writes.push(fs.writeFile(path.resolve(reports, 'chaos', `${file}.json`), movesets.detailed));
  const metagame = Reports.metagameReport(stats);
  writes.push(fs.writeFile(path.resolve(reports, 'metagame', `${file}.txt`), metagame));
  return writes;
}

function writeCheckpoint(file: string, checkpoint: Checkpoint) {
  return fs.writeGzipFile(file, JSON.stringify({
    begin: checkpoint.begin,
    end: checkpoint.end,
    stats: state.serializeStats(checkpoint.stats),
  }));
}

async function readCheckpoint(file: string) {
  const json = JSON.stringify(await fs.readFile(file));
  return {begin: json.begin, end: json.end, checkpoint: state.deserializeStats(json.stats))};
}

function resumeFromCheckpoint(files: string[], checkpoint?: Checkpoint, options: Options) {
  const batches: string[][] = [];

  let size = 0;
  let batch = [];
  for (const file of files) {
    // TODO: We could binary search for the starting point
    if (checkpoint && file < checkpoint.file) continue;
    if (!options.batchSize || size < options.batchSize) {
      // TODO: we may also decide to change batches at the start of a new day
      batch.push(file);
    } else {
      batches.push(batch);
      size = 0;
      batch = [];
    }
  }
  if (size) batches.push(batch);

  const stats = options.staged || !checkpoint ? Stats.create() : checkpoint.stats;
  return {batches, stats};
}

// tslint:disable-next-line: no-floating-promises
(async () => await process(workerData.formats, workerData.options))();
