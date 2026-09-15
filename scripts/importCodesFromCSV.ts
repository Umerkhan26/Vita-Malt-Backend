/**
 * Batched crown-code importer.
 *
 * Use AFTER deploy (production Mongo) for real codes, or locally for testing.
 * Imports in STEPS — not all 294k at once. Safe to re-run (duplicates skipped).
 *
 * Steps:
 *   1) Convert Excel → codes CSV (see scripts/xlsxToCodesCsv.py)
 *   2) Point backend/.env MONGODB_URI at the DB you want (local OR production)
 *   3) Run batches, e.g.:
 *        npm run import-csv -- "D:/path/codes.csv" --batch-size 5000
 *      Or one step only:
 *        npm run import-csv -- "D:/path/codes.csv" --batch-size 5000 --from 0 --limit 5000
 *        npm run import-csv -- "D:/path/codes.csv" --batch-size 5000 --from 5000 --limit 5000
 *
 * Progress is saved to .import-codes-progress.json so you can stop and continue.
 */
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import CampaignCode from '../src/models/campaignCode.model';
import { parseCodesFromCsv } from '../src/utils/parseCodesCsv';

dotenv.config({ path: path.join(__dirname, '../.env') });

type Args = {
  file?: string;
  batchName: string;
  batchSize: number;
  from: number;
  limit?: number;
  once: boolean;
};

const progressPath = path.join(__dirname, '.import-codes-progress.json');

const parseArgs = (): Args => {
  const argv = process.argv.slice(2);
  const file = argv.find((a) => !a.startsWith('--'));
  const getNum = (flag: string, fallback: number) => {
    const i = argv.indexOf(flag);
    if (i === -1 || !argv[i + 1]) return fallback;
    return Number(argv[i + 1]);
  };
  const has = (flag: string) => argv.includes(flag);
  const batchIdx = argv.indexOf('--batch');
  const batchName =
    batchIdx !== -1 && argv[batchIdx + 1] && !argv[batchIdx + 1].startsWith('--')
      ? argv[batchIdx + 1]
      : `import-${new Date().toISOString().slice(0, 10)}`;

  return {
    file,
    batchName,
    batchSize: getNum('--batch-size', 5000),
    from: getNum('--from', -1),
    limit: argv.includes('--limit') ? getNum('--limit', 5000) : undefined,
    once: has('--once') || argv.includes('--limit'),
  };
};

const loadProgress = (file: string): number => {
  try {
    const raw = JSON.parse(fs.readFileSync(progressPath, 'utf8')) as { file?: string; nextIndex?: number };
    if (raw.file === path.resolve(file) && typeof raw.nextIndex === 'number') return raw.nextIndex;
  } catch {
    /* first run */
  }
  return 0;
};

const saveProgress = (file: string, nextIndex: number, total: number) => {
  fs.writeFileSync(
    progressPath,
    JSON.stringify(
      {
        file: path.resolve(file),
        nextIndex,
        total,
        updatedAt: new Date().toISOString(),
      },
      null,
      2
    )
  );
};

const run = async () => {
  const args = parseArgs();
  if (!args.file) {
    console.error(`
Usage:
  npm run import-csv -- <codes.csv> [--batch-size 5000] [--from 0] [--limit 5000] [--batch name] [--once]

Examples (steps):
  npm run import-csv -- ./data/codes.csv --batch-size 5000 --from 0 --limit 5000
  npm run import-csv -- ./data/codes.csv --batch-size 5000 --from 5000 --limit 5000

Auto continue from last progress (still in chunks of batch-size):
  npm run import-csv -- ./data/codes.csv --batch-size 5000

One chunk then stop (uses saved progress if --from omitted):
  npm run import-csv -- ./data/codes.csv --batch-size 5000 --once
`);
    process.exit(1);
  }

  const mongo = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongo) {
    console.error('Missing MONGODB_URI / MONGO_URI in backend/.env');
    process.exit(1);
  }

  const abs = path.resolve(args.file);
  if (!fs.existsSync(abs)) {
    console.error(`File not found: ${abs}`);
    process.exit(1);
  }

  console.log(`DB: ${mongo.replace(/\/\/.*@/, '//***@')}`);
  console.log(`File: ${abs}`);
  console.log(`Batch name: ${args.batchName}`);
  console.log(`Chunk size: ${args.batchSize}`);

  const content = fs.readFileSync(abs, 'utf8');
  const codes = parseCodesFromCsv(content);
  console.log(`Parsed ${codes.length} unique valid codes from file`);

  if (!codes.length) {
    console.error('No codes found. Export GRAND PRIZE ENTRY codes only.');
    process.exit(1);
  }

  let index = args.from >= 0 ? args.from : loadProgress(abs);
  if (args.limit != null && args.from >= 0) {
    // explicit window: from → from+limit
    args.batchSize = args.limit;
    args.once = true;
  }
  if (index >= codes.length) {
    console.log(`Already complete (next index ${index} >= ${codes.length}). Delete ${progressPath} to restart.`);
    process.exit(0);
  }

  await mongoose.connect(mongo);
  console.log('Connected.');

  let totalInserted = 0;
  let totalSkipped = 0;

  while (index < codes.length) {
    const sliceEnd = Math.min(index + args.batchSize, codes.length);
    const chunk = codes.slice(index, sliceEnd);
    if (!chunk.length) break;

    const docs = chunk.map((code) => ({
      code,
      status: 'unused' as const,
      sourceBatch: args.batchName,
      duplicateAttemptCount: 0,
    }));

    let inserted = 0;
    let skipped = 0;
    try {
      const result = await CampaignCode.insertMany(docs, { ordered: false });
      inserted = result.length;
    } catch (err: unknown) {
      const e = err as { insertedDocs?: unknown[]; result?: { nInserted?: number } };
      inserted = e.insertedDocs?.length ?? e.result?.nInserted ?? 0;
      skipped = chunk.length - inserted;
    }

    totalInserted += inserted;
    totalSkipped += skipped;
    index = sliceEnd;
    saveProgress(abs, index, codes.length);

    console.log(
      `Chunk done: +${inserted} inserted, ${skipped} skipped/dupes | progress ${index}/${codes.length} (${((index / codes.length) * 100).toFixed(1)}%)`
    );

    // Always stop after one chunk when --once or --limit (limit = treat as one step size override)
    if (args.once) break;
    if (args.limit != null) break;
  }

  const remaining = codes.length - index;
  console.log(`\nSession: inserted ${totalInserted}, skipped ${totalSkipped}`);
  console.log(`Overall: ${index}/${codes.length} processed, ${remaining} left`);
  if (remaining > 0) {
    console.log(`Next step:\n  npm run import-csv -- "${abs}" --batch-size ${args.batchSize} --once`);
  } else {
    console.log('All codes from this file are processed.');
    try {
      fs.unlinkSync(progressPath);
    } catch {
      /* ignore */
    }
  }

  await mongoose.disconnect();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
