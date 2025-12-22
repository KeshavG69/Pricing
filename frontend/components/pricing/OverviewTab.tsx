'use client';

import { useMemo } from 'react';
import { usePricingStore } from '@/lib/stores/pricingStore';
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
    proposalName,
    solicitationNumber,
    aggregates,
    subcontractors,
    odcs,
    rates,
    escalationRates,
    totalYears,
  } = usePricingStore();

  // Calculate all costs with FBLR breakdown
  const costMetrics = useMemo(() => {
    // Prime labor components (from aggregates - already calculated)
    const directLaborTotal = aggregates.totalDL;
    const fringeTotal = aggregates.totalFringe;
    const ohTotal = aggregates.totalOH;
    const gaTotal = aggregates.totalGA;
    const primeLaborTotal = aggregates.totalFBLR;

    // Subcontractor costs
    let subcontractorTotal = 0;
    subcontractors.forEach((sub) => {
      sub.positions.forEach((pos) => {
        Object.values(pos.hours_per_year).forEach((hours) => {
          subcontractorTotal += hours * pos.rate;
        });
      });
    });

    // Passthrough costs (S&MH + G&A on sub labor)
    const passthroughTotal = subcontractorTotal * ((rates.smh || 0) + (rates.ga_passthrough || 0));

    // Fee costs (separate for prime vs sub)
    const primeFee = primeLaborTotal * rates.fee;
    const subFee = subcontractorTotal * (rates.sub_fee || 0);
    const feeTotal = primeFee + subFee;

    // ODC costs
    let odcTotal = 0;
    odcs.forEach((odc) => {
      Object.values(odc.amount_per_year).forEach((amount) => {
        odcTotal += amount;
      });
    });

    // Grand total
    const grandTotal = primeLaborTotal + subcontractorTotal + passthroughTotal + feeTotal + odcTotal;

    return {
      directLaborTotal,
      fringeTotal,
      ohTotal,
      gaTotal,
      primeLaborTotal,
      subcontractorTotal,
      passthroughTotal,
      feeTotal,
      odcTotal,
      grandTotal,
    };
  }, [aggregates, subcontractors, odcs, rates]);

  // Calculate year-by-year breakdown
  const yearBreakdown = useMemo(() => {
    const breakdown: Record<string, {
      directLabor: number;
      fringe: number;
      oh: number;
      ga: number;
      subcontractor: number;
      passthrough: number;
      fee: number;
      odc: number;
      total: number;
    }> = {};

    // Initialize years
    for (let i = 1; i <= totalYears; i++) {
      breakdown[i] = {
        directLabor: 0,
        fringe: 0,
        oh: 0,
        ga: 0,
        subcontractor: 0,
        passthrough: 0,
        fee: 0,
        odc: 0,
        total: 0,
      };
    }

    // Prime labor components by year (DL, Fringe, OH, G&A)
    Object.entries(aggregates.byYear).forEach(([year, yearData]) => {
      if (breakdown[year]) {
        breakdown[year].directLabor = yearData.dl;
        breakdown[year].fringe = yearData.fringe;
        breakdown[year].oh = yearData.oh;
        breakdown[year].ga = yearData.ga;
      }
    });

    // Subcontractor by year
    subcontractors.forEach((sub) => {
      sub.positions.forEach((pos) => {
        Object.entries(pos.hours_per_year).forEach(([year, hours]) => {
          if (breakdown[year]) {
            breakdown[year].subcontractor += hours * pos.rate;
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

    // ODC by year
    odcs.forEach((odc) => {
      Object.entries(odc.amount_per_year).forEach(([year, amount]) => {
        if (breakdown[year]) {
          breakdown[year].odc += amount;
        }
      });
    });

    // Calculate totals
    Object.keys(breakdown).forEach((year) => {
      const data = breakdown[year];
      const primeLabor = data.directLabor + data.fringe + data.oh + data.ga;
      data.total = primeLabor + data.subcontractor + data.passthrough + data.fee + data.odc;
    });

    return breakdown;
  }, [aggregates, subcontractors, odcs, rates, totalYears]);

  const formatCurrency = (value: number) => {
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatPercentage = (value: number) => {
    return `${(value * 100).toFixed(2)}%`;
  };

  return (
    <div className="space-y-6">
      {/* Proposal Info */}
      <div className="mb-4">
        <h2 className="text-sm font-bold text-foreground">{proposalName}</h2>
        {solicitationNumber && (
          <p className="text-xs text-muted-foreground mt-1">
            Solicitation: {solicitationNumber}
          </p>
        )}
      </div>

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
            label="Overhead (OH)"
            amount={costMetrics.ohTotal}
            percentage={(costMetrics.ohTotal / costMetrics.grandTotal) * 100}
            color="bg-blue-600"
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
          {costMetrics.odcTotal > 0 && (
            <CostBreakdownBar
              label="ODC & Travel"
              amount={costMetrics.odcTotal}
              percentage={(costMetrics.odcTotal / costMetrics.grandTotal) * 100}
              color="bg-blue-600"
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
                  <th className="text-right py-3 px-4 text-sm font-semibold text-foreground">OH</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-foreground">G&A</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-foreground">Subcontractors</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-foreground">Passthrough</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-foreground">Fee</th>
                  {costMetrics.odcTotal > 0 && (
                    <th className="text-right py-3 px-4 text-sm font-semibold text-foreground">ODC</th>
                  )}
                  <th className="text-right py-3 px-4 text-sm font-semibold text-foreground bg-muted/30">Total</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(yearBreakdown).map(([year, data]) => (
                  <tr key={year} className="border-b border-border hover:bg-muted/20">
                    <td className="py-3 px-4 text-sm font-medium text-foreground">Year {year}</td>
                    <td className="py-3 px-4 text-sm text-right text-muted-foreground">
                      {formatCurrency(data.directLabor)}
                    </td>
                    <td className="py-3 px-4 text-sm text-right text-muted-foreground">
                      {formatCurrency(data.fringe)}
                    </td>
                    <td className="py-3 px-4 text-sm text-right text-muted-foreground">
                      {formatCurrency(data.oh)}
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
                    {costMetrics.odcTotal > 0 && (
                      <td className="py-3 px-4 text-sm text-right text-muted-foreground">
                        {formatCurrency(data.odc)}
                      </td>
                    )}
                    <td className="py-3 px-4 text-sm text-right font-semibold text-foreground bg-muted/30">
                      {formatCurrency(data.total)}
                    </td>
                  </tr>
                ))}
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
                    {formatCurrency(costMetrics.ohTotal)}
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
                  <span className="text-sm text-muted-foreground">Overhead (OH):</span>
                  <span className="text-sm font-medium text-foreground">
                    {formatPercentage(rates.oh)}
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
