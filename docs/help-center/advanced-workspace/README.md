# Advanced Workspace Features

Master FBLR calculations, indirect rates, and advanced pricing features to create accurate government cost proposals.

## What You'll Learn

This category covers advanced features for power users who need deep control over pricing calculations:

- **FBLR Breakdowns**: View and understand how fully burdened labor rates are calculated
- **Indirect Rates**: Configure Fringe, Overhead, G&A, and Fee percentages
- **Escalation**: Apply year-over-year rate increases with compound calculations
- **Wage Selection**: Choose percentiles and average multiple wage sources
- **SOC Codes**: Change occupational classifications to adjust wage data
- **GSA Positions**: Work with pre-negotiated government schedule rates
- **Position Splitting**: Understand automatic FTE-based position division

## Quick Navigation

### Essential Reading (Start Here)
These articles explain core concepts everyone should understand:

1. [**Understanding FBLR Calculations**](02-fblr-calculations.md) - Learn the cascade formula (P0, 5 min read)
2. [**Indirect Rates Explained**](03-indirect-rates.md) - What Fringe, OH, G&A, and Fee mean (P0, 5 min read)
3. [**Understanding Wage Percentiles**](06-wage-percentiles.md) - 25th, 50th, 75th percentiles (P0, 5 min read)

### Hands-On Tutorials
Step-by-step guides for common tasks:

4. [**Advanced Mode: FBLR Breakdown View**](01-advanced-mode.md) - Enable detailed cost breakdowns (P1, 10 min)
5. [**Adjusting Indirect Rates**](04-adjusting-rates.md) - Edit rates in the Rates Panel (P1, 5 min)
6. [**Escalation Rates**](05-escalation-rates.md) - Configure year-over-year increases (P1, 5 min)
7. [**Multi-Select Wage Averaging**](07-wage-averaging.md) - Average multiple percentiles (P1, 5 min)
8. [**Changing SOC Codes**](08-changing-soc-codes.md) - Manually override occupational codes (P1, 5 min)

### Specialized Topics
For specific scenarios:

9. [**GSA Wage Schedule Positions**](09-gsa-positions.md) - Work with pre-negotiated rates (P1, 10 min)
10. [**Position Splitting (>1920 Hours)**](10-position-splitting.md) - Why positions auto-split (P2, 5 min)
11. [**Viewing Wage Data Details**](11-wage-data-tab.md) - Explore BLS wage data (P1, 5 min)

## Common Questions

**Q: What is FBLR?**
A: Fully Burdened Labor Rate - the total hourly cost including direct labor plus all indirect costs (Fringe, OH, G&A, Fee). See [Understanding FBLR Calculations](02-fblr-calculations.md).

**Q: How do I adjust indirect rates for my company?**
A: Click the "Rates" panel in the pricing workspace and edit Fringe, OH, G&A, and Fee percentages. Changes apply to all positions and save automatically. See [Adjusting Indirect Rates](04-adjusting-rates.md).

**Q: Why are there two overhead rates (On-Site and Off-Site)?**
A: Government contracts often have different overhead rates for on-site vs off-site work. PriceIQ applies the correct rate based on each position's location type. See [Indirect Rates Explained](03-indirect-rates.md).

**Q: What's the difference between 25th, 50th, and 75th percentile wages?**
A: These represent different experience levels in BLS data. PriceIQ auto-selects based on position experience: < 3 years = 25th, 3 to < 6 years = 50th, ≥ 6 years = 75th. See [Understanding Wage Percentiles](06-wage-percentiles.md).

**Q: Why did my position split into multiple rows?**
A: Positions exceeding 1920 hours (FTE threshold) automatically split to reflect multiple full-time employees. Example: 5760 hours → 3 positions of 1920 hours each. See [Position Splitting](10-position-splitting.md).

**Q: Why don't GSA rates change when I adjust indirect rates?**
A: GSA rates are already fully burdened (pre-negotiated with the government). Indirect rates only affect the breakdown display, not the total cost. See [GSA Wage Schedule Positions](09-gsa-positions.md).

## Key Concepts

**FBLR Cascade Formula:**
```
Direct Labor (DL) = Annual Wage ÷ Standard FTE Hours
+ Fringe = DL × Fringe Rate
+ Overhead (OH) = (DL + Fringe) × OH Rate
+ G&A = (DL + Fringe + OH) × G&A Rate
+ Fee = (DL + Fringe + OH + G&A) × Fee Rate
= Fully Burdened Labor Rate (FBLR)
```

**Compound Escalation:**
```
Year 3 Rate = Year 1 Rate × (1 + Esc_1_to_2) × (1 + Esc_2_to_3)
```

**FTE Threshold:**
- Standard FTE = 1920 hours/year (40 hours/week × 48 weeks)
- Positions >1920 hours auto-split into multiple FTEs
- Example: 5760 hours = 3.0 FTEs → 3 positions of 1920 hours each

## Who Should Read This Category?

**Pricing Managers & Proposal Leads:**
- Understand FBLR calculations for proposal defense
- Configure company-specific indirect rates
- Apply escalation to multi-year contracts

**Capture Managers:**
- Adjust wage percentiles based on team composition
- Work with GSA schedule positions
- Average multiple wage sources for blended rates

**Finance & Accounting:**
- Verify FBLR cascade calculations
- Audit indirect rate applications
- Review wage data sources (BLS vs GSA)

**Government Contractors (New to PriceIQ):**
- Learn how PriceIQ calculates costs
- Understand BLS OEWS wage data
- Configure rates for your organization

## Before You Start

**Prerequisites:**
- Complete the [Pricing Workspace Overview](../pricing-workspace/01-workspace-overview.md)
- Understand [Basic Pricing Grid](../pricing-workspace/03-pricing-grid-basics.md)
- Know how to [Edit Hours & Rates](../pricing-workspace/05-editing-hours-rates.md)

**Recommended Background:**
- Familiarity with government cost proposals (FAR Part 15)
- Understanding of indirect rate structures
- Basic knowledge of labor categories and SOC codes

## Related Categories

- **[Pricing Workspace](../pricing-workspace/README.md)** - Basic editing and navigation
- **[Multi-Year Contracts](../multi-year-contracts/README.md)** - Base period and option years
- **[Subcontractors & ODCs](../subcontractors-odcs/README.md)** - Teaming and direct costs
- **[Data Sources](../data-sources/README.md)** - BLS, GSA, and SOC codes explained

## Need More Help?

- **Video Tutorials**: [Advanced Mode Walkthrough](01-advanced-mode.md#video-tutorial)
- **Support**: support@priceiq.com
- **Community**: community.priceiq.com
- **Training**: Schedule a 1-on-1 session

---

**Priority Legend:**
- **P0** = Essential reading for all users
- **P1** = Important for regular users
- **P2** = Helpful for specific scenarios

**Time Estimates:**
- Complete Essential Reading: 15 minutes
- Complete All Tutorials: 1 hour
- Master All Topics: 2 hours

**Last Updated**: January 15, 2026
