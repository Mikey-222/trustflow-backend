import { Module } from '@nestjs/common';
import { DeliverableLoader } from './deliverable.loader';
import { JurorVoteLoader } from './juror-vote.loader';
import { MilestoneLoader } from './milestone.loader';
import { UserProfileLoader } from './user-profile.loader';

@Module({
  providers: [DeliverableLoader, JurorVoteLoader, MilestoneLoader, UserProfileLoader],
  exports: [DeliverableLoader, JurorVoteLoader, MilestoneLoader, UserProfileLoader],
})
export class DataLoaderModule {}
