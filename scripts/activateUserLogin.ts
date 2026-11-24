import path from 'path';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import Entrant from '../src/models/entrant.model';

dotenv.config({ path: path.join(__dirname, '../.env') });

const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
  console.error('Usage: npx ts-node scripts/activateUserLogin.ts email@example.com NewPass1!');
  process.exit(1);
}

const run = async () => {
  await mongoose.connect(
    process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/vita-malt-2026'
  );

  const passwordHash = await bcrypt.hash(password, 10);

  // Only auth-related fields — do not touch codes, pendingCodeIds, counts, etc.
  const entrant = await Entrant.findOneAndUpdate(
    { email: email.toLowerCase() },
    {
      $set: {
        passwordHash,
        hasAccount: true,
        isVerified: true,
        isActive: true,
      },
      $unset: {
        accountSetupToken: 1,
        accountSetupTokenExpiry: 1,
        verificationOTP: 1,
        verificationOTPExpiry: 1,
        resetToken: 1,
        resetTokenExpiry: 1,
      },
    },
    { new: true }
  );

  if (!entrant) {
    console.error('Entrant not found for email:', email);
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log('Login activated for:', entrant.email);
  console.log({
    hasAccount: entrant.hasAccount,
    isVerified: entrant.isVerified,
    isActive: entrant.isActive,
    validCodeCount: entrant.validCodeCount,
    drawEntryCount: entrant.drawEntryCount,
    pendingCodeIds: entrant.pendingCodeIds?.length ?? 0,
    role: entrant.role,
  });

  await mongoose.disconnect();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
