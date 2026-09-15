import mongoose, { Document, Schema } from 'mongoose';

export interface IEntrant extends Document {
  _id: mongoose.Types.ObjectId;
  fullName: string;
  phone: string;
  phoneNormalized: string;
  email?: string;
  dateOfBirth: Date;
  isOver18: boolean;
  passwordHash?: string;
  hasAccount: boolean;
  isActive: boolean;
  isVerified: boolean;
    resetToken?: string;
    resetTokenExpiry?: Date | null;
    accountSetupToken?: string;
    accountSetupTokenExpiry?: Date | null;
  verificationOTP?: string;
  verificationOTPExpiry?: Date | null;
  validCodeCount: number;
  drawEntryCount: number;
  pendingCodeIds: mongoose.Types.ObjectId[];
  role: 'user' | 'admin';
  created_at: Date;
}

const EntrantSchema = new Schema<IEntrant>(
  {
    fullName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    phoneNormalized: { type: String, required: true, unique: true, index: true },
    email: { type: String, trim: true, lowercase: true, sparse: true, unique: true },
    dateOfBirth: { type: Date, required: true },
    isOver18: { type: Boolean, required: true },
    passwordHash: { type: String },
    hasAccount: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    isVerified: { type: Boolean, default: false },
    resetToken: { type: String },
    resetTokenExpiry: { type: Date, default: null },
    accountSetupToken: { type: String },
    accountSetupTokenExpiry: { type: Date, default: null },
    verificationOTP: { type: String },
    verificationOTPExpiry: { type: Date, default: null },
    validCodeCount: { type: Number, default: 0 },
    drawEntryCount: { type: Number, default: 0 },
    pendingCodeIds: [{ type: Schema.Types.ObjectId, ref: 'CampaignCode' }],
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    created_at: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

EntrantSchema.index({ fullName: 1, phoneNormalized: 1 });

const Entrant = mongoose.model<IEntrant>('Entrant', EntrantSchema);
export default Entrant;
