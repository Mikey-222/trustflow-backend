import { CreateGigSchema, SearchGigsSchema, UpdateGigSchema } from './gig.dto';
import { XLM_AMOUNT_FORMAT_MESSAGE } from '../common/amount';

const CREATOR = `G${'A'.repeat(55)}`;
const VALID_GIG = { creator: CREATOR, title: 'Build an escrow audit report', budgetXLM: '250' };

describe('Gig DTO amount validation', () => {
  describe('CreateGigSchema', () => {
    it('accepts a budget with at most 7 decimal places', () => {
      expect(CreateGigSchema.parse({ ...VALID_GIG, budgetXLM: '100.1234567' }).budgetXLM).toBe(
        '100.1234567',
      );
    });

    it('rejects sub-stroop precision at creation time with a clear 400 message', () => {
      const result = CreateGigSchema.safeParse({ ...VALID_GIG, budgetXLM: '100.123456789' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(XLM_AMOUNT_FORMAT_MESSAGE);
        expect(result.error.issues[0].message).toContain('7 decimal places');
      }
    });
  });

  describe('UpdateGigSchema', () => {
    it('applies the same precision limit as creation', () => {
      expect(UpdateGigSchema.safeParse({ budgetXLM: '100.123456789' }).success).toBe(false);
      expect(UpdateGigSchema.safeParse({ budgetXLM: '100.1234567' }).success).toBe(true);
    });
  });

  describe('SearchGigsSchema', () => {
    it('applies the same precision limit to budget range filters', () => {
      expect(SearchGigsSchema.safeParse({ minBudgetXLM: '100.123456789' }).success).toBe(false);
      expect(SearchGigsSchema.safeParse({ maxBudgetXLM: '100.123456789' }).success).toBe(false);
      expect(SearchGigsSchema.safeParse({ minBudgetXLM: '100.1234567' }).success).toBe(true);
    });
  });
});
