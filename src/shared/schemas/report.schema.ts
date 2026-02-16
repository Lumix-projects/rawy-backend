import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ReportDocument = Report & Document;

export type ReportTargetType = 'podcast' | 'episode' | 'comment';
export type ReportStatus = 'pending' | 'dismissed' | 'resolved';

@Schema({ timestamps: false })
export class Report {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, enum: ['podcast', 'episode', 'comment'] })
  targetType!: ReportTargetType;

  @Prop({ type: Types.ObjectId, required: true })
  targetId!: Types.ObjectId;

  @Prop({ type: String, default: null })
  reason!: string | null;

  @Prop({ required: true, enum: ['pending', 'dismissed', 'resolved'] })
  status!: ReportStatus;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  resolvedBy!: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  resolvedAt!: Date | null;

  @Prop({ required: true, default: () => new Date() })
  createdAt!: Date;
}

export const ReportSchema = SchemaFactory.createForClass(Report);

ReportSchema.index({ status: 1 });
ReportSchema.index({ targetType: 1, targetId: 1 });
ReportSchema.index({ createdAt: -1 });
