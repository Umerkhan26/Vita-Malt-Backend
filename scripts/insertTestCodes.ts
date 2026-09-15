import path from 'path';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import CampaignCode from '../src/models/campaignCode.model';

dotenv.config({ path: path.join(__dirname, '../.env') });

const codes = ['VMALT01', 'VMALT02', 'VMALT03', 'VMALT04', 'VMALT05', 'VMALT06', 'VMALT07', 'VMALT08'];

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/vita-malt-2026');
  for (const code of codes) {
    await CampaignCode.updateOne(
      { code },
      { $setOnInsert: { code, status: 'unused', sourceBatch: 'test' } },
      { upsert: true }
    );
  }
  console.log('Test codes ready:', codes.join(', '));
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
