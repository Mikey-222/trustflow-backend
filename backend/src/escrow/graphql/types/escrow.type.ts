import { ObjectType, Field, ID, registerEnumType } from '@nestjs/graphql';
import { MilestoneType } from './milestone.type';

export enum EscrowStatusGraphQLEnum {
  PENDING = 'pending',
  ACTIVE = 'active',
  RELEASED = 'released',
  DISPUTED = 'disputed',
  CANCELLED = 'cancelled',
}

registerEnumType(EscrowStatusGraphQLEnum, {
  name: 'EscrowStatus',
  description: 'Lifecycle status of an escrow',
});

@ObjectType('Escrow')
export class EscrowType {
  @Field(() => ID)
  id!: string;

  @Field()
  depositor!: string;

  @Field()
  beneficiary!: string;

  @Field()
  amountXLM!: string;

  @Field()
  status!: string;

  @Field()
  createdAt!: string;

  @Field({ nullable: true })
  contractEscrowId?: string;

  @Field({ nullable: true })
  stellarTxHash?: string;

  @Field({ nullable: true })
  disputeReason?: string;

  @Field({ nullable: true })
  disputedAt?: string;

  @Field({ nullable: true })
  splitPercentage?: number;

  @Field(() => [MilestoneType], { nullable: true })
  milestones?: MilestoneType[];
}
