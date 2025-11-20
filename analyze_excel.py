import pandas as pd
import sys

file_path = '/Users/keshav/Developer/Others/Pricing/Intprepix Volume III.xlsx'

print('='*120)
print('COMPREHENSIVE ANALYSIS OF: Intprepix Volume III.xlsx')
print('='*120)

# Read both sheets
df1 = pd.read_excel(file_path, sheet_name='Cost Proposal Spreadsheet')
df2 = pd.read_excel(file_path, sheet_name='Subcontractor Fee_MH Rate Table')

print(f'\nSuccessfully loaded both sheets')
print(f'  Sheet 1: {len(df1)} rows x {len(df1.columns)} columns')
print(f'  Sheet 2: {len(df2)} rows x {len(df2.columns)} columns')

# ====================================================================================
# SHEET 1: DETAILED ANALYSIS
# ====================================================================================

print('\n\n' + '='*120)
print('SHEET 1: FIRST COLUMN - ALL VALUES (Document Structure)')
print('='*120)
for i in range(len(df1)):
    val = df1.iloc[i, 0]
    if pd.notna(val):
        print(f'Row {i:3d}: {val}')

print('\n\n' + '='*120)
print('ALL COLUMN NAMES')
print('='*120)
for i, col in enumerate(df1.columns):
    print(f'  Col {i:2d}: {col}')

print('\n\n' + '='*120)
print('HEADER SECTION (Rows 0-8)')
print('='*120)
pd.set_option('display.max_columns', None)
pd.set_option('display.width', 300)
pd.set_option('display.max_colwidth', 100)
print(df1.iloc[0:9].to_string())

print('\n\n' + '='*120)
print('PRIME CONTRACTOR DIRECT LABOR SECTION (Rows 9-30)')
print('='*120)
print(df1.iloc[9:31].to_string())

print('\n\n' + '='*120)
print('MIDDLE SECTION (Rows 40-70)')
print('='*120)
print(df1.iloc[40:71].to_string())

print('\n\n' + '='*120)
print('ROWS 80-110')
print('='*120)
print(df1.iloc[80:111].to_string())

print('\n\n' + '='*120)
print('ROWS 120-150')
print('='*120)
print(df1.iloc[120:151].to_string())

print('\n\n' + '='*120)
print('FINAL SECTION (Last 40 rows)')
print('='*120)
print(df1.tail(40).to_string())

# ====================================================================================
# SHEET 2: DETAILED ANALYSIS
# ====================================================================================

print('\n\n' + '='*120)
print('SHEET 2: SUBCONTRACTOR FEE/MH RATE TABLE - COMPLETE DATA')
print('='*120)
print(f'Rows: {len(df2)}, Columns: {len(df2.columns)}\n')
print(df2.to_string())

print('\n\n' + '='*120)
print('ANALYSIS COMPLETE')
print('='*120)
