import mongoose, { Document, Schema } from 'mongoose';

export interface IDrawEntry extends Document {
  _id: mongoose.Types.ObjectId;
  entrant: mongoose.Types.ObjectId;
  codeIds: mongoose.Types.ObjectId[];
  isWinner: boolean;
  prizeTier?: 'grand' | 'secondary';
  createdAt: Date;
  updatedAt: Date;
}

const DrawEntrySchema = new Schema<IDrawEntry>(
  {
    entrant: { type: Schema.Types.ObjectId, ref: 'Entrant', required: true, index: true },
    codeIds: [{ type: Schema.Types.ObjectId, ref: 'CampaignCode', required: true }],
    isWinner: { type: Boolean, default: false },
    prizeTier: { type: String, enum: ['grand', 'secondary'] },
  },
  { timestamps: true }
);

const DrawEntry = mongoose.model<IDrawEntry>('DrawEntry', DrawEntrySchema);
export default DrawEntry;
