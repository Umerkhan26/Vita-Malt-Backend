import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import CampaignCode from '../src/models/campaignCode.model';
import { parseCodesFromCsv } from '../src/utils/parseCodesCsv';

dotenv.config({ path: path.join(__dirname, '../.env') });

const file = process.argv[2];
const batch = process.argv[3] || `csv-${Date.now()}`;

if (!file) {
  console.error('Usage: npm run import-csv -- ./codes.csv [batchName]');
  process.exit(1);
}

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/vita-malt-2026');
  const content = fs.readFileSync(path.resolve(file), 'utf8');
  const codes = parseCodesFromCsv(content);

  let inserted = 0;
  let skipped = 0;
  for (const code of codes) {
    try {
      await CampaignCode.create({ code, status: 'unused', sourceBatch: batch });
      inserted += 1;
    } catch {
      skipped += 1;
    }
  }
  console.log(`Parsed ${codes.length} codes. Imported ${inserted}, skipped ${skipped}`);
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
