import { z } from 'zod';
import { XLM_AMOUNT_FORMAT_MESSAGE, XLM_AMOUNT_REGEX } from '../common/amount';

/** Shared across every Stellar address field in this module so the format check can't drift. */
export const STELLAR_ADDRESS_REGEX = /^G[A-Z2-7]{55}$/;

/** Rejects sub-stroop precision at the boundary rather than rounding it away later. */
const XlmAmountSchema = z.string().regex(XLM_AMOUNT_REGEX, XLM_AMOUNT_FORMAT_MESSAGE);

export const CreateEscrowSchema = z
  .object({
    depositor: z.string().regex(STELLAR_ADDRESS_REGEX, 'Invalid Stellar address'),
    beneficiary: z.string().regex(STELLAR_ADDRESS_REGEX, 'Invalid Stellar address'),
    amountXLM: XlmAmountSchema,
    deadlineBlocks: z.number().int().positive().optional(),
  })
  .refine(data => data.depositor !== data.beneficiary, {
    message: 'depositor and beneficiary must not be the same address',
    path: ['beneficiary'],
  });

export type CreateEscrowDto = z.infer<typeof CreateEscrowSchema>;

/**
 * Fields editable on an existing escrow. `beneficiary` is intentionally the only one:
 * it is a sensitive, money-directing field, so the service layer refuses to change it
 * once the escrow has been funded (see `EscrowService.changeBeneficiary`).
 */
export const UpdateEscrowSchema = z
  .object({
    beneficiary: z.string().regex(STELLAR_ADDRESS_REGEX, 'Invalid Stellar address').optional(),
  })
  .refine(dto => dto.beneficiary !== undefined, {
    message: 'At least one updatable field must be provided',
  });

export type UpdateEscrowDto = z.infer<typeof UpdateEscrowSchema>;

export const ReleaseEscrowSchema = z.object({
  escrowId: z.string().min(1),
  signerAddress: z.string().regex(STELLAR_ADDRESS_REGEX),
});

export type ReleaseEscrowDto = z.infer<typeof ReleaseEscrowSchema>;

// The request body carries only the dispute details. The escrow comes from the `:id` path
// parameter and the initiator from the authenticated JWT, so neither belongs in the body (#800).
export const RaiseDisputeSchema = z.object({
  // Optional: callers may omit it, and the controllers then record 'No reason provided'.
  reason: z.string().min(10).max(500).optional(),
  evidenceUrl: z.string().url().optional(),
});

export type RaiseDisputeDto = z.infer<typeof RaiseDisputeSchema>;

export const BatchApproveMilestoneSchema = z.object({
  milestoneIds: z.array(z.string().min(1)).min(1).max(100),
  signerAddress: z.string().regex(STELLAR_ADDRESS_REGEX),
});

export type BatchApproveMilestoneDto = z.infer<typeof BatchApproveMilestoneSchema>;

export interface BatchApproveResult {
  succeeded: Array<{ id: string; status: string }>;
  failed: Array<{ id: string; reason: string }>;
}
