import mongoose, { Document, Schema } from 'mongoose';

export interface IAuditLog extends Document {
  _id: mongoose.Types.ObjectId;
  action: string;
  actor?: mongoose.Types.ObjectId;
  actorType: 'entrant' | 'admin' | 'system';
  metadata?: Record<string, unknown>;
  ip?: string;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    action: { type: String, required: true, index: true },
    actor: { type: Schema.Types.ObjectId, ref: 'Entrant' },
    actorType: { type: String, enum: ['entrant', 'admin', 'system'], required: true },
    metadata: { type: Schema.Types.Mixed },
    ip: { type: String },
  },
  { timestamps: true }
);

const AuditLog = mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);
export default AuditLog;
