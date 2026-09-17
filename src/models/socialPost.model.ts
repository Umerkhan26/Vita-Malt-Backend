import mongoose, { Document, Schema } from 'mongoose';

export interface ISocialPost extends Document {
  _id: mongoose.Types.ObjectId;
  platform: 'instagram' | 'facebook' | 'tiktok' | 'other';
  embedUrl: string;
  caption?: string;
  previewTitle?: string;
  previewDescription?: string;
  previewImage?: string;
  isActive: boolean;
  sortOrder: number;
}

const SocialPostSchema = new Schema<ISocialPost>(
  {
    platform: { type: String, enum: ['instagram', 'facebook', 'tiktok', 'other'], default: 'instagram' },
    embedUrl: { type: String, required: true },
    caption: { type: String },
    previewTitle: { type: String },
    previewDescription: { type: String },
    previewImage: { type: String },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const SocialPost = mongoose.model<ISocialPost>('SocialPost', SocialPostSchema);
export default SocialPost;
