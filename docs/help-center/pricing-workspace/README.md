# Pricing Workspace

Master PriceIQ's Excel-like pricing interface where you'll build, edit, and finalize your government contractor cost proposals.

## What Is the Pricing Workspace?

The Pricing Workspace is your main editing environment after documents are processed. It's designed to feel like Excel with powerful automation behind the scenes:

- **Excel-like grid** with frozen columns and inline editing
- **Multi-tab interface** to view different aspects of your proposal
- **Real-time calculations** that update as you type
- **Auto-save** so you never lose work
- **Context menus** for quick actions

## Who Should Read This Category?

**Essential for:**
- New users learning to edit proposals (read articles 01-05, 09)
- Anyone adjusting hours, rates, or labor categories
- Users who need to understand what each column means

**Also useful for:**
- Users managing On-Site vs Off-Site positions (06)
- Anyone adding or deleting positions manually (07, 08)
- Troubleshooting auto-save behavior (09)

## Quick Navigation

### Getting Started (Priority 0 - Read First)
1. [**Workspace Overview**](01-workspace-overview.md) - Tour of the 5-tab interface
2. [**Overview Tab**](02-overview-tab.md) - Cost analytics dashboard
3. [**Pricing Grid Basics**](03-pricing-grid-basics.md) - How to use the Excel-like grid
4. [**Position Columns**](04-position-columns.md) - What each column means
5. [**Editing Hours & Rates**](05-editing-hours-rates.md) - Inline editing tutorial
9. [**Auto-Save**](09-auto-save.md) - How saving works

### Intermediate Features (Priority 1)
6. [**Location Types**](06-location-types.md) - On-Site vs Off-Site overhead rates
7. [**Adding Positions**](07-adding-positions.md) - Manual position entry
8. [**Deleting Positions**](08-deleting-positions.md) - Remove positions safely

## Key Concepts

### The 5-Tab Interface

Your pricing workspace has 5 tabs at the top:

1. **Source Files** - View uploaded documents (PDFs, Word files)
2. **Overview** - Cost analytics, totals, and visual breakdown
3. **Pricing Workspace** - Main spreadsheet for labor positions (YOU ARE HERE MOST OF THE TIME)
4. **Wage Data** - Detailed percentile breakdown for each position
5. **Subcontractor Labor** - Subcontractor positions (appears after converting positions)

### Grid Features

The Pricing Workspace grid has:
- **Frozen Action Column** (left) - Three-dot menu (⋮) for context actions
- **Dynamic Year Columns** - Base Period, Option Year 1, Option Year 2, etc.
- **Frozen Total Column** (right) - Sum across all years
- **Editable Cells** - Click to edit hours, rates, or descriptions
- **Context Menu** - Right-click or click ⋮ for actions like "Change SOC Code" or "Convert to Subcontractor"

### Auto-Save Behavior

Changes save automatically after 2 seconds of inactivity. Watch for:
- **"Saved"** indicator (green checkmark) - Changes persisted to database
- **"Saving..."** indicator - Upload in progress
- **No indicator** - Waiting for you to stop typing (2-second debounce)

Some actions bypass auto-save and save immediately:
- Converting a position to subcontractor
- Deleting a position
- Changing SOC codes or salary percentiles

## Common Tasks

| Task | Article | Time |
|------|---------|------|
| Navigate between tabs | [Workspace Overview](01-workspace-overview.md) | 1 min |
| Edit position hours for a specific year | [Editing Hours & Rates](05-editing-hours-rates.md) | 2 min |
| Change a position to Off-Site | [Location Types](06-location-types.md) | 2 min |
| Add a new position manually | [Adding Positions](07-adding-positions.md) | 3 min |
| Delete an unwanted position | [Deleting Positions](08-deleting-positions.md) | 1 min |
| Understand why changes aren't saving | [Auto-Save](09-auto-save.md) | 3 min |

## What's NOT in This Category?

This category focuses on **basic workspace features**. For advanced topics, see:

- **FBLR Calculations & Indirect Rates** → [Advanced Workspace Features](../advanced-workspace/)
- **Subcontractors & ODCs** → [Subcontractors & ODCs](../subcontractors-odcs/)
- **Multi-Year Contract Setup** → [Multi-Year Contracts](../multi-year-contracts/)
- **SOC Code Changes & Wage Percentiles** → [Advanced Workspace Features](../advanced-workspace/)

## Learning Path

**For new users (15 minutes):**

1. [Workspace Overview](01-workspace-overview.md) - 3 min
2. [Overview Tab](02-overview-tab.md) - 3 min
3. [Pricing Grid Basics](03-pricing-grid-basics.md) - 4 min
4. [Editing Hours & Rates](05-editing-hours-rates.md) - 3 min
5. [Auto-Save](09-auto-save.md) - 2 min

**To become proficient (30 minutes):**

Complete the above, then:

6. [Position Columns](04-position-columns.md) - 5 min
7. [Location Types](06-location-types.md) - 3 min
8. [Adding Positions](07-adding-positions.md) - 4 min
9. [Deleting Positions](08-deleting-positions.md) - 2 min
10. [FBLR Calculations](../advanced-workspace/02-fblr-calculations.md) - 6 min

## Next Steps

After mastering the Pricing Workspace basics, explore:

1. **[Advanced Workspace Features](../advanced-workspace/)** - FBLR breakdowns, indirect rates, escalation
2. **[Subcontractors & ODCs](../subcontractors-odcs/)** - Manage teaming partners and direct costs
3. **[Multi-Year Contracts](../multi-year-contracts/)** - Set up base periods and option years
4. **[Export & Integration](../export-integration/)** - Generate Excel deliverables

---

**Last Updated**: January 15, 2026
**Relevant Version**: PriceIQ v2.0+
