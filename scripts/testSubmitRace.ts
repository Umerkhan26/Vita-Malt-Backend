import path from 'path';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import CampaignCode from '../src/models/campaignCode.model';
import { submitCode } from '../src/services/codeService';

dotenv.config({ path: path.join(__dirname, '../.env') });

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/vita-malt-2026');
  const code = `RACE${Date.now().toString().slice(-6)}`;
  await CampaignCode.create({ code, status: 'unused', sourceBatch: 'race-test' });

  const results = await Promise.allSettled([
    submitCode({
      code,
      fullName: 'Race One',
      phone: '+15550000001',
      dateOfBirth: '1990-01-01',
      isOver18: true,
    }),
    submitCode({
      code,
      fullName: 'Race Two',
      phone: '+15550000002',
      dateOfBirth: '1990-01-01',
      isOver18: true,
    }),
  ]);

  const successes = results.filter((r) => r.status === 'fulfilled').length;
  const failures = results.filter((r) => r.status === 'rejected').length;
  console.log({ successes, failures, details: results.map((r) => (r.status === 'fulfilled' ? 'ok' : r.reason?.message)) });
  if (successes !== 1 || failures !== 1) {
    console.error('Race test FAILED — expected exactly one success');
    process.exitCode = 1;
  } else {
    console.log('Race test passed — atomic redeem held.');
  }
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
