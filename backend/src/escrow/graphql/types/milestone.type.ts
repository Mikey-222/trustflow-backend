import { ObjectType, Field, ID } from '@nestjs/graphql';
import { DeliverableType } from './deliverable.type';

@ObjectType('Milestone')
export class MilestoneType {
  @Field(() => ID)
  id!: string;

  @Field()
  escrowId!: string;

  @Field()
  title!: string;

  @Field({ nullable: true })
  description?: string;

  @Field()
  amountXLM!: string;

  @Field()
  status!: string;

  @Field({ nullable: true })
  dueDate?: string;

  @Field({ nullable: true })
  completedAt?: string;

  @Field(() => [DeliverableType], { nullable: true })
  deliverables?: DeliverableType[];
}
