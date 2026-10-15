import { ObjectType, Field, ID, registerEnumType } from '@nestjs/graphql';

export enum UserTypeGraphQLEnum {
  FREELANCER = 'freelancer',
  CLIENT = 'client',
  BOTH = 'both',
}

export enum UserStatusGraphQLEnum {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
}

registerEnumType(UserTypeGraphQLEnum, {
  name: 'UserType',
  description: 'Type of user on the platform',
});

registerEnumType(UserStatusGraphQLEnum, {
  name: 'UserStatus',
  description: 'Account status of the user',
});

@ObjectType('UserProfile')
export class UserProfileType {
  @Field(() => ID)
  id!: string;

  @Field()
  walletAddress!: string;

  @Field()
  name!: string;

  @Field({ nullable: true })
  bio?: string;

  @Field()
  userType!: string;

  @Field({ nullable: true })
  avatarUrl?: string;

  @Field({ nullable: true })
  email?: string;

  @Field()
  rating!: number;

  @Field()
  ratingCount!: number;

  @Field()
  completedJobs!: number;

  @Field()
  status!: string;

  @Field(() => [String], { nullable: true })
  skills?: string[];

  @Field({ nullable: true })
  totalEarned?: string;

  @Field({ nullable: true })
  totalSpent?: string;

  @Field()
  isVerified!: boolean;

  @Field()
  createdAt!: string;

  @Field()
  updatedAt!: string;

  @Field({ nullable: true })
  lastActiveAt?: string;
}
