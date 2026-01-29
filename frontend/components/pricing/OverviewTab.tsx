'use client';

import { useMemo } from 'react';
import { usePricingStore } from '@/lib/stores/pricingStore';
import { getEffectiveSalary, isGSAPosition, getGSARateForYear, reverseEngineerGSARate } from '@/lib/utils/salaryHelpers';
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
// Metric Card Component
function MetricCard({
  title,
  value,
  subtitle
}: {
  title: string;
  value: string;
  subtitle: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <h3 className="text-3xl font-bold text-foreground mt-2">{value}</h3>
            <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Cost Breakdown Bar Component
function CostBreakdownBar({
  label,
  amount,
  percentage,
  color
}: {
  label: string;
  amount: number;
  percentage: number;
  color: string;
}) {
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="text-sm font-semibold text-muted-foreground">
          ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          <span className="ml-2 text-xs">({percentage.toFixed(1)}%)</span>
        </span>
      </div>
      <div className="h-3 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full ${color} transition-all duration-500`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

export default function OverviewTab() {
  const {
    positions,
    subcontractors,
    travel,
    odcs,
    surge,  // NEW: Surge option data
    rates,
    escalationRates,
    totalYears,
    extensions,
    advancedModeVersion,
  } = usePricingStore();

  // Calculate all costs with FBLR breakdown
  const costMetrics = useMemo(() => {
    // Calculate prime labor components directly from positions and current rates
    let directLaborTotal = 0;
    let fringeTotal = 0;
    let ohOnsiteTotal = 0;
    let ohOffsiteTotal = 0;
    let gaTotal = 0;
    let primeFeeTotal = 0;
    let primeLaborTotal = 0;

    positions.forEach((pos) => {
      // Skip positions assigned to subcontractors (they're counted in subcontractor totals)
      if (pos.assigned_subcontractor_id) {
        return;
      }

      const isGSA = isGSAPosition(pos);

      Object.entries(pos.hours_per_year).forEach(([yearStr, hours]) => {
        const yearNum = parseInt(yearStr);

        if (isGSA) {
          // GSA positions: Reverse engineer for DISPLAY purposes
          // The GSA rate is the final FBLR, but we show it broken down
          // as if it were calculated with indirect rates (for consistency in overview)
          const originalGsaRate = getGSARateForYear(pos, yearNum);

          // Apply discount if set by user
          const discountRate = pos.gsa_discount_rate || 0;
          const gsaRate = originalGsaRate * (1 - discountRate);

          const breakdown = reverseEngineerGSARate(gsaRate, rates);

          // IMPORTANT: For GSA, the breakdown is ONLY for display purposes
          // The actual cost is ALWAYS gsaRate * hours (independent of indirect rates)
          const dlAmount = breakdown.dlRate * hours;
          const fringeAmount = breakdown.fringe * hours;
          const ohAmount = breakdown.oh * hours;
          const gaAmount = breakdown.ga * hours;
          const feeAmount = breakdown.fee * hours;
          // Use GSA rate directly for total (NOT breakdown.fblr)
          const totalAmount = gsaRate * hours;

          directLaborTotal += dlAmount;
          fringeTotal += fringeAmount;
          // Track OH by location type (default to On-Site for GSA positions)
          if (pos.location_type === 'Off-Site') {
            ohOffsiteTotal += ohAmount;
          } else {
            ohOnsiteTotal += ohAmount;
          }
          gaTotal += gaAmount;
          primeFeeTotal += feeAmount;
          primeLaborTotal += totalAmount;
        } else {
          // BLS positions: Calculate with indirect rates and escalation
          // Use getEffectiveSalary to handle multi-select wage averaging
          const baseWage = getEffectiveSalary(pos);

          // Skip if no valid wage or hours
          if (!baseWage || baseWage === 0 || !pos.standard_fte_hours || pos.standard_fte_hours === 0) {
            return;
          }

          // Apply compound escalation for years after year 1
          let wage = baseWage;
          for (let y = 1; y < yearNum; y++) {
            const escKey = `${y}_to_${y + 1}`;
            const escRate = escalationRates[escKey] || 0;
            wage *= (1 + escRate);
          }

          // IMPORTANT: Calculate hourly rate using STANDARD FTE hours from contract, not actual hours
          // This ensures consistent hourly rate for partial years (like 6-month extensions)
          const dlRate = wage / pos.standard_fte_hours;
          const dlAmount = dlRate * hours;

          const fringe = dlRate * rates.fringe;
          const fringeAmount = fringe * hours;

          // Determine which OH rate to use based on location_type
          // Fallback: oh_onsite/oh_offsite → oh → 0.0711
          const ohOnsite = rates.oh_onsite !== undefined ? rates.oh_onsite : (rates.oh !== undefined ? rates.oh : 0.0711);
          const ohOffsite = rates.oh_offsite !== undefined ? rates.oh_offsite : (rates.oh !== undefined ? rates.oh : 0.0711);
          const locType = pos.location_type || 'On-Site';
          const ohRate = locType === 'On-Site' ? ohOnsite : ohOffsite;
          const oh = (dlRate + fringe) * ohRate;
          const ohAmount = oh * hours;

          const ga = (dlRate + fringe + oh) * rates.ga;
          const gaAmount = ga * hours;

          const fee = (dlRate + fringe + oh + ga) * rates.fee;
          const feeAmount = fee * hours;

          // FBLR includes fee for UI display
          const fblr = dlRate + fringe + oh + ga + fee;
          const totalAmount = fblr * hours;

          directLaborTotal += dlAmount;
          fringeTotal += fringeAmount;
          // Track OH by location type
          if (locType === 'On-Site') {
            ohOnsiteTotal += ohAmount;
          } else {
            ohOffsiteTotal += ohAmount;
          }
          gaTotal += gaAmount;
          primeLaborTotal += totalAmount;
          primeFeeTotal += feeAmount;
        }
      });
    });


    // Subcontractor costs with escalation (including OT)
    let subcontractorTotal = 0;
    const subOTMultiplier = rates.ot_multiplier || 1.5;

    subcontractors.forEach((sub) => {
      sub.positions.forEach((pos) => {
        Object.entries(pos.hours_per_year).forEach(([yearStr, hours]) => {
          const yearNum = parseInt(yearStr);
          // Apply compound escalation
          let escalatedRate = pos.rate;
          for (let y = 1; y < yearNum; y++) {
            const escKey = `${y}_to_${y + 1}`;
            const escRate = escalationRates[escKey] || 0;
            escalatedRate *= (1 + escRate);
          }

          // Regular hours cost
          subcontractorTotal += escalatedRate * hours;

          // OT hours cost
          const otHours = pos.ot_hours_per_year?.[yearStr] || 0;
          if (otHours > 0) {
            subcontractorTotal += escalatedRate * subOTMultiplier * otHours;
          }
        });
      });
    });

    // Passthrough costs (S&MH + G&A on sub labor)
    const passthroughTotal = subcontractorTotal * ((rates.smh || 0) + (rates.ga_passthrough || 0));

    // Fee calculation - primeFeeTotal already accumulated from positions loop
    // Sub fee is calculated separately
    const subFee = subcontractorTotal * (rates.sub_fee || 0);
    const feeTotal = primeFeeTotal + subFee;

    // Travel costs (separate from ODCs) - Apply G&A rate and escalation
    let travelTotal = 0;
    travel.forEach((travelItem) => {
      Object.entries(travelItem.amount_per_year).forEach(([yearStr, amount]) => {
        const yearNum = parseInt(yearStr);
        let escalatedAmount = amount;

        // Apply compound escalation if flag is set
        if (travelItem.escalate) {
          for (let y = 1; y < yearNum; y++) {
            const escKey = `${y}_to_${y + 1}`;
            const escRate = escalationRates[escKey] || 0;
            escalatedAmount *= (1 + escRate);
          }
        }

        const travelWithGA = escalatedAmount * (1 + rates.ga);
        travelTotal += travelWithGA;
      });
    });

    // ODC costs - Apply S&MH rate and escalation
    let odcTotal = 0;
    odcs.forEach((odc) => {
      Object.entries(odc.amount_per_year).forEach(([yearStr, amount]) => {
        const yearNum = parseInt(yearStr);
        let escalatedAmount = amount;

        // Apply compound escalation if flag is set
        if (odc.escalate) {
          for (let y = 1; y < yearNum; y++) {
            const escKey = `${y}_to_${y + 1}`;
            const escRate = escalationRates[escKey] || 0;
            escalatedAmount *= (1 + escRate);
          }
        }

        const odcWithSMH = escalatedAmount * (1 + (rates.smh || 0));
        odcTotal += odcWithSMH;
      });
    });

    // NEW: Overtime (OT) costs - Calculate from OT hours × OT multiplier
    let otTotal = 0;
    const otMultiplier = rates.ot_multiplier || 1.5;  // Default 1.5x (time-and-a-half)

    positions.forEach((pos) => {
      // Skip positions assigned to subcontractors (they're counted in subcontractor totals)
      if (pos.assigned_subcontractor_id) {
        return;
      }

      const isGSA = isGSAPosition(pos);

      Object.entries(pos.ot_hours_per_year || {}).forEach(([yearStr, otHours]) => {
        if (otHours <= 0) return;

        const yearNum = parseInt(yearStr);

        if (isGSA) {
          // GSA: Use discounted GSA rate
          const originalGsaRate = getGSARateForYear(pos, yearNum);
          const discountRate = pos.gsa_discount_rate || 0;
          const discountedGsaRate = originalGsaRate * (1 - discountRate);

          // OT cost = Discounted GSA Rate × OT Multiplier × OT Hours
          otTotal += discountedGsaRate * otMultiplier * otHours;
        } else {
          // BLS: Calculate FBLR with escalation, then apply OT multiplier
          const baseWage = getEffectiveSalary(pos);
          const fteHours = pos.standard_fte_hours || 2080;

          // Get escalated wage for this year
          let escalatedWage = baseWage;
          for (let y = 1; y < yearNum; y++) {
            const escKey = `${y}_to_${y + 1}`;
            const escRate = escalationRates[escKey] || 0;
            escalatedWage *= (1 + escRate);
          }

          // Calculate FBLR
          const dlRate = escalatedWage / fteHours;
          const fringe = dlRate * rates.fringe;
          const locationType = pos.location_type || 'On-Site';
          const ohRate = locationType === 'On-Site' ? rates.oh_onsite : rates.oh_offsite;
          const oh = (dlRate + fringe) * ohRate;
          const ga = (dlRate + fringe + oh) * rates.ga;
          const fee = (dlRate + fringe + oh + ga) * rates.fee;
          const fblr = dlRate + fringe + oh + ga + fee;

          // OT cost = FBLR × OT Multiplier × OT Hours
          otTotal += fblr * otMultiplier * otHours;
        }
      });
    });

    // NEW: Surge costs - Calculate from base prime labor × surge percentage × surge multiplier
    let surgeTotal = 0;
    if (surge && surge.percentage) {
      const surgePercentage = surge.percentage;
      const surgeMultiplier = rates.surge_multiplier || 1.15;  // Default 1.15x (15% premium)

      // Surge is based on base prime labor cost (not including OT)
      surgeTotal = primeLaborTotal * surgePercentage * surgeMultiplier;
    }

    // Grand total: primeLaborTotal already includes prime fee (via FBLR), so only add subFee
    const grandTotal = primeLaborTotal + subFee + subcontractorTotal + passthroughTotal + travelTotal + odcTotal + otTotal + surgeTotal;

    return {
      directLaborTotal,
      fringeTotal,
      ohOnsiteTotal,
      ohOffsiteTotal,
      ohTotal: ohOnsiteTotal + ohOffsiteTotal,
      gaTotal,
      primeLaborTotal,
      subcontractorTotal,
      passthroughTotal,
      feeTotal,
      travelTotal,
      odcTotal,
      otTotal,  // NEW: Overtime costs
      surgeTotal,  // NEW: Surge costs
      grandTotal,
    };
  }, [positions, subcontractors, travel, odcs, surge, rates, escalationRates, advancedModeVersion]);

  // Calculate year-by-year breakdown
  const yearBreakdown = useMemo(() => {
    const breakdown: Record<string, {
      directLabor: number;
      fringe: number;
      ohOnsite: number;
      ohOffsite: number;
      oh: number;
      ga: number;
      subcontractor: number;
      passthrough: number;
      fee: number;
      travel: number;
      odc: number;
      ot: number;
      surge: number;
      total: number;
    }> = {};

    // Initialize years
    for (let i = 1; i <= totalYears; i++) {
      breakdown[i] = {
        directLabor: 0,
        fringe: 0,
        ohOnsite: 0,
        ohOffsite: 0,
        oh: 0,  // Combined OH total
        ga: 0,
        subcontractor: 0,
        passthrough: 0,
        fee: 0,
        travel: 0,
        odc: 0,
        ot: 0,
        surge: 0,
        total: 0,
      };
    }

    // Define OT multiplier for use throughout calculations
    const otMultiplier = rates.ot_multiplier || 1.5;

    // Prime labor components by year (DL, Fringe, OH, G&A) - calculate directly from positions
    positions.forEach((pos) => {
      // Skip positions assigned to subcontractors (they're counted in subcontractor totals)
      if (pos.assigned_subcontractor_id) {
        return;
      }

      const isGSA = pos.wage_source === 'gsa';

      Object.entries(pos.hours_per_year).forEach(([yearStr, hours]) => {
        const yearNum = parseInt(yearStr);
        if (!breakdown[yearStr]) return;

        if (isGSA) {
          // GSA positions: Reverse engineer for DISPLAY purposes
          const gsaRate = getGSARateForYear(pos, yearNum);
          const gsaBreakdown = reverseEngineerGSARate(gsaRate, rates);

          const dlAmount = gsaBreakdown.dlRate * hours;
          const fringeAmount = gsaBreakdown.fringe * hours;
          const ohAmount = gsaBreakdown.oh * hours;
          const gaAmount = gsaBreakdown.ga * hours;

          breakdown[yearStr].directLabor += dlAmount;
          breakdown[yearStr].fringe += fringeAmount;
          // Track OH by location type (default to On-Site for GSA positions)
          if (pos.location_type === 'Off-Site') {
            breakdown[yearStr].ohOffsite += ohAmount;
          } else {
            breakdown[yearStr].ohOnsite += ohAmount;
          }
          breakdown[yearStr].oh += ohAmount;
          breakdown[yearStr].ga += gaAmount;
        } else {
          // BLS positions: Calculate with indirect rates and escalation
          // Use getEffectiveSalary to handle multi-select wage averaging
          const baseWage = getEffectiveSalary(pos);

          // Skip if no valid wage or hours
          if (!baseWage || baseWage === 0 || !pos.standard_fte_hours || pos.standard_fte_hours === 0) {
            return;
          }

          // Apply compound escalation for years after year 1
          let wage = baseWage;
          for (let y = 1; y < yearNum; y++) {
            const escKey = `${y}_to_${y + 1}`;
            const escRate = escalationRates[escKey] || 0;
            wage *= (1 + escRate);
          }

          // IMPORTANT: Calculate hourly rate using STANDARD FTE hours from contract, not actual hours
          // This ensures consistent hourly rate for partial years (like 6-month extensions)
          const dlRate = wage / pos.standard_fte_hours;
          const dlAmount = dlRate * hours;

          const fringe = dlRate * rates.fringe;
          const fringeAmount = fringe * hours;

          // Determine which OH rate to use based on location_type
          // Fallback: oh_onsite/oh_offsite → oh → 0.0711
          const ohOnsite = rates.oh_onsite !== undefined ? rates.oh_onsite : (rates.oh !== undefined ? rates.oh : 0.0711);
          const ohOffsite = rates.oh_offsite !== undefined ? rates.oh_offsite : (rates.oh !== undefined ? rates.oh : 0.0711);
          const locType = pos.location_type || 'On-Site';
          const ohRate = locType === 'On-Site' ? ohOnsite : ohOffsite;
          const oh = (dlRate + fringe) * ohRate;
          const ohAmount = oh * hours;

          const ga = (dlRate + fringe + oh) * rates.ga;
          const gaAmount = ga * hours;

          breakdown[yearStr].directLabor += dlAmount;
          breakdown[yearStr].fringe += fringeAmount;
          // Track OH by location type (use locType which has default)
          if (locType === 'On-Site') {
            breakdown[yearStr].ohOnsite += ohAmount;
          } else {
            breakdown[yearStr].ohOffsite += ohAmount;
          }
          breakdown[yearStr].oh += ohAmount;
          breakdown[yearStr].ga += gaAmount;
        }
      });
    });

    // Subcontractor by year with escalation (including OT)
    subcontractors.forEach((sub) => {
      sub.positions.forEach((pos) => {
        Object.entries(pos.hours_per_year).forEach(([year, hours]) => {
          if (breakdown[year]) {
            const yearNum = parseInt(year);
            // Apply compound escalation
            let escalatedRate = pos.rate;
            for (let y = 1; y < yearNum; y++) {
              const escKey = `${y}_to_${y + 1}`;
              const escRate = escalationRates[escKey] || 0;
              escalatedRate *= (1 + escRate);
            }

            // Regular hours cost
            breakdown[year].subcontractor += escalatedRate * hours;

            // OT hours cost
            const otHours = pos.ot_hours_per_year?.[year] || 0;
            if (otHours > 0) {
              breakdown[year].subcontractor += escalatedRate * otMultiplier * otHours;
            }
          }
        });
      });
    });

    // Passthrough by year
    Object.keys(breakdown).forEach((year) => {
      breakdown[year].passthrough =
        breakdown[year].subcontractor * ((rates.smh || 0) + (rates.ga_passthrough || 0));
    });

    // Fee by year
    Object.keys(breakdown).forEach((year) => {
      const yearData = breakdown[year];
      const primeLabor = yearData.directLabor + yearData.fringe + yearData.oh + yearData.ga;
      const primeFee = primeLabor * rates.fee;
      const subFee = yearData.subcontractor * (rates.sub_fee || 0);
      breakdown[year].fee = primeFee + subFee;
    });

    // Travel by year - Apply G&A rate and escalation
    travel.forEach((travelItem) => {
      Object.entries(travelItem.amount_per_year).forEach(([year, amount]) => {
        if (breakdown[year]) {
          const yearNum = parseInt(year);
          let escalatedAmount = amount;

          // Apply compound escalation if flag is set
          if (travelItem.escalate) {
            for (let y = 1; y < yearNum; y++) {
              const escKey = `${y}_to_${y + 1}`;
              const escRate = escalationRates[escKey] || 0;
              escalatedAmount *= (1 + escRate);
            }
          }

          const travelWithGA = escalatedAmount * (1 + rates.ga);
          breakdown[year].travel += travelWithGA;
        }
      });
    });

    // ODC by year - Apply S&MH rate and escalation
    odcs.forEach((odc) => {
      Object.entries(odc.amount_per_year).forEach(([year, amount]) => {
        if (breakdown[year]) {
          const yearNum = parseInt(year);
          let escalatedAmount = amount;

          // Apply compound escalation if flag is set
          if (odc.escalate) {
            for (let y = 1; y < yearNum; y++) {
              const escKey = `${y}_to_${y + 1}`;
              const escRate = escalationRates[escKey] || 0;
              escalatedAmount *= (1 + escRate);
            }
          }

          const odcWithSMH = escalatedAmount * (1 + (rates.smh || 0));
          breakdown[year].odc += odcWithSMH;
        }
      });
    });

    // Calculate OT costs by year
    positions.forEach((pos) => {
      // Skip positions assigned to subcontractors (they're counted in subcontractor totals)
      if (pos.assigned_subcontractor_id) {
        return;
      }

      const isGSA = isGSAPosition(pos);

      Object.entries(pos.ot_hours_per_year || {}).forEach(([yearStr, otHours]) => {
        if (otHours <= 0 || !breakdown[yearStr]) return;
        const yearNum = parseInt(yearStr);

        if (isGSA) {
          const originalGsaRate = getGSARateForYear(pos, yearNum);
          const discountRate = pos.gsa_discount_rate || 0;
          const discountedGsaRate = originalGsaRate * (1 - discountRate);
          breakdown[yearStr].ot += discountedGsaRate * otMultiplier * otHours;
        } else {
          const baseWage = getEffectiveSalary(pos);
          const fteHours = pos.standard_fte_hours || 2080;

          // Get escalated wage for this year
          let escalatedWage = baseWage;
          for (let y = 1; y < yearNum; y++) {
            const escKey = `${y}_to_${y + 1}`;
            const escRate = escalationRates[escKey] || 0;
            escalatedWage *= (1 + escRate);
          }

          // Calculate FBLR
          const dlRate = escalatedWage / fteHours;
          const fringe = dlRate * rates.fringe;
          const locationType = pos.location_type || 'On-Site';
          const ohRate = locationType === 'On-Site' ? rates.oh_onsite : rates.oh_offsite;
          const oh = (dlRate + fringe) * ohRate;
          const ga = (dlRate + fringe + oh) * rates.ga;
          const fee = (dlRate + fringe + oh + ga) * rates.fee;
          const fblr = dlRate + fringe + oh + ga + fee;

          breakdown[yearStr].ot += fblr * otMultiplier * otHours;
        }
      });
    });

    // Calculate surge costs by year
    if (surge && surge.percentage) {
      const surgePercentage = surge.percentage;
      const surgeMultiplier = rates.surge_multiplier || 1.15;

      Object.keys(breakdown).forEach((year) => {
        // Surge is based on base prime labor cost (not including OT)
        const primeLaborForYear = breakdown[year].directLabor + breakdown[year].fringe +
                                  breakdown[year].oh + breakdown[year].ga + breakdown[year].fee;
        breakdown[year].surge = primeLaborForYear * surgePercentage * surgeMultiplier;
      });
    }

    // Calculate totals
    Object.keys(breakdown).forEach((year) => {
      const data = breakdown[year];
      const primeLabor = data.directLabor + data.fringe + data.oh + data.ga;
      data.total = primeLabor + data.subcontractor + data.passthrough + data.fee + data.travel + data.odc + data.ot + data.surge;
    });

    return breakdown;
  }, [positions, subcontractors, travel, odcs, surge, rates, escalationRates, totalYears, advancedModeVersion]);

  const formatCurrency = (value: number) => {
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatPercentage = (value: number) => {
    return `${(value * 100).toFixed(2)}%`;
  };

  return (
    <div className="space-y-3">
      {/* Cost Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Contract Value"
          value={formatCurrency(costMetrics.grandTotal)}
          subtitle={`${totalYears} year${totalYears > 1 ? 's' : ''}`}
        />
        <MetricCard
          title="Prime Labor"
          value={formatCurrency(costMetrics.primeLaborTotal)}
          subtitle={`${((costMetrics.primeLaborTotal / costMetrics.grandTotal) * 100).toFixed(1)}% of total`}
        />
        <MetricCard
          title="Subcontractors"
          value={formatCurrency(costMetrics.subcontractorTotal)}
          subtitle={`${subcontractors.length} subcontractor${subcontractors.length !== 1 ? 's' : ''}`}
        />
        <MetricCard
          title="Fee"
          value={formatCurrency(costMetrics.feeTotal)}
          subtitle={`${((costMetrics.feeTotal / costMetrics.grandTotal) * 100).toFixed(1)}% of total`}
        />
      </div>

      {/* Cost Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Cost Breakdown by Category</CardTitle>
        </CardHeader>
        <CardContent>
          <CostBreakdownBar
            label="Direct Labor"
            amount={costMetrics.directLaborTotal}
            percentage={(costMetrics.directLaborTotal / costMetrics.grandTotal) * 100}
            color="bg-blue-600"
          />
          <CostBreakdownBar
            label="Fringe"
            amount={costMetrics.fringeTotal}
            percentage={(costMetrics.fringeTotal / costMetrics.grandTotal) * 100}
            color="bg-blue-600"
          />
          <CostBreakdownBar
            label="Overhead (OH On-Site)"
            amount={costMetrics.ohOnsiteTotal}
            percentage={(costMetrics.ohOnsiteTotal / costMetrics.grandTotal) * 100}
            color="bg-blue-600"
          />
          <CostBreakdownBar
            label="Overhead (OH Off-Site)"
            amount={costMetrics.ohOffsiteTotal}
            percentage={(costMetrics.ohOffsiteTotal / costMetrics.grandTotal) * 100}
            color="bg-blue-500"
          />
          <CostBreakdownBar
            label="G&A"
            amount={costMetrics.gaTotal}
            percentage={(costMetrics.gaTotal / costMetrics.grandTotal) * 100}
            color="bg-blue-600"
          />
          <CostBreakdownBar
            label="Subcontractor Labor"
            amount={costMetrics.subcontractorTotal}
            percentage={(costMetrics.subcontractorTotal / costMetrics.grandTotal) * 100}
            color="bg-blue-600"
          />
          <CostBreakdownBar
            label="Passthrough (S&MH + G&A on Subs)"
            amount={costMetrics.passthroughTotal}
            percentage={(costMetrics.passthroughTotal / costMetrics.grandTotal) * 100}
            color="bg-blue-600"
          />
          <CostBreakdownBar
            label="Fee"
            amount={costMetrics.feeTotal}
            percentage={(costMetrics.feeTotal / costMetrics.grandTotal) * 100}
            color="bg-blue-600"
          />
          {costMetrics.travelTotal > 0 && (
            <CostBreakdownBar
              label="Travel"
              amount={costMetrics.travelTotal}
              percentage={(costMetrics.travelTotal / costMetrics.grandTotal) * 100}
              color="bg-blue-600"
            />
          )}
          {costMetrics.odcTotal > 0 && (
            <CostBreakdownBar
              label="Other Direct Costs (ODC)"
              amount={costMetrics.odcTotal}
              percentage={(costMetrics.odcTotal / costMetrics.grandTotal) * 100}
              color="bg-blue-600"
            />
          )}
          {costMetrics.otTotal > 0 && (
            <CostBreakdownBar
              label="Overtime (OT)"
              amount={costMetrics.otTotal}
              percentage={(costMetrics.otTotal / costMetrics.grandTotal) * 100}
              color="bg-amber-600"
            />
          )}
          {costMetrics.surgeTotal > 0 && (
            <CostBreakdownBar
              label="Surge Capacity"
              amount={costMetrics.surgeTotal}
              percentage={(costMetrics.surgeTotal / costMetrics.grandTotal) * 100}
              color="bg-red-600"
            />
          )}
        </CardContent>
      </Card>

      {/* Year-by-Year Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Year-by-Year Cost Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-foreground">Year</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-foreground">Direct Labor</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-foreground">Fringe</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-foreground">OH On-Site</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-foreground">OH Off-Site</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-foreground">G&A</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-foreground">Subcontractors</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-foreground">Passthrough</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-foreground">Fee</th>
                  {costMetrics.travelTotal > 0 && (
                    <th className="text-right py-3 px-4 text-sm font-semibold text-foreground">Travel</th>
                  )}
                  {costMetrics.odcTotal > 0 && (
                    <th className="text-right py-3 px-4 text-sm font-semibold text-foreground">ODC</th>
                  )}
                  <th className="text-right py-3 px-4 text-sm font-semibold text-foreground bg-muted/30">Total</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(yearBreakdown).map(([year, data]) => {
                  const yearNum = parseInt(year);
                  const extension = extensions.find(ext => ext.year === yearNum);
                  const yearLabel = extension
                    ? extension.label
                    : (yearNum === 1 ? 'Base Period' : `Option Year ${yearNum - 1}`);

                  return (
                    <tr key={year} className="border-b border-border hover:bg-muted/20">
                      <td className="py-3 px-4 text-sm font-medium text-foreground">{yearLabel}</td>
                    <td className="py-3 px-4 text-sm text-right text-muted-foreground">
                      {formatCurrency(data.directLabor)}
                    </td>
                    <td className="py-3 px-4 text-sm text-right text-muted-foreground">
                      {formatCurrency(data.fringe)}
                    </td>
                    <td className="py-3 px-4 text-sm text-right text-muted-foreground">
                      {formatCurrency(data.ohOnsite)}
                    </td>
                    <td className="py-3 px-4 text-sm text-right text-muted-foreground">
                      {formatCurrency(data.ohOffsite)}
                    </td>
                    <td className="py-3 px-4 text-sm text-right text-muted-foreground">
                      {formatCurrency(data.ga)}
                    </td>
                    <td className="py-3 px-4 text-sm text-right text-muted-foreground">
                      {formatCurrency(data.subcontractor)}
                    </td>
                    <td className="py-3 px-4 text-sm text-right text-muted-foreground">
                      {formatCurrency(data.passthrough)}
                    </td>
                    <td className="py-3 px-4 text-sm text-right text-muted-foreground">
                      {formatCurrency(data.fee)}
                    </td>
                    {costMetrics.travelTotal > 0 && (
                      <td className="py-3 px-4 text-sm text-right text-muted-foreground">
                        {formatCurrency(data.travel)}
                      </td>
                    )}
                    {costMetrics.odcTotal > 0 && (
                      <td className="py-3 px-4 text-sm text-right text-muted-foreground">
                        {formatCurrency(data.odc)}
                      </td>
                    )}
                    <td className="py-3 px-4 text-sm text-right font-semibold text-foreground bg-muted/30">
                      {formatCurrency(data.total)}
                    </td>
                  </tr>
                  );
                })}
                {/* Total Row */}
                <tr className="bg-muted/50 font-semibold">
                  <td className="py-3 px-4 text-sm text-foreground">Total</td>
                  <td className="py-3 px-4 text-sm text-right text-foreground">
                    {formatCurrency(costMetrics.directLaborTotal)}
                  </td>
                  <td className="py-3 px-4 text-sm text-right text-foreground">
                    {formatCurrency(costMetrics.fringeTotal)}
                  </td>
                  <td className="py-3 px-4 text-sm text-right text-foreground">
                    {formatCurrency(costMetrics.ohOnsiteTotal)}
                  </td>
                  <td className="py-3 px-4 text-sm text-right text-foreground">
                    {formatCurrency(costMetrics.ohOffsiteTotal)}
                  </td>
                  <td className="py-3 px-4 text-sm text-right text-foreground">
                    {formatCurrency(costMetrics.gaTotal)}
                  </td>
                  <td className="py-3 px-4 text-sm text-right text-foreground">
                    {formatCurrency(costMetrics.subcontractorTotal)}
                  </td>
                  <td className="py-3 px-4 text-sm text-right text-foreground">
                    {formatCurrency(costMetrics.passthroughTotal)}
                  </td>
                  <td className="py-3 px-4 text-sm text-right text-foreground">
                    {formatCurrency(costMetrics.feeTotal)}
                  </td>
                  {costMetrics.travelTotal > 0 && (
                    <td className="py-3 px-4 text-sm text-right text-foreground">
                      {formatCurrency(costMetrics.travelTotal)}
                    </td>
                  )}
                  {costMetrics.odcTotal > 0 && (
                    <td className="py-3 px-4 text-sm text-right text-foreground">
                      {formatCurrency(costMetrics.odcTotal)}
                    </td>
                  )}
                  <td className="py-3 px-4 text-sm text-right text-foreground bg-primary/10">
                    {formatCurrency(costMetrics.grandTotal)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Rates Reference */}
      <Card>
        <CardHeader>
          <CardTitle>Rates Reference</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Indirect Rates */}
            <div>
              <h3 className="text-sm font-bold text-foreground mb-3">Indirect Rates</h3>
              <div className="space-y-2">
                <div className="flex justify-between items-center py-2 px-3 bg-muted/30 rounded">
                  <span className="text-sm text-muted-foreground">Fringe:</span>
                  <span className="text-sm font-medium text-foreground">
                    {formatPercentage(rates.fringe)}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 px-3 bg-muted/30 rounded">
                  <span className="text-sm text-muted-foreground">OH (On-Site):</span>
                  <span className="text-sm font-medium text-foreground">
                    {formatPercentage(rates.oh_onsite)}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 px-3 bg-muted/30 rounded">
                  <span className="text-sm text-muted-foreground">OH (Off-Site):</span>
                  <span className="text-sm font-medium text-foreground">
                    {formatPercentage(rates.oh_offsite)}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 px-3 bg-muted/30 rounded">
                  <span className="text-sm text-muted-foreground">G&A:</span>
                  <span className="text-sm font-medium text-foreground">
                    {formatPercentage(rates.ga)}
                  </span>
                </div>
              </div>
            </div>

            {/* Fee Rates */}
            <div>
              <h3 className="text-sm font-bold text-foreground mb-3">Fee Rates</h3>
              <div className="space-y-2">
                <div className="flex justify-between items-center py-2 px-3 bg-muted/30 rounded">
                  <span className="text-sm text-muted-foreground">Prime Labor Fee:</span>
                  <span className="text-sm font-medium text-foreground">
                    {formatPercentage(rates.fee)}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 px-3 bg-muted/30 rounded">
                  <span className="text-sm text-muted-foreground">Sub Labor Fee:</span>
                  <span className="text-sm font-medium text-foreground">
                    {formatPercentage(rates.sub_fee || 0)}
                  </span>
                </div>
              </div>
            </div>

            {/* Passthrough Rates */}
            <div>
              <h3 className="text-sm font-bold text-foreground mb-3">Passthrough Rates</h3>
              <div className="space-y-2">
                <div className="flex justify-between items-center py-2 px-3 bg-muted/30 rounded">
                  <span className="text-sm text-muted-foreground">S&MH:</span>
                  <span className="text-sm font-medium text-foreground">
                    {formatPercentage(rates.smh || 0)}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 px-3 bg-muted/30 rounded">
                  <span className="text-sm text-muted-foreground">G&A Passthrough:</span>
                  <span className="text-sm font-medium text-foreground">
                    {formatPercentage(rates.ga_passthrough || 0)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Escalation Rates */}
          {Object.keys(escalationRates).length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-bold text-foreground mb-3">Escalation Rates</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {Object.entries(escalationRates)
                  .filter(([, rate]) => rate !== undefined)
                  .map(([key, rate]) => (
                    <div key={key} className="flex justify-between items-center py-2 px-3 bg-blue-50 rounded border border-blue-100">
                      <span className="text-sm text-muted-foreground">
                        Year {key.replace('_to_', ' → ')}:
                      </span>
                      <span className="text-sm font-medium text-foreground">
                        {formatPercentage(rate!)}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
