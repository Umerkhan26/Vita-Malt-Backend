import mongoose, { Document, Schema } from 'mongoose';

export type CodeStatus = 'unused' | 'used' | 'flagged';

export interface ICampaignCode extends Document {
  _id: mongoose.Types.ObjectId;
  code: string;
  status: CodeStatus;
  usedBy?: mongoose.Types.ObjectId;
  usedAt?: Date;
  sourceBatch: string;
  duplicateAttemptCount: number;
}

const CampaignCodeSchema = new Schema<ICampaignCode>(
  {
    code: { type: String, required: true, unique: true, index: true, uppercase: true, trim: true },
    status: { type: String, enum: ['unused', 'used', 'flagged'], default: 'unused', index: true },
    usedBy: { type: Schema.Types.ObjectId, ref: 'Entrant' },
    usedAt: { type: Date },
    sourceBatch: { type: String, default: 'import' },
    duplicateAttemptCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const CampaignCode = mongoose.model<ICampaignCode>('CampaignCode', CampaignCodeSchema);
export default CampaignCode;
