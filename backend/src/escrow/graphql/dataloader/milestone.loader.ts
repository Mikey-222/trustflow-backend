import { Injectable, Scope } from '@nestjs/common';
import DataLoader from 'dataloader';
import { EscrowService } from '../../escrow.service';

/**
 * Batches milestone lookups by escrowId to eliminate N+1 queries.
 * Scoped to each GraphQL request so caches don't leak between requests.
 */
@Injectable({ scope: Scope.REQUEST })
export class MilestoneLoader {
  constructor(private readonly escrowService: EscrowService) {}

  readonly byEscrowId = new DataLoader<string, unknown[]>(async (escrowIds: readonly string[]) => {
    // Batch-fetch all milestones for all escrow IDs in one pass
    const results = await Promise.all(
      escrowIds.map(async id => {
        // In production this would be a single query with WHERE escrow_id = ANY($1)
        const escrow = await this.escrowService.findById(id);
        if (!escrow) return [];
        // Placeholder: in a real implementation, fetch milestones from DB
        return this.fetchMilestonesForEscrow(id);
      }),
    );
    return results;
  });

  private async fetchMilestonesForEscrow(_escrowId: string): Promise<unknown[]> {
    // Placeholder — real implementation queries milestones table
    return [];
  }
}
