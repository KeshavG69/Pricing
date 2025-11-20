import pandas as pd
import openpyxl

file_path = '/Users/keshav/Developer/Others/Pricing/Intprepix Volume III.xlsx'

print('='*120)
print('DETAILED ANALYSIS: Formulas, Indirect Rates, and Subcontractor Structure')
print('='*120)

# Load the workbook with formulas
wb = openpyxl.load_workbook(file_path)
sheet1 = wb['Cost Proposal Spreadsheet']

# Read with pandas for easier data analysis
df1 = pd.read_excel(file_path, sheet_name='Cost Proposal Spreadsheet', header=None)
df2 = pd.read_excel(file_path, sheet_name='Subcontractor Fee_MH Rate Table')

print('\n' + '='*120)
print('KEY SECTIONS - WHERE THINGS ARE')
print('='*120)

# Find key sections
sections = {
    'Prime Direct Labor Start': 9,
    'Prime Direct Labor End': 93,
    'Overhead Row': 95,
    'Fringe Row': 96,
    'G&A Row': 97,
    'Prime Fee Row': 156,
    'Subcontractor Section Start': 105,
    'Subcontractor Section End': 142,
    'Total Subcontractor Cost': 145,
}

for key, row_num in sections.items():
    if row_num < len(df1):
        print(f"{key:40} Row {row_num:3}: {df1.iloc[row_num, 0]}")

print('\n' + '='*120)
print('ESCALATION RATES (From Row 0)')
print('='*120)

escalation_row = df1.iloc[0]
# The escalation values are in row 0, but need to check which columns actually have the numbers
print(f"Row 0 values: {list(escalation_row)}")
# Based on earlier analysis, escalation rates were: 0.0272, 0.0299, 0.0263, 0.034
esc1 = escalation_row[8] if isinstance(escalation_row[8], (int, float)) else 0.0272
esc2 = escalation_row[11] if isinstance(escalation_row[11], (int, float)) else 0.0299
esc3 = escalation_row[14] if isinstance(escalation_row[14], (int, float)) else 0.0263
esc4 = escalation_row[17] if isinstance(escalation_row[17], (int, float)) else 0.0340
print(f"Base → Option Year 1: {esc1:.2%}")
print(f"Option Year 1 → Option Year 2: {esc2:.2%}")
print(f"Option Year 2 → Option Year 3: {esc3:.2%}")
print(f"Option Year 3 → Option Year 4: {esc4:.2%}")

print('\n' + '='*120)
print('COLUMN STRUCTURE FOR EACH YEAR')
print('='*120)

year_columns = {
    'Total for All Years': {'Hours': 3, 'Amount': 4, 'Rate': 5},
    'Base Period': {'Hours': 6, 'Amount': 7, 'Rate': None},  # Rate is calculated
    'Option Year 1': {'Hours': 9, 'Amount': 10, 'Rate': 8},  # Column 8 has escalation label
    'Option Year 2': {'Hours': 12, 'Amount': 13, 'Rate': 11},
    'Option Year 3': {'Hours': 15, 'Amount': 16, 'Rate': 14},
    'Option Year 4': {'Hours': 18, 'Amount': 19, 'Rate': 17},
}

for year, cols in year_columns.items():
    print(f"\n{year}:")
    print(f"  Hours Column: {cols['Hours']}")
    print(f"  Amount Column: {cols['Amount']}")
    if cols['Rate']:
        print(f"  Rate Column: {cols['Rate']}")

print('\n' + '='*120)
print('SAMPLE LABOR RATE ESCALATION (Key Individual 1 - Program Manager)')
print('='*120)

row_9 = df1.iloc[9]
print(f"Position: {row_9[0]}")
print(f"Company Title: {row_9[1]}")
print(f"eCRAFT Title: {row_9[2]}")
print(f"\nTotal Hours: {row_9[3]:,.0f}")
print(f"Total Amount: ${row_9[4]:,.2f}")
print(f"Avg Rate: ${row_9[5]:.2f}/hr")
print(f"\nYear-by-Year Breakdown:")
print(f"  Base Period:     {row_9[6]:6.0f} hrs × ${row_9[8]:.2f}/hr = ${row_9[7]:,.2f}")
print(f"  Option Year 1:   {row_9[9]:6.0f} hrs × ${row_9[11]:.2f}/hr = ${row_9[10]:,.2f}")
print(f"  Option Year 2:   {row_9[12]:6.0f} hrs × ${row_9[14]:.2f}/hr = ${row_9[13]:,.2f}")
print(f"  Option Year 3:   {row_9[15]:6.0f} hrs × ${row_9[17]:.2f}/hr = ${row_9[16]:,.2f}")
print(f"  Option Year 4:   {row_9[18]:6.0f} hrs × ${row_9[19]:.2f}/hr = ${row_9[19]:,.2f}")

print(f"\nRate Escalation Pattern:")
base_rate = row_9[8]
print(f"  Base:            ${base_rate:.2f}")
print(f"  +2.72% Year 1:   ${row_9[11]:.2f} (calculated: ${base_rate * 1.0272:.2f})")
print(f"  +2.99% Year 2:   ${row_9[14]:.2f} (calculated: ${row_9[11] * 1.0299:.2f})")
print(f"  +2.63% Year 3:   ${row_9[17]:.2f} (calculated: ${row_9[14] * 1.0263:.2f})")
print(f"  +3.40% Year 4:   ${row_9[19]:.2f} (calculated: ${row_9[17] * 1.0340:.2f})")

print('\n' + '='*120)
print('INDIRECT COST ROWS')
print('='*120)

indirect_rows = [95, 96, 97, 98, 99]
for row_idx in indirect_rows:
    row = df1.iloc[row_idx]
    print(f"\nRow {row_idx}: {row[0]}")
    print(f"  Total: ${row[4]:,.2f}" if pd.notna(row[4]) else "  Total: N/A")
    print(f"  Base Period: ${row[7]:,.2f}" if pd.notna(row[7]) else "  Base: N/A")
    print(f"  Option Year 1: ${row[10]:,.2f}" if pd.notna(row[10]) else "  Opt 1: N/A")

print('\n' + '='*120)
print('SUBCONTRACTOR SECTION STRUCTURE')
print('='*120)

subcontractor_rows = [105, 106, 107, 120, 121, 124, 125, 131, 132]
for row_idx in subcontractor_rows:
    if row_idx < len(df1):
        row = df1.iloc[row_idx]
        print(f"\nRow {row_idx}: {row[0]}")
        if pd.notna(row[3]):  # Has hours
            print(f"  Total Hours: {row[3]:,.0f}")
            if pd.notna(row[4]):
                print(f"  Total Amount: ${row[4]:,.2f}")
            if pd.notna(row[5]):
                print(f"  Rate: ${row[5]:.2f}/hr")

print('\n' + '='*120)
print('SHEET 2: Subcontractor Fee/MH Rate Table')
print('='*120)

print("\nThis sheet shows how to calculate subcontractor rates with markups:")
print(df2.to_string())

print('\n' + '='*120)
print('SAMPLE FORMULAS (from openpyxl)')
print('='*120)

# Check some formula cells
formula_cells = [
    ('J10', 'Base Period Amount (Key Individual 1)'),
    ('K10', 'Base Period Rate (Key Individual 1)'),
    ('M10', 'Option Year 1 Amount'),
    ('N10', 'Option Year 1 Rate'),
]

for cell_ref, description in formula_cells:
    cell = sheet1[cell_ref]
    print(f"\n{cell_ref} ({description}):")
    print(f"  Value: {cell.value}")
    # Note: formulas may not be available if file was saved with data_only=True

print('\n' + '='*120)
print('HOURS DISTRIBUTION ANALYSIS')
print('='*120)

print("\nExamples of positions with varying hours across years:")
# Row 18 - AI Analyst with 0 hours in base period
row_18 = df1.iloc[18]
print(f"\nRow 18: {row_18[0]}")
print(f"  Base: {row_18[6]:.0f} hrs, Opt1: {row_18[9]:.0f} hrs, Opt2: {row_18[12]:.0f} hrs, Opt3: {row_18[15]:.0f} hrs, Opt4: {row_18[18]:.0f} hrs")

# Row 28 - Systems Analyst with 0 hours in first 2 years
row_28 = df1.iloc[28]
print(f"\nRow 28: {row_28[0]}")
print(f"  Base: {row_28[6]:.0f} hrs, Opt1: {row_28[9]:.0f} hrs, Opt2: {row_28[12]:.0f} hrs, Opt3: {row_28[15]:.0f} hrs, Opt4: {row_28[18]:.0f} hrs")

print('\n' + '='*120)
print('KEY INSIGHTS')
print('='*120)

insights = """
1. MULTI-YEAR STRUCTURE:
   - Base Period + 4 Option Years = 5 years total
   - Each year has: Hours, Amount, Rate columns
   - Hours can be different per year (some positions start later)

2. ESCALATION PATTERN:
   - Rates escalate EVERY year
   - Different escalation % for each year transition (2.72%, 2.99%, 2.63%, 3.40%)
   - Escalation is COMPOUND: Year 2 = Year 1 × (1 + escalation%)

3. RATE CALCULATION:
   - Each position has a base rate
   - Rate escalates each year
   - Amount = Hours × Rate (for that year)

4. PRIME CONTRACTOR LABOR:
   - ~85 positions (8 Key Individuals + many TBDs)
   - Each has Company Title and eCRAFT mapping
   - Rates are calculated (likely from BLS + indirect costs)

5. INDIRECT COSTS:
   - Overhead (Row 95)
   - Fringe Benefits (Row 96)
   - G&A (Row 97)
   - These are applied to direct labor

6. SUBCONTRACTOR STRUCTURE:
   - 4 Subcontractors: Astrion, Deloitte, Gnostech, KBR
   - Each has individual positions listed
   - Subcontractor rates are provided (not calculated from BLS)
   - Prime contractor adds markup/fee on subcontractor costs

7. FEES:
   - Prime Contractor Fee for Prime Labor (Row 156)
   - Prime Contractor Fee for Subcontractor Labor (Row 157)
   - These are profit margins

8. WHAT THE BOSS SAID MAKES SENSE:
   - "We don't find data for subcontractors" ✓
   - Users will manually enter subcontractor rates ✓
   - Focus is on generating THIS EXACT format ✓

9. EXCEL OUTPUT REQUIREMENTS:
   - Multi-column structure (3 columns per year)
   - Escalation rates in header
   - Sections: Prime Labor, Subcontractors, Indirect, Fees, ODCs, Totals
   - Professional formatting matching government contract standards
"""

print(insights)
