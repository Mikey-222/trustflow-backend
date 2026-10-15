import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { join } from 'path';
import { EscrowResolver } from './escrow.resolver';
import { EscrowService } from '../escrow.service';
import { EscrowType } from './types/escrow.type';
import { MilestoneType } from './types/milestone.type';
import { DeliverableType } from './types/deliverable.type';
import { UserProfileType } from './types/user-profile.type';
import { DataLoaderModule } from './dataloader/dataloader.module';

@Module({
  imports: [
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: join(process.cwd(), 'src/escrow/graphql/schema.gql'),
      sortSchema: true,
      playground: process.env.NODE_ENV !== 'production',
      context: ({ req, res }) => ({ req, res }),
    }),
    DataLoaderModule,
  ],
  providers: [
    EscrowResolver,
    EscrowService,
    EscrowType,
    MilestoneType,
    DeliverableType,
    UserProfileType,
  ],
  exports: [GraphQLModule],
})
export class EscrowGraphQLModule {}
