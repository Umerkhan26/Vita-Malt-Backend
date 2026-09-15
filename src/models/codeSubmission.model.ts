import mongoose, { Document, Schema } from 'mongoose';

export type SubmissionResult = 'success' | 'invalid' | 'duplicate' | 'blocked' | 'validation_error';

export interface ICodeSubmission extends Document {
  _id: mongoose.Types.ObjectId;
  codeAttempted: string;
  result: SubmissionResult;
  reason?: string;
  entrant?: mongoose.Types.ObjectId;
  ip?: string;
  userAgent?: string;
}

const CodeSubmissionSchema = new Schema<ICodeSubmission>(
  {
    codeAttempted: { type: String, required: true, uppercase: true, trim: true, index: true },
    result: {
      type: String,
      enum: ['success', 'invalid', 'duplicate', 'blocked', 'validation_error'],
      required: true,
      index: true,
    },
    reason: { type: String },
    entrant: { type: Schema.Types.ObjectId, ref: 'Entrant' },
    ip: { type: String },
    userAgent: { type: String },
  },
  { timestamps: true }
);

CodeSubmissionSchema.index({ createdAt: -1 });

const CodeSubmission = mongoose.model<ICodeSubmission>('CodeSubmission', CodeSubmissionSchema);
export default CodeSubmission;
