import { Resolver, Query, Args, ResolveField, Parent } from '@nestjs/graphql';
import { EscrowType } from './types/escrow.type';
import { MilestoneType } from './types/milestone.type';
import { DeliverableType } from './types/deliverable.type';
import { JurorVoteType } from './types/juror-vote.type';
import { UserProfileType } from './types/user-profile.type';
import { EscrowService } from '../escrow.service';
import { MilestoneLoader } from './dataloader/milestone.loader';
import { DeliverableLoader } from './dataloader/deliverable.loader';
import { JurorVoteLoader } from './dataloader/juror-vote.loader';
import { UserProfileLoader } from './dataloader/user-profile.loader';
import { Inject } from '@nestjs/common';

@Resolver(() => EscrowType)
export class EscrowResolver {
  constructor(
    @Inject(EscrowService) private readonly escrowService: EscrowService,
    @Inject(MilestoneLoader) private readonly milestoneLoader: MilestoneLoader,
    @Inject(DeliverableLoader) private readonly deliverableLoader: DeliverableLoader,
    @Inject(JurorVoteLoader) private readonly jurorVoteLoader: JurorVoteLoader,
    @Inject(UserProfileLoader) private readonly userProfileLoader: UserProfileLoader,
  ) {}

  @Query(() => [EscrowType])
  async escrows(): Promise<EscrowType[]> {
    return this.escrowService.findAll() as unknown as EscrowType[];
  }

  @Query(() => EscrowType, { nullable: true })
  async escrow(@Args('id') id: string): Promise<EscrowType | null> {
    return this.escrowService.findById(id) as unknown as EscrowType | null;
  }

  @ResolveField(() => [MilestoneType], { nullable: true })
  async milestones(@Parent() escrow: EscrowType): Promise<MilestoneType[]> {
    const milestones = await this.milestoneLoader.byEscrowId.load(escrow.id);
    return milestones as MilestoneType[];
  }

  @ResolveField(() => UserProfileType, { nullable: true })
  async depositorProfile(@Parent() escrow: EscrowType): Promise<UserProfileType | null> {
    const profile = await this.userProfileLoader.byWalletAddress.load(escrow.depositor);
    return (profile as UserProfileType) ?? null;
  }

  @ResolveField(() => UserProfileType, { nullable: true })
  async beneficiaryProfile(@Parent() escrow: EscrowType): Promise<UserProfileType | null> {
    const profile = await this.userProfileLoader.byWalletAddress.load(escrow.beneficiary);
    return (profile as UserProfileType) ?? null;
  }
}

@Resolver(() => MilestoneType)
export class MilestoneResolver {
  constructor(
    @Inject(DeliverableLoader) private readonly deliverableLoader: DeliverableLoader,
  ) {}

  @ResolveField(() => [DeliverableType], { nullable: true })
  async deliverables(@Parent() milestone: MilestoneType): Promise<DeliverableType[]> {
    const deliverables = await this.deliverableLoader.byMilestoneId.load(milestone.id);
    return deliverables as DeliverableType[];
  }
}

@Resolver(() => DeliverableType)
export class DeliverableResolver {
  constructor(
    @Inject(JurorVoteLoader) private readonly jurorVoteLoader: JurorVoteLoader,
  ) {}

  @ResolveField(() => [JurorVoteType], { nullable: true })
  async jurorVotes(@Parent() deliverable: DeliverableType): Promise<JurorVoteType[]> {
    const votes = await this.jurorVoteLoader.byDeliverableId.load(deliverable.id);
    return votes as JurorVoteType[];
  }
}
