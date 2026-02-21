import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FollowsController } from './follows.controller';
import { FollowsService } from './follows.service';
import { Follow, FollowSchema } from './schemas/follow.schema';
import { UsersModule } from '../users/users.module';

@Module({
    imports: [
        MongooseModule.forFeature([{ name: Follow.name, schema: FollowSchema }]),
        forwardRef(() => UsersModule),
    ],
    controllers: [FollowsController],
    providers: [FollowsService],
    exports: [FollowsService],
})
export class FollowsModule { }
