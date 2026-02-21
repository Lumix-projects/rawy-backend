import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Like, LikeSchema } from './schemas/like.schema';
import { LikesService } from './likes.service';
import { LikesController } from './likes.controller';
import { CommentsModule } from '../comments/comments.module';
import { Comment, CommentSchema } from '../comments/schemas/comment.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Like.name, schema: LikeSchema },
      { name: Comment.name, schema: CommentSchema },
    ]),
    forwardRef(() => CommentsModule),
  ],
  providers: [LikesService],
  controllers: [LikesController],
  exports: [LikesService],
})
export class LikesModule {}
