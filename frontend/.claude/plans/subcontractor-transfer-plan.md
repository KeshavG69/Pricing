# Subcontractor Transfer & Delete Feature Plan

## Overview
Implement the ability to:
1. Transfer hours between subcontractors
2. Delete subcontractor → return hours to prime
3. Delete individual position from subcontractor → return hours to prime
4. Right-click context menu support

## Key Data Model Understanding

### Current State Structure
```typescript
// Basic positions (source of truth for hours)
positions: SpreadsheetPosition[] = {
  id, labor_category, hours_per_year, annual_wage, ...
}

// Advanced positions (derived from positions via transformToAdvanced)
positionsAdvanced: AdvancedPosition[] = {
  id, labor_category, breakdown: { [year]: { hours, dlRate, fringe, oh, ga, fee, fblr } }
}

// Subcontractors
subcontractors: Subcontractor[] = {
  id, name, positions: SubcontractorPosition[]
}

SubcontractorPosition = {
  labor_category, rate, hours_per_year, original_position_id
}
```

### Critical Insight
- `positions` is the SOURCE OF TRUTH for hours
- `transformToAdvanced()` reads from `positions` and generates `positionsAdvanced`
- When modifying hours, ALWAYS update `positions` first, then call `transformToAdvanced()`

## Implementation Steps

### Step 1: Update Types (types/index.ts)
Add `original_total_hours` to SubcontractorPosition:
```typescript
interface SubcontractorPosition {
  labor_category: string;
  rate: number;
  hours_per_year: Record<string, number>;
  original_position_id?: string;
  original_total_hours?: Record<string, number>; // NEW: Track original prime hours
  location_type?: string;
}
```

**Why?** We need to know what the ORIGINAL total hours were before any subcontractor allocation. This allows us to correctly calculate prime hours as: `original - sum(all_sub_hours)`

### Step 2: Update convertToSubcontractor (pricingStore.ts)
When converting a position to subcontractor, store `original_total_hours`:

```typescript
// In convertToSubcontractor:
// Calculate original_total_hours = current_prime_hours + hours_being_allocated
// (On first conversion, this equals the original prime hours)
// (On subsequent conversions, read from existing sub's original_total_hours)
```

### Step 3: Update deleteSubcontractor (pricingStore.ts)
When deleting a subcontractor:
1. For each position in the deleted sub:
   - Find the linked prime position via `original_position_id`
   - Calculate hours from OTHER subs linked to same prime
   - New prime hours = `original_total_hours - sum(other_subs_hours)`
2. Update `positions` array (basic positions)
3. Call `transformToAdvanced()` if in advanced mode
4. Remove the subcontractor

### Step 4: Add deleteSubcontractorPosition (pricingStore.ts)
New function to delete a single position:
1. Find the position to delete
2. Return hours to prime (same logic as deleteSubcontractor but for one position)
3. Remove position from subcontractor
4. If subcontractor has 0 positions, remove it entirely

### Step 5: Create TransferSubcontractorModal (new component)
Modal with:
- **From section**: Shows source subcontractor/position
  - Fixed display when opened from Subcontractor tab (`lockSource={true}`)
  - Dropdown selector when opened from Prime Labor tab (`lockSource={false}`)
- **To section**:
  - Radio: "Existing Subcontractor" or "New Subcontractor"
  - Dropdown to select existing sub (with source disabled)
  - Input for new sub name
- **Hours section**:
  - Input per year with placeholder "0"
  - "Set all years" quick input
  - Show available hours from source

### Step 6: Add transferSubcontractorHours (pricingStore.ts)
Transfer logic:
1. Subtract hours from source position
2. If source position has 0 hours remaining, remove it
3. Add hours to target:
   - If target has same labor_category with same original_position_id, merge
   - Otherwise create new position
4. Preserve `original_total_hours` in target
5. Update prime hours (recalculate based on total sub allocations)

### Step 7: Update SubcontractorSection
- Add context menu with right-click support
- Add "Transfer to Subcontractor" option
- Add "Delete Position" option (with confirmation dialog)
- Pass `lockSource={true}` to TransferSubcontractorModal

### Step 8: Update PrimeLaborSection
- Add "Transfer Subcontractor Hours" to context menu (when position has linked subs)
- Pass `lockSource={false}` to TransferSubcontractorModal

## Testing Checklist
1. [ ] Convert position to subcontractor - verify original_total_hours is stored
2. [ ] Convert same position to another sub - verify original_total_hours is preserved
3. [ ] Edit subcontractor hours - verify prime hours update correctly
4. [ ] Delete subcontractor - verify hours return to prime
5. [ ] Delete single position - verify hours return to prime
6. [ ] Transfer hours between subs - verify source decreases, target increases, prime unchanged
7. [ ] Transfer all hours from position - verify position is removed
8. [ ] All operations work in both basic and advanced mode

## File Changes Summary
1. `types/index.ts` - Add original_total_hours to SubcontractorPosition
2. `lib/stores/pricingStore.ts` - Modify convertToSubcontractor, deleteSubcontractor, add deleteSubcontractorPosition, add transferSubcontractorHours
3. `components/pricing/TransferSubcontractorModal.tsx` - New file
4. `components/pricing/SubcontractorSection.tsx` - Add context menu, delete position, transfer modal
5. `components/pricing/sections/PrimeLaborSection.tsx` - Add transfer option to context menu
