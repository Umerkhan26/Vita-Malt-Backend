import path from 'path';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import Entrant from '../src/models/entrant.model';
import { normalizePhone } from '../src/utils/phone';

dotenv.config({ path: path.join(__dirname, '../.env') });

const email = process.argv[2];
const password = process.argv[3];
const phone = process.argv[4] || '+10000000000';
const name = process.argv[5] || 'SVBL Admin';

if (!email || !password) {
  console.error('Usage: npm run set-admin -- admin@example.com StrongPass1! [phone] [name]');
  process.exit(1);
}

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/vita-malt-2026');
  const passwordHash = await bcrypt.hash(password, 10);
  const phoneNormalized = normalizePhone(phone);
  const admin = await Entrant.findOneAndUpdate(
    { email: email.toLowerCase() },
    {
      fullName: name,
      phone,
      phoneNormalized,
      email: email.toLowerCase(),
      dateOfBirth: new Date('1990-01-01'),
      isOver18: true,
      passwordHash,
      hasAccount: true,
      isActive: true,
      isVerified: true,
      role: 'admin',
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  console.log('Admin ready:', admin.email);
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
