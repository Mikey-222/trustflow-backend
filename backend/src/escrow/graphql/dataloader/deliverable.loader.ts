import { Injectable, Scope } from '@nestjs/common';
import DataLoader from 'dataloader';

/**
 * Batches deliverable lookups by milestoneId to eliminate N+1 queries.
 */
@Injectable({ scope: Scope.REQUEST })
export class DeliverableLoader {
  readonly byMilestoneId = new DataLoader<string, unknown[]>(async (milestoneIds: readonly string[]) => {
    const results = await Promise.all(
      milestoneIds.map(id => this.fetchDeliverablesForMilestone(id)),
    );
    return results;
  });

  private async fetchDeliverablesForMilestone(_milestoneId: string): Promise<unknown[]> {
    // Placeholder — real implementation queries deliverables table
    return [];
  }
}
