import mongoose, { Document, Schema } from 'mongoose';

export type WinnerTier = 'instant' | 'grand' | 'secondary';
export type WinnerStatus = 'pending_verification' | 'verified' | 'published' | 'disqualified';

export interface IWinner extends Document {
  _id: mongoose.Types.ObjectId;
  tier: WinnerTier;
  status: WinnerStatus;
  entrant?: mongoose.Types.ObjectId;
  drawEntry?: mongoose.Types.ObjectId;
  displayName: string;
  photoUrl?: string;
  prizeLabel: string;
  announcedAt?: Date;
  verifiedByAdmin?: mongoose.Types.ObjectId;
  notes?: string;
}

const WinnerSchema = new Schema<IWinner>(
  {
    tier: { type: String, enum: ['instant', 'grand', 'secondary'], required: true, index: true },
    status: {
      type: String,
      enum: ['pending_verification', 'verified', 'published', 'disqualified'],
      default: 'pending_verification',
      index: true,
    },
    entrant: { type: Schema.Types.ObjectId, ref: 'Entrant' },
    drawEntry: { type: Schema.Types.ObjectId, ref: 'DrawEntry' },
    displayName: { type: String, required: true },
    photoUrl: { type: String },
    prizeLabel: { type: String, required: true },
    announcedAt: { type: Date },
    verifiedByAdmin: { type: Schema.Types.ObjectId, ref: 'Entrant' },
    notes: { type: String },
  },
  { timestamps: true }
);

const Winner = mongoose.model<IWinner>('Winner', WinnerSchema);
export default Winner;
