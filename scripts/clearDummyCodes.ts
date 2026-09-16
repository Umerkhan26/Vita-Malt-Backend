/**
 * Remove dummy / test crown codes before the real Excel import.
 *
 * Dry-run (default):
 *   npm run clear-dummy-codes
 *
 * Delete all CampaignCode rows (plus related test submissions/entries):
 *   npm run clear-dummy-codes -- --confirm
 */
import path from 'path';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import CampaignCode from '../src/models/campaignCode.model';
import CodeSubmission from '../src/models/codeSubmission.model';
import DrawEntry from '../src/models/drawEntry.model';
import Entrant from '../src/models/entrant.model';

dotenv.config({ path: path.join(__dirname, '../.env') });

const confirm = process.argv.includes('--confirm');

const run = async () => {
  const mongo = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongo) {
    console.error('Missing MONGODB_URI / MONGO_URI in backend/.env');
    process.exit(1);
  }

  await mongoose.connect(mongo);
  console.log(`DB: ${mongo.replace(/\/\/.*@/, '//***@')}`);

  const [total, unused, used, flagged, submissions, drawEntries] = await Promise.all([
    CampaignCode.countDocuments(),
    CampaignCode.countDocuments({ status: 'unused' }),
    CampaignCode.countDocuments({ status: 'used' }),
    CampaignCode.countDocuments({ status: 'flagged' }),
    CodeSubmission.countDocuments(),
    DrawEntry.countDocuments(),
  ]);

  const batches = await CampaignCode.aggregate([{ $group: { _id: '$sourceBatch', count: { $sum: 1 } } }, { $sort: { count: -1 } }]);
  const samples = await CampaignCode.find().sort({ createdAt: 1 }).limit(12).select('code status sourceBatch').lean();

  console.log('\nCampaignCode');
  console.log(`  total=${total} unused=${unused} used=${used} flagged=${flagged}`);
  console.log('  by sourceBatch:');
  if (!batches.length) console.log('    (none)');
  for (const b of batches) console.log(`    ${b._id || '(empty)'}: ${b.count}`);
  console.log('  sample:');
  for (const s of samples) console.log(`    ${s.code}  ${s.status}  ${s.sourceBatch}`);
  console.log(`\nCodeSubmission: ${submissions}`);
  console.log(`DrawEntry: ${drawEntries}`);

  if (!confirm) {
    console.log('\nDry run only. Nothing deleted.');
    console.log('To wipe dummy codes (and related submissions/entries) then import Excel:');
    console.log('  npm run clear-dummy-codes -- --confirm');
    await mongoose.disconnect();
    return;
  }

  const codeResult = await CampaignCode.deleteMany({});
  const subResult = await CodeSubmission.deleteMany({});
  const drawResult = await DrawEntry.deleteMany({});
  const entrantResult = await Entrant.updateMany(
    { role: { $ne: 'admin' } },
    { $set: { validCodeCount: 0, drawEntryCount: 0, pendingCodeIds: [] } }
  );

  console.log('\nDeleted');
  console.log(`  CampaignCode: ${codeResult.deletedCount}`);
  console.log(`  CodeSubmission: ${subResult.deletedCount}`);
  console.log(`  DrawEntry: ${drawResult.deletedCount}`);
  console.log(`  Entrant progress reset: ${entrantResult.modifiedCount}`);
  console.log(`  Remaining codes: ${await CampaignCode.countDocuments()}`);

  await mongoose.disconnect();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
