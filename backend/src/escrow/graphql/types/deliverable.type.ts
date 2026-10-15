import { ObjectType, Field, ID, registerEnumType } from '@nestjs/graphql';
import { JurorVoteType } from './juror-vote.type';

export enum DeliverableStatusGraphQLEnum {
  PENDING = 'pending',
  PINNED = 'pinned',
  FAILED = 'failed',
}

registerEnumType(DeliverableStatusGraphQLEnum, {
  name: 'DeliverableStatus',
  description: 'Status of a deliverable',
});

@ObjectType('Deliverable')
export class DeliverableType {
  @Field(() => ID)
  id!: string;

  @Field()
  gigId!: string;

  @Field()
  milestoneId!: string;

  @Field()
  freelancer!: string;

  @Field()
  cid!: string;

  @Field()
  filename!: string;

  @Field()
  size!: number;

  @Field()
  status!: string;

  @Field()
  createdAt!: string;

  @Field()
  updatedAt!: string;

  @Field(() => [JurorVoteType], { nullable: true })
  jurorVotes?: JurorVoteType[];
}
