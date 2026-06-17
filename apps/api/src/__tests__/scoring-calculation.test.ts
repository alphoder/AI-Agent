/**
 * Scoring calculation logic tests.
 *
 * The platform uses a weighted scoring formula:
 *   overall_score = sum(score/5 * weight/100) * 100
 *
 * Where each criterion has a score (1-5) and a weight (percentage, summing to 100).
 */

interface CriteriaScore {
  score: number;
  weight: number;
}

/**
 * Calculate weighted overall score from criteria scores.
 * Formula: sum(score/5 * weight/100) * 100
 */
function calculateWeightedScore(criteria: CriteriaScore[]): number {
  const raw = criteria.reduce((sum, c) => sum + (c.score / 5) * (c.weight / 100), 0);
  return Math.round(raw * 100 * 10) / 10; // Round to 1 decimal place
}

describe('Scoring Calculation', () => {
  describe('calculateWeightedScore', () => {
    it('calculates correct weighted score for mixed criteria', () => {
      const criteria: CriteriaScore[] = [
        { score: 5, weight: 40 },
        { score: 3, weight: 30 },
        { score: 4, weight: 30 },
      ];

      // (5/5 * 40/100 + 3/5 * 30/100 + 4/5 * 30/100) * 100
      // = (1.0 * 0.4 + 0.6 * 0.3 + 0.8 * 0.3) * 100
      // = (0.4 + 0.18 + 0.24) * 100
      // = 0.82 * 100
      // = 82.0
      const result = calculateWeightedScore(criteria);
      expect(result).toBe(82.0);
    });

    it('returns 100 when all scores are 5', () => {
      const criteria: CriteriaScore[] = [
        { score: 5, weight: 50 },
        { score: 5, weight: 30 },
        { score: 5, weight: 20 },
      ];

      expect(calculateWeightedScore(criteria)).toBe(100);
    });

    it('returns 20 when all scores are 1', () => {
      const criteria: CriteriaScore[] = [
        { score: 1, weight: 50 },
        { score: 1, weight: 30 },
        { score: 1, weight: 20 },
      ];

      // (1/5) * (sum of weights / 100) * 100 = 0.2 * 1.0 * 100 = 20
      expect(calculateWeightedScore(criteria)).toBe(20);
    });

    it('handles weights summing to 100', () => {
      const criteria: CriteriaScore[] = [
        { score: 4, weight: 25 },
        { score: 3, weight: 25 },
        { score: 5, weight: 25 },
        { score: 2, weight: 25 },
      ];

      // (4/5*0.25 + 3/5*0.25 + 5/5*0.25 + 2/5*0.25) * 100
      // = (0.2 + 0.15 + 0.25 + 0.1) * 100
      // = 0.7 * 100
      // = 70
      const result = calculateWeightedScore(criteria);
      expect(result).toBe(70);

      const totalWeight = criteria.reduce((sum, c) => sum + c.weight, 0);
      expect(totalWeight).toBe(100);
    });

    it('handles single criterion with full weight', () => {
      const criteria: CriteriaScore[] = [{ score: 4, weight: 100 }];

      // (4/5 * 1.0) * 100 = 80
      expect(calculateWeightedScore(criteria)).toBe(80);
    });

    it('handles unequal weight distributions', () => {
      const criteria: CriteriaScore[] = [
        { score: 5, weight: 70 },
        { score: 1, weight: 30 },
      ];

      // (1.0 * 0.7 + 0.2 * 0.3) * 100 = (0.7 + 0.06) * 100 = 76
      expect(calculateWeightedScore(criteria)).toBe(76);
    });

    it('returns 0 for empty criteria', () => {
      expect(calculateWeightedScore([])).toBe(0);
    });

    it('produces scores between 20 and 100 for valid inputs', () => {
      // With scores 1-5 and weights summing to 100, minimum is 20 and max is 100
      for (let s = 1; s <= 5; s++) {
        const result = calculateWeightedScore([{ score: s, weight: 100 }]);
        expect(result).toBeGreaterThanOrEqual(20);
        expect(result).toBeLessThanOrEqual(100);
      }
    });
  });
});
