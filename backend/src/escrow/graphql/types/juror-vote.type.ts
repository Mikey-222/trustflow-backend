import { ObjectType, Field, ID } from '@nestjs/graphql';

@ObjectType('JurorVote')
export class JurorVoteType {
  @Field(() => ID)
  id!: string;

  @Field()
  deliverableId!: string;

  @Field()
  juror!: string;

  @Field()
  vote!: string;

  @Field({ nullable: true })
  rationale?: string;

  @Field()
  createdAt!: string;
}
