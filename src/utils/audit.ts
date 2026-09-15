import AuditLog from '../models/auditLog.model';
import mongoose from 'mongoose';

export const writeAudit = async (params: {
  action: string;
  actor?: mongoose.Types.ObjectId | string;
  actorType: 'entrant' | 'admin' | 'system';
  metadata?: Record<string, unknown>;
  ip?: string;
}): Promise<void> => {
  await AuditLog.create({
    action: params.action,
    actor: params.actor,
    actorType: params.actorType,
    metadata: params.metadata,
    ip: params.ip,
  });
};
