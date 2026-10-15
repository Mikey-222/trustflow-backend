import { Injectable, Scope } from '@nestjs/common';
import DataLoader from 'dataloader';

/**
 * Batches user profile lookups by wallet address to eliminate N+1 queries.
 */
@Injectable({ scope: Scope.REQUEST })
export class UserProfileLoader {
  readonly byWalletAddress = new DataLoader<string, unknown>(async (addresses: readonly string[]) => {
    const results = await Promise.all(
      addresses.map(addr => this.fetchProfileByAddress(addr)),
    );
    return results;
  });

  private async fetchProfileByAddress(_address: string): Promise<unknown> {
    // Placeholder — real implementation queries user_profiles table
    return {};
  }
}
