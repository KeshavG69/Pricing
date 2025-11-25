/**
 * Calculator - JavaScript port of Python calculation_service.py
 *
 * All calculations use exact 2-decimal rounding: Math.round(value * 100) / 100
 * Matches Python behavior precisely for financial calculations.
 */

class Calculator {
  /**
   * Calculate Fully Burdened Labor Rate (FBLR)
   *
   * Cascading calculation where each indirect rate applies to cumulative subtotal:
   * - Fringe applies to DL
   * - OH applies to (DL + Fringe)
   * - G&A applies to (DL + Fringe + OH)
   *
   * @param {number} annualWage - Annual salary in dollars
   * @param {number} hours - Annual hours (typically 1880 for full-time)
   * @param {number} fringeRate - Fringe benefits rate (e.g., 0.247 for 24.7%)
   * @param {number} ohRate - Overhead rate (e.g., 0.0711 for 7.11%)
   * @param {number} gaRate - General & Administrative rate (e.g., 0.2243 for 22.43%)
   * @returns {{dlRate: number, fringe: number, oh: number, ga: number, fblr: number}}
   */
  static calculateFBLR(annualWage, hours, fringeRate, ohRate, gaRate) {
    // Step 1: Calculate direct labor hourly rate
    const dlRate = Math.round((annualWage / hours) * 100) / 100;

    // Step 2: Apply wrap rates (each applies to cumulative subtotal)
    const fringe = Math.round(dlRate * fringeRate * 100) / 100;
    const subtotal1 = dlRate + fringe;

    const oh = Math.round(subtotal1 * ohRate * 100) / 100;
    const subtotal2 = subtotal1 + oh;

    const ga = Math.round(subtotal2 * gaRate * 100) / 100;
    const fblr = Math.round((subtotal2 + ga) * 100) / 100;

    return { dlRate, fringe, oh, ga, fblr };
  }

  /**
   * Calculate escalated rate for a future year using compound escalation
   *
   * @param {number} baseRate - Starting rate
   * @param {Object} escalationRates - Year-to-year escalation rates (e.g., {"1_to_2": 0.0272})
   * @param {number} fromYear - Starting year (typically 1)
   * @param {number} toYear - Target year
   * @returns {number} Escalated rate
   */
  static calculateYearRate(baseRate, escalationRates, fromYear, toYear) {
    let currentRate = baseRate;

    for (let year = fromYear; year < toYear; year++) {
      const key = `${year}_to_${year + 1}`;
      const escRate = escalationRates[key] || 0.0;
      currentRate = currentRate * (1 + escRate);
    }

    return Math.round(currentRate * 100) / 100;
  }

  /**
   * Calculate position costs across multiple years
   *
   * @param {Object} position - Position data with baseWage and hoursPerYear
   * @param {Object} escalationRates - Year-to-year escalation rates
   * @param {Object} indirectRates - Fringe, OH, G&A rates
   * @param {number} feeRate - Fee (profit) rate
   * @param {number} totalYears - Number of contract years
   * @returns {Array} Yearly breakdown with rate, hours, amount for each year
   */
  static calculatePositionYears(position, escalationRates, indirectRates, feeRate, totalYears) {
    const yearlyData = [];

    for (let year = 1; year <= totalYears; year++) {
      const hours = position.hoursPerYear[year] || 0;

      // Escalate base wage for years > 1
      const escalatedWage = year === 1
        ? position.baseWage
        : this.calculateYearRate(position.baseWage, escalationRates, 1, year);

      // Calculate FBLR
      const fblr = this.calculateFBLR(
        escalatedWage,
        hours || 1880, // Use 1880 as default if hours is 0 (to avoid division by zero)
        indirectRates.fringe,
        indirectRates.oh,
        indirectRates.ga
      );

      // Calculate fee (profit) - note: NOT included in FBLR, added separately
      const fee = Math.round(fblr.fblr * feeRate * 100) / 100;
      const finalRate = Math.round((fblr.fblr + fee) * 100) / 100;
      const amount = Math.round(finalRate * hours * 100) / 100;

      yearlyData.push({
        year,
        rate: finalRate,
        hours,
        amount,
        breakdown: { ...fblr, fee }
      });
    }

    return yearlyData;
  }

  /**
   * Calculate subcontractor markup (Fee + S&MH)
   *
   * Cascading calculation:
   * 1. Add fee to subcontractor's base rate
   * 2. Add S&MH to (base + fee)
   *
   * Handles pass-through cap for contracts like SeaPort-NxG (8% cap)
   *
   * @param {number} subBaseRate - Subcontractor's base hourly rate
   * @param {number} feeRate - Prime's fee rate on subcontractor
   * @param {number} smhRate - Subcontractor & Material Handling rate
   * @param {boolean} hasMaxCap - Whether contract has pass-through cap
   * @param {number} maxCapRate - Maximum allowed pass-through rate (e.g., 0.08 for 8%)
   * @returns {{subBaseRate: number, fee: number, smh: number, finalRate: number, appliedFeeRate: number}}
   */
  static calculateSubcontractorMarkup(subBaseRate, feeRate, smhRate, hasMaxCap = false, maxCapRate = null) {
    // Determine effective fee rate based on cap
    let appliedFeeRate;
    if (hasMaxCap && maxCapRate !== null) {
      appliedFeeRate = maxCapRate - smhRate;
      if (appliedFeeRate < 0) {
        throw new Error('Max pass-through rate cannot be met with given S&MH rate');
      }
    } else {
      appliedFeeRate = feeRate;
    }

    // Step 1: Add fee to subcontractor's rate
    const fee = Math.round(subBaseRate * appliedFeeRate * 100) / 100;
    const withFee = Math.round((subBaseRate + fee) * 100) / 100;

    // Step 2: Add S&MH to the subtotal (cascading)
    const smh = Math.round(withFee * smhRate * 100) / 100;
    const finalRate = Math.round((withFee + smh) * 100) / 100;

    return {
      subBaseRate,
      fee,
      smh,
      finalRate,
      appliedFeeRate
    };
  }

  /**
   * Calculate Other Direct Costs (ODC) across multiple years
   *
   * Supports:
   * - Fixed or escalating amounts
   * - Optional G&A adder
   *
   * @param {Object} odc - ODC data with amountYear1, escalate, applyAdder flags
   * @param {Object} escalationRates - Year-to-year escalation rates
   * @param {number} gaAdderRate - G&A adder rate for ODCs
   * @param {number} totalYears - Number of contract years
   * @returns {Array} Yearly breakdown with baseAmount, gaAdder, totalAmount
   */
  static calculateODCYears(odc, escalationRates, gaAdderRate, totalYears) {
    const yearlyData = [];

    for (let year = 1; year <= totalYears; year++) {
      let baseAmount = odc.amountYear1;

      // Escalate if requested and year > 1
      if (odc.escalate && year > 1) {
        baseAmount = this.calculateYearRate(odc.amountYear1, escalationRates, 1, year);
      }

      // Apply G&A adder if requested
      const gaAdder = odc.applyAdder ? Math.round(baseAmount * gaAdderRate * 100) / 100 : 0;
      const totalAmount = Math.round((baseAmount + gaAdder) * 100) / 100;

      yearlyData.push({
        year,
        baseAmount,
        gaAdder,
        totalAmount
      });
    }

    return yearlyData;
  }

  /**
   * Calculate total fee (profit) on labor
   *
   * Separate fee rates for prime and subcontractor labor
   *
   * @param {number} primeLaborTotal - Total prime labor cost (before fee)
   * @param {number} subLaborTotal - Total subcontractor labor cost (before fee)
   * @param {number} primeFeeRate - Fee rate for prime labor
   * @param {number} subFeeRate - Fee rate for subcontractor labor
   * @returns {{primeFee: number, subFee: number, totalFee: number}}
   */
  static calculateFeeOnLabor(primeLaborTotal, subLaborTotal, primeFeeRate, subFeeRate) {
    const primeFee = Math.round(primeLaborTotal * primeFeeRate * 100) / 100;
    const subFee = Math.round(subLaborTotal * subFeeRate * 100) / 100;
    const totalFee = Math.round((primeFee + subFee) * 100) / 100;

    return { primeFee, subFee, totalFee };
  }

  /**
   * Select appropriate wage percentile based on experience years
   *
   * Rules:
   * - 0-2 years: 25th percentile
   * - 3-5 years: 50th percentile
   * - 6-8 years: 75th percentile
   * - 9+ years: 90th percentile
   *
   * @param {number} experience - Years of experience
   * @returns {string} Percentile (e.g., "25th", "50th", "75th", "90th")
   */
  static selectWagePercentileByExperience(experience) {
    if (experience === null || experience === undefined) {
      return '50th'; // Default
    }

    if (experience <= 2) return '25th';
    if (experience <= 5) return '50th';
    if (experience <= 8) return '75th';
    return '90th';
  }

  /**
   * Get wage value for a specific percentile from job data
   *
   * @param {Object} jobData - Job data with wage_10th, wage_25th, etc.
   * @param {string} percentile - Percentile (e.g., "50th")
   * @returns {number|null} Wage value or null if not found
   */
  static getWageForPercentile(jobData, percentile) {
    const key = `wage_${percentile}`;
    return jobData[key] || null;
  }
}

// Make Calculator available globally
if (typeof window !== 'undefined') {
  window.Calculator = Calculator;
}

// For Node.js (testing)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Calculator;
}
