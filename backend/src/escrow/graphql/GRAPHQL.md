# GraphQL API

TrustFlow exposes a GraphQL endpoint at `/graphql` for querying nested escrow relations in a single request.

## Configuration

- **Driver**: Apollo Server (`@nestjs/apollo`)
- **Schema**: Code-first (decorators on TypeScript classes)
- **Schema file**: `src/escrow/graphql/schema.gql` (auto-generated)
- **Playground**: Enabled when `NODE_ENV !== 'production'`

## Types

| Type | Description |
|------|-------------|
| `Escrow` | Escrow contract with depositor, beneficiary, amount, status |
| `Milestone` | Milestone within an escrow (title, amount, status, due date) |
| `Deliverable` | Deliverable linked to a milestone (CID, filename, status) |
| `JurorVote` | Juror vote on a deliverable (juror, vote, rationale) |
| `UserProfile` | User profile (wallet address, name, rating, type) |

## Queries

### Get all escrows

```graphql
{
  escrows {
    id
    depositor
    beneficiary
    amountXLM
    status
    createdAt
  }
}
```

### Get a single escrow by ID

```graphql
{
  escrow(id: "esc-1") {
    id
    status
    amountXLM
  }
}
```

### Get full nested escrow details (Escrow → Milestones → Deliverables → JurorVotes)

```graphql
{
  escrow(id: "esc-1") {
    id
    depositor
    beneficiary
    amountXLM
    status
    milestones {
      id
      title
      status
      deliverables {
        id
        filename
        status
        jurorVotes {
          juror
          vote
        }
      }
    }
    depositorProfile {
      name
      userType
    }
    beneficiaryProfile {
      name
      userType
    }
  }
}
```

## DataLoader Batching

All nested relations use [DataLoader](https://github.com/graphql/dataloader) to eliminate N+1 query problems:

| Loader | Batches by | Scope |
|--------|-----------|-------|
| `MilestoneLoader` | `escrowId` | Per-request |
| `DeliverableLoader` | `milestoneId` | Per-request |
| `JurorVoteLoader` | `deliverableId` | Per-request |
| `UserProfileLoader` | `walletAddress` | Per-request |

Each loader is scoped to `Scope.REQUEST` so caches are fresh per GraphQL request and never leak between clients.

## Module Registration

The GraphQL module is registered in `AppModule`:

```typescript
import { EscrowGraphQLModule } from './escrow/graphql/escrow-graphql.module';

@Module({
  imports: [
    // ...
    EscrowGraphQLModule,
  ],
})
export class AppModule {}
```

## Example: Fetch All Escrow Details in a Single Query

```typescript
const query = `
  query GetEscrow($id: ID!) {
    escrow(id: $id) {
      id
      depositor
      beneficiary
      amountXLM
      status
      milestones {
        id
        title
        amountXLM
        status
        deliverables {
          id
          cid
          filename
          status
          jurorVotes {
            juror
            vote
          }
        }
      }
      depositorProfile {
        name
        userType
        rating
      }
      beneficiaryProfile {
        name
        userType
        rating
      }
    }
  }
`;

const result = await fetch('http://localhost:3000/graphql', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query, variables: { id: 'esc-1' } }),
});
```
