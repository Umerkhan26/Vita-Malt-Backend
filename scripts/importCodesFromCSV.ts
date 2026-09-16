/**
 * Batched crown-code importer.
 *
 * Dry run (no DB writes):
 *   npm run import-csv -- "./data/crown-codes-grand-prize.csv" --dry-run
 *
 * Import ALL codes in 5,000-row steps (one process, progress after each chunk):
 *   npm run import-csv -- "./data/crown-codes-grand-prize.csv" --batch-size 5000 --reset --batch utc-crowns-2026
 *
 * File duplicates are dropped before insert. DB duplicates are skipped (unique index).
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
  dryRun: boolean;
  reset: boolean;
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
    dryRun: has('--dry-run'),
    reset: has('--reset'),
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

const scanFileDuplicates = (raw: string) => {
  const seen = new Map<string, number>();
  let invalid = 0;
  for (const line of raw.split(/\r?\n/)) {
    const value = line.split(',')[0]?.trim().replace(/^"|"$/g, '').toUpperCase();
    if (!value || value === 'CODE' || value === 'CODES') continue;
    if (!/^[A-Z0-9-]{4,32}$/.test(value)) {
      invalid += 1;
      continue;
    }
    seen.set(value, (seen.get(value) || 0) + 1);
  }
  const duplicateValues = [...seen.entries()].filter(([, n]) => n > 1);
  const extraCopies = duplicateValues.reduce((sum, [, n]) => sum + (n - 1), 0);
  return {
    rawValid: [...seen.values()].reduce((sum, n) => sum + n, 0),
    unique: seen.size,
    extraCopies,
    duplicateExamples: duplicateValues.slice(0, 8).map(([code, n]) => `${code}×${n}`),
    invalid,
  };
};

const bulkStats = (err: unknown, chunkLen: number) => {
  const e = err as {
    message?: string;
    code?: number;
    insertedDocs?: unknown[];
    result?: { nInserted?: number; insertedCount?: number };
    writeErrors?: Array<{ code?: number; errmsg?: string; index?: number }>;
  };
  const inserted = e.insertedDocs?.length ?? e.result?.nInserted ?? e.result?.insertedCount ?? 0;
  const writeErrors = e.writeErrors ?? [];
  const dupes = writeErrors.filter((w) => w.code === 11000).length;
  const other = writeErrors.filter((w) => w.code !== 11000);
  return {
    inserted,
    skipped: Math.max(0, chunkLen - inserted),
    dupes,
    other,
    message: e.message || String(err),
  };
};

const run = async () => {
  const args = parseArgs();
  if (!args.file) {
    console.error(`
Usage:
  npm run import-csv -- <codes.csv> [--dry-run] [--reset] [--batch-size 5000] [--batch name]

Examples:
  npm run import-csv -- ./data/codes.csv --dry-run
  npm run import-csv -- ./data/codes.csv --batch-size 5000 --reset --batch utc-crowns-2026
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

  const content = fs.readFileSync(abs, 'utf8');
  const fileScan = scanFileDuplicates(content);
  const codes = parseCodesFromCsv(content);

  console.log(`DB: ${mongo.replace(/\/\/.*@/, '//***@')}`);
  console.log(`File: ${abs}`);
  console.log(`Mode: ${args.dryRun ? 'DRY RUN' : 'IMPORT'}`);
  console.log(`Batch name: ${args.batchName}`);
  console.log(`Chunk size: ${args.batchSize}`);
  console.log('\nFile scan');
  console.log(`  raw valid rows: ${fileScan.rawValid}`);
  console.log(`  unique codes:   ${fileScan.unique}`);
  console.log(`  extra copies dropped: ${fileScan.extraCopies}`);
  console.log(`  invalid rows skipped: ${fileScan.invalid}`);
  if (fileScan.duplicateExamples.length) {
    console.log(`  dupe examples: ${fileScan.duplicateExamples.join(', ')}`);
  }
  console.log(`  parsed unique for import: ${codes.length}`);

  if (!codes.length) {
    console.error('No codes found. Export GRAND PRIZE ENTRY codes only.');
    process.exit(1);
  }

  if (args.reset) {
    try {
      fs.unlinkSync(progressPath);
    } catch {
      /* ignore */
    }
  }

  await mongoose.connect(mongo);
  const existing = await CampaignCode.countDocuments();
  console.log(`\nDB currently has ${existing} CampaignCode rows`);

  if (args.dryRun) {
    const steps = Math.ceil(codes.length / args.batchSize);
    console.log(`Would import ${codes.length} unique codes in ${steps} steps of ${args.batchSize}.`);
    console.log('No writes performed.');
    await mongoose.disconnect();
    return;
  }

  let index = args.from >= 0 ? args.from : loadProgress(abs);
  if (args.limit != null && args.from >= 0) {
    args.batchSize = args.limit;
    args.once = true;
  }
  if (index >= codes.length) {
    console.log(`Already complete (next index ${index} >= ${codes.length}). Use --reset to start over.`);
    await mongoose.disconnect();
    process.exit(0);
  }

  console.log(`Starting at index ${index}`);

  let totalInserted = 0;
  let totalSkipped = 0;
  let step = 0;
  const fatal: string[] = [];

  while (index < codes.length) {
    const sliceEnd = Math.min(index + args.batchSize, codes.length);
    const chunk = codes.slice(index, sliceEnd);
    if (!chunk.length) break;
    step += 1;

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
      const stats = bulkStats(err, chunk.length);
      inserted = stats.inserted;
      skipped = stats.skipped;
      if (stats.other.length) {
        const detail = stats.other
          .slice(0, 3)
          .map((w) => `#${w.index} ${w.code} ${w.errmsg}`)
          .join(' | ');
        const msg = `Chunk ${index}-${sliceEnd} non-duplicate errors (${stats.other.length}): ${detail || stats.message}`;
        console.error(msg);
        fatal.push(msg);
        break;
      }
      if (inserted === 0 && stats.dupes === 0) {
        const msg = `Chunk ${index}-${sliceEnd} failed with no inserts: ${stats.message}`;
        console.error(msg);
        fatal.push(msg);
        break;
      }
    }

    totalInserted += inserted;
    totalSkipped += skipped;
    index = sliceEnd;
    saveProgress(abs, index, codes.length);

    console.log(
      `Step ${step}: +${inserted} inserted, ${skipped} skipped/dupes | ${index}/${codes.length} (${((index / codes.length) * 100).toFixed(1)}%)`
    );

    if (args.once) break;
  }

  const remaining = codes.length - index;
  const dbTotal = await CampaignCode.countDocuments();
  console.log(`\nSession: inserted ${totalInserted}, skipped ${totalSkipped}`);
  console.log(`Overall: ${index}/${codes.length} processed, ${remaining} left`);
  console.log(`DB CampaignCode total: ${dbTotal}`);

  if (fatal.length) {
    console.error('\nStopped on error. Re-run without --reset to continue from last progress.');
    await mongoose.disconnect();
    process.exit(1);
  }

  if (remaining > 0) {
    console.log(`Next step:\n  npm run import-csv -- "${abs}" --batch-size ${args.batchSize}`);
  } else {
    console.log('All unique codes from this file are processed.');
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
