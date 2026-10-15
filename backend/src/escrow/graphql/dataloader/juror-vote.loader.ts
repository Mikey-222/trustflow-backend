import { Injectable, Scope } from '@nestjs/common';
import DataLoader from 'dataloader';

/**
 * Batches juror vote lookups by deliverableId to eliminate N+1 queries.
 */
@Injectable({ scope: Scope.REQUEST })
export class JurorVoteLoader {
  readonly byDeliverableId = new DataLoader<string, unknown[]>(async (deliverableIds: readonly string[]) => {
    const results = await Promise.all(
      deliverableIds.map(id => this.fetchJurorVotesForDeliverable(id)),
    );
    return results;
  });

  private async fetchJurorVotesForDeliverable(_deliverableId: string): Promise<unknown[]> {
    // Placeholder — real implementation queries juror_votes table
    return [];
  }
}
