"""
Excel Generator for Government Contract Cost Proposals.
Refactored to match the Price IQ Sample Template format.

Creates professional Excel files with:
- Multiple sheets (CE Summary, Labor Detail, Subcontractor sheets, Material, Travel, LOE, Indirect Rates)
- Blue header styling (#284C82)
- Thin borders on all cells
- Period-based columns with support for Base, Options, and Extensions
"""

from typing import Dict, List, Any
from openpyxl import Workbook
from openpyxl.styles import Font, Alignment, Border, Side, PatternFill
from openpyxl.utils import get_column_letter
from .calculation_service import Calculator


def format_soc_code(soc_code: str) -> str:
    """
    Format SOC code to consistent 6-digit display format without hyphen.

    Examples:
    - "15-1252" → "151252"
    - "151252" → "151252" (already formatted)
    - None → "-"

    Args:
        soc_code: Raw SOC code (6 digits with or without hyphen)

    Returns:
        Formatted SOC code without hyphen (XXXXXX) or "-" if invalid
    """
    if not soc_code:
        return '-'

    # Remove any existing hyphens
    clean = soc_code.replace('-', '')

    # Validate: must be 6 digits
    if len(clean) != 6 or not clean.isdigit():
        return soc_code  # Return as-is if invalid format

    # Return as 6-digit format without hyphen
    return clean


class ExcelGenerator:
    """
    Generates government contract cost proposal Excel files.
    Matches the Price IQ Sample Template format.
    """

    # Style constants matching sample template
    HEADER_FILL = PatternFill(start_color="284C82", end_color="284C82", fill_type="solid")  # Dark blue
    PERIOD_HEADER_FILL = PatternFill(start_color="D6DCE4", end_color="D6DCE4", fill_type="solid")  # Light blue
    HEADER_FONT = Font(bold=True, size=10, color="FFFFFF")
    NORMAL_FONT = Font(size=10)
    BOLD_FONT = Font(bold=True, size=10)
    THIN_BORDER = Border(
        left=Side(style='thin'),
        right=Side(style='thin'),
        top=Side(style='thin'),
        bottom=Side(style='thin')
    )
    # Exact formats from template
    CURRENCY_FORMAT = '_("$"* #,##0.00_);_("$"* \\(#,##0.00\\);_("$"* "-"??_);_(@_)'
    PERCENT_FORMAT = '0.00%'
    NUMBER_FORMAT = '#,##0.00'  # Template uses decimal for hours

    def __init__(self):
        """Initialize the Excel generator."""
        self.wb = None
        self.total_years = 0
        self.project_data = None
        self.extensions = []

    def generate_cost_proposal(self, project_data: Dict[str, Any]) -> Workbook:
        """
        Generate complete cost proposal Excel workbook in Price IQ format.

        Args:
            project_data: Complete project data including all positions, rates, etc.

        Returns:
            Workbook ready to save
        """
        self.wb = Workbook()
        self.project_data = project_data
        self.total_years = project_data['total_years']
        self.extensions = project_data.get('extensions', [])
        
        # Create sheets in order (matching PriceIQ template exactly)
        # 1. Summary (Cost Element Summary) - the main sheet
        self._create_ce_summary_sheet()

        # 2. Indirect Rate - moved up to position 2
        self._create_indirect_rates_sheet()

        # 3. Prime Labor Detail - Prime contractor labor categories with FBLR breakdown
        self._create_prime_labor_detail_sheet()

        # 4. Subcontractor sheets - One per subcontractor, named by company
        if project_data.get('subcontractors'):
            for sub in project_data['subcontractors']:
                self._create_subcontractor_sheet(sub)

        # 5. Fully Loaded Labor Rates - NEW sheet showing all position rates
        self._create_fully_loaded_labor_rates_sheet()

        # 6. ODCs sheet (separate from materials)
        if project_data.get('odcs'):
            self._create_odcs_sheet()

        # 7. Materials sheet (separate from ODCs)
        if project_data.get('materials'):
            self._create_materials_sheet()

        # 8. Travel sheet
        if project_data.get('travel'):
            self._create_travel_sheet()

        # 9. LOE sheet - Level of Effort with Company column
        self._create_loe_sheet()

        # 10. BLS Analysis sheet (renamed from Wage Data)
        if project_data.get('wage_data'):
            self._create_bls_analysis_sheet()

        # Remove default empty sheet if exists
        if 'Sheet' in self.wb.sheetnames:
            del self.wb['Sheet']

        return self.wb

    def _apply_standard_header(self, ws, start_col=2):
        """
        Apply standard header format to a worksheet.

        Creates table-style header with labels and values in separate cells:
        Row 1: "Proprietary Data" (red, bold, centered, merged)
        Row 2: Prime Contractor Name | [value]
        Row 3: Subcontractor(s) Name | [value]
        Row 4: Solicitation | [value]
        Row 5: Task Order Number | [value]

        Args:
            ws: Worksheet to apply header to
            start_col: Starting column (default 2 = B)
        """
        # Row 1: "Proprietary Data" - Red, Bold, Centered
        proprietary_cell = ws.cell(1, start_col, "Proprietary Data")
        proprietary_cell.font = Font(bold=True, size=11, color="FF0000")
        proprietary_cell.alignment = Alignment(horizontal='center', vertical='center')

        # Get subcontractor names
        sub_names = ", ".join(self.project_data.get('subcontractor_names', []))
        if not sub_names:
            sub_names = ""

        # Table-style header rows (2-5): Label in col B, Value in col C onwards
        header_data = [
            ("Prime Contractor Name", self.project_data.get('prime_contractor_name', 'N/A')),
            ("Subcontractor(s) Name", sub_names),
            ("Solicitation", self.project_data.get('solicitation_number', 'N/A')),
            ("Task Order Number", self.project_data.get('task_order_number', ''))
        ]

        for idx, (label, value) in enumerate(header_data):
            row = 2 + idx

            # Label column (bold, bordered)
            label_cell = ws.cell(row, start_col, label)
            label_cell.font = self.BOLD_FONT
            label_cell.border = self.THIN_BORDER
            label_cell.alignment = Alignment(horizontal='left', vertical='center')

            # Value column (bordered, next column)
            value_cell = ws.cell(row, start_col + 1, value)
            value_cell.border = self.THIN_BORDER
            value_cell.alignment = Alignment(horizontal='left', vertical='center')

    def _get_period_label(self, year: int) -> str:
        """Get label for a given year (Base, Option, Extension)."""
        base_years = self.project_data.get('base_years', 1)

        if year <= base_years:
            if base_years == 1:
                return "Base Period"
            return f"Base Year {year}"

        # Check if it's an extension
        for ext in self.extensions:
            if ext['year'] == year:
                return ext.get('label', f"Extension {year}")

        # Regular option year
        option_num = year - base_years
        return f"Option Period {option_num}"

    def _create_ce_summary_sheet(self):
        """Create the Summary (Cost Element Summary) sheet."""
        ws = self.wb.active
        ws.title = "Summary"

        # Set column widths matching template exactly
        ws.column_dimensions['A'].width = 2.33  # Padding column
        ws.column_dimensions['B'].width = 40.66  # Cost Element labels
        # First period column slightly wider
        ws.column_dimensions['C'].width = 20.66
        # Remaining period columns + Total
        for col_idx in range(4, 3 + self.total_years + 1):  # D onwards
            ws.column_dimensions[get_column_letter(col_idx)].width = 13
        # Total column
        ws.column_dimensions[get_column_letter(3 + self.total_years)].width = 13

        # Apply standard header format (Rows 1-5)
        self._apply_standard_header(ws, start_col=2)

        # Row 9: Column headers
        header_row = 9
        ws.cell(header_row, 2, "Cost Element")
        self._style_header_cell(ws.cell(header_row, 2))

        # Period column headers - Light blue background
        col = 3
        for year in range(1, self.total_years + 1):
            label = self._get_period_label(year)
            period_cell = ws.cell(header_row, col, label)
            self._style_period_header_cell(period_cell)  # Light blue for period headers
            col += 1

        # Total column
        ws.cell(header_row, col, "Total")
        self._style_header_cell(ws.cell(header_row, col))
        total_col = col

        # Cost Element rows (starting row 10, matching template - no "Cost" sub-header row)
        data_start_row = 10
        current_row = data_start_row

        # Calculate base totals (aggregated from positions/subcontractors/odcs)
        cost_elements = self._calculate_cost_elements()

        # Get rates for formulas
        indirect_rates = self.project_data.get('indirect_rates', {})
        fringe_rate = indirect_rates.get('fringe', 0.247)
        oh_rate = indirect_rates.get('oh_onsite', indirect_rates.get('oh', 0.0711))
        ga_rate = indirect_rates.get('ga', 0.2243)
        passthrough_rates = self.project_data.get('passthrough_rates', {})
        smh_rate = passthrough_rates.get('smh', 0.0665)
        ga_passthrough_rate = passthrough_rates.get('ga', 0.0)
        combined_passthrough_rate = smh_rate + ga_passthrough_rate  # S&MH + G&A Passthrough

        # Row 11: Direct Labor (calculated value)
        dl_row = current_row
        ws.cell(current_row, 2, "Direct Labor")
        ws.cell(current_row, 2).font = self.BOLD_FONT
        ws.cell(current_row, 2).border = self.THIN_BORDER
        for period_idx in range(self.total_years):
            period_key = f"year_{period_idx + 1}"
            value = cost_elements.get('direct_labor', {}).get(period_key, 0)
            cell = ws.cell(current_row, 3 + period_idx)
            cell.value = value
            cell.number_format = self.CURRENCY_FORMAT
            cell.border = self.THIN_BORDER
        cell = ws.cell(current_row, total_col)
        cell.value = cost_elements.get('direct_labor', {}).get('total', 0)
        cell.number_format = self.CURRENCY_FORMAT
        cell.border = self.THIN_BORDER
        cell.font = self.BOLD_FONT
        current_row += 1

        # Row 12: Fringe Benefits (FORMULA: DL * fringe_rate)
        fringe_row = current_row
        ws.cell(current_row, 2, "Fringe Benefits")
        ws.cell(current_row, 2).font = self.BOLD_FONT
        ws.cell(current_row, 2).border = self.THIN_BORDER
        for period_idx in range(self.total_years):
            col_letter = get_column_letter(3 + period_idx)
            cell = ws.cell(current_row, 3 + period_idx)
            cell.value = f"={col_letter}{dl_row}*{fringe_rate}"
            cell.number_format = self.CURRENCY_FORMAT
            cell.border = self.THIN_BORDER
        cell = ws.cell(current_row, total_col)
        cell.value = f"={get_column_letter(total_col)}{dl_row}*{fringe_rate}"
        cell.number_format = self.CURRENCY_FORMAT
        cell.border = self.THIN_BORDER
        cell.font = self.BOLD_FONT
        current_row += 1

        # Row 13: Labor Overhead (FORMULA: (DL + Fringe) * oh_rate)
        oh_row = current_row
        ws.cell(current_row, 2, "Labor Overhead")
        ws.cell(current_row, 2).font = self.BOLD_FONT
        ws.cell(current_row, 2).border = self.THIN_BORDER
        for period_idx in range(self.total_years):
            col_letter = get_column_letter(3 + period_idx)
            cell = ws.cell(current_row, 3 + period_idx)
            cell.value = f"=({col_letter}{dl_row}+{col_letter}{fringe_row})*{oh_rate}"
            cell.number_format = self.CURRENCY_FORMAT
            cell.border = self.THIN_BORDER
        cell = ws.cell(current_row, total_col)
        cell.value = f"=({get_column_letter(total_col)}{dl_row}+{get_column_letter(total_col)}{fringe_row})*{oh_rate}"
        cell.number_format = self.CURRENCY_FORMAT
        cell.border = self.THIN_BORDER
        cell.font = self.BOLD_FONT
        current_row += 1

        # Row 14: G&A (Labor) (FORMULA: (DL + Fringe + OH) * ga_rate)
        ga_labor_row = current_row
        ws.cell(current_row, 2, "General & Administrative (Labor)")
        ws.cell(current_row, 2).font = self.BOLD_FONT
        ws.cell(current_row, 2).border = self.THIN_BORDER
        for period_idx in range(self.total_years):
            col_letter = get_column_letter(3 + period_idx)
            cell = ws.cell(current_row, 3 + period_idx)
            cell.value = f"=({col_letter}{dl_row}+{col_letter}{fringe_row}+{col_letter}{oh_row})*{ga_rate}"
            cell.number_format = self.CURRENCY_FORMAT
            cell.border = self.THIN_BORDER
        cell = ws.cell(current_row, total_col)
        total_col_letter = get_column_letter(total_col)
        cell.value = f"=({total_col_letter}{dl_row}+{total_col_letter}{fringe_row}+{total_col_letter}{oh_row})*{ga_rate}"
        cell.number_format = self.CURRENCY_FORMAT
        cell.border = self.THIN_BORDER
        cell.font = self.BOLD_FONT
        current_row += 1

        # Row 15: Subcontractor(s) (calculated value)
        sub_row = current_row
        ws.cell(current_row, 2, "Subcontractor(s)")
        ws.cell(current_row, 2).font = self.BOLD_FONT
        ws.cell(current_row, 2).border = self.THIN_BORDER
        for period_idx in range(self.total_years):
            period_key = f"year_{period_idx + 1}"
            value = cost_elements.get('subcontractors', {}).get(period_key, 0)
            cell = ws.cell(current_row, 3 + period_idx)
            cell.value = value
            cell.number_format = self.CURRENCY_FORMAT
            cell.border = self.THIN_BORDER
        cell = ws.cell(current_row, total_col)
        cell.value = cost_elements.get('subcontractors', {}).get('total', 0)
        cell.number_format = self.CURRENCY_FORMAT
        cell.border = self.THIN_BORDER
        cell.font = self.BOLD_FONT
        current_row += 1

        # Row 16: Passthrough (FORMULA: Sub * (S&MH + G&A Passthrough))
        passthrough_row = current_row
        ws.cell(current_row, 2, "Passthrough (S&MH + G&A)")
        ws.cell(current_row, 2).font = self.BOLD_FONT
        ws.cell(current_row, 2).border = self.THIN_BORDER
        for period_idx in range(self.total_years):
            col_letter = get_column_letter(3 + period_idx)
            cell = ws.cell(current_row, 3 + period_idx)
            cell.value = f"={col_letter}{sub_row}*{combined_passthrough_rate}"
            cell.number_format = self.CURRENCY_FORMAT
            cell.border = self.THIN_BORDER
        cell = ws.cell(current_row, total_col)
        cell.value = f"={get_column_letter(total_col)}{sub_row}*{combined_passthrough_rate}"
        cell.number_format = self.CURRENCY_FORMAT
        cell.border = self.THIN_BORDER
        cell.font = self.BOLD_FONT
        current_row += 1

        # Row 17: Materials (calculated value)
        material_row = current_row
        ws.cell(current_row, 2, "Materials")
        ws.cell(current_row, 2).font = self.BOLD_FONT
        ws.cell(current_row, 2).border = self.THIN_BORDER
        for period_idx in range(self.total_years):
            period_key = f"year_{period_idx + 1}"
            value = cost_elements.get('materials', {}).get(period_key, 0)
            cell = ws.cell(current_row, 3 + period_idx)
            cell.value = value
            cell.number_format = self.CURRENCY_FORMAT
            cell.border = self.THIN_BORDER
        cell = ws.cell(current_row, total_col)
        cell.value = cost_elements.get('materials', {}).get('total', 0)
        cell.number_format = self.CURRENCY_FORMAT
        cell.border = self.THIN_BORDER
        cell.font = self.BOLD_FONT
        current_row += 1

        # Row 18: Material Handling (FORMULA: Materials * smh_rate)
        material_handling_row = current_row
        ws.cell(current_row, 2, "Materials Handling")
        ws.cell(current_row, 2).font = self.BOLD_FONT
        ws.cell(current_row, 2).border = self.THIN_BORDER
        for period_idx in range(self.total_years):
            col_letter = get_column_letter(3 + period_idx)
            cell = ws.cell(current_row, 3 + period_idx)
            cell.value = f"={col_letter}{material_row}*{smh_rate}"
            cell.number_format = self.CURRENCY_FORMAT
            cell.border = self.THIN_BORDER
        cell = ws.cell(current_row, total_col)
        cell.value = f"={get_column_letter(total_col)}{material_row}*{smh_rate}"
        cell.number_format = self.CURRENCY_FORMAT
        cell.border = self.THIN_BORDER
        cell.font = self.BOLD_FONT
        current_row += 1

        # Row 19: Travel (calculated value)
        travel_row = current_row
        ws.cell(current_row, 2, "Travel")
        ws.cell(current_row, 2).font = self.BOLD_FONT
        ws.cell(current_row, 2).border = self.THIN_BORDER
        for period_idx in range(self.total_years):
            period_key = f"year_{period_idx + 1}"
            value = cost_elements.get('travel', {}).get(period_key, 0)
            cell = ws.cell(current_row, 3 + period_idx)
            cell.value = value
            cell.number_format = self.CURRENCY_FORMAT
            cell.border = self.THIN_BORDER
        cell = ws.cell(current_row, total_col)
        cell.value = cost_elements.get('travel', {}).get('total', 0)
        cell.number_format = self.CURRENCY_FORMAT
        cell.border = self.THIN_BORDER
        cell.font = self.BOLD_FONT
        current_row += 1

        # Row 20: G&A (Travel) (FORMULA: Travel * ga_rate)
        ga_travel_row = current_row
        ws.cell(current_row, 2, "General & Administrative (Travel)")
        ws.cell(current_row, 2).font = self.BOLD_FONT
        ws.cell(current_row, 2).border = self.THIN_BORDER
        for period_idx in range(self.total_years):
            col_letter = get_column_letter(3 + period_idx)
            cell = ws.cell(current_row, 3 + period_idx)
            cell.value = f"={col_letter}{travel_row}*{ga_rate}"
            cell.number_format = self.CURRENCY_FORMAT
            cell.border = self.THIN_BORDER
        cell = ws.cell(current_row, total_col)
        cell.value = f"={get_column_letter(total_col)}{travel_row}*{ga_rate}"
        cell.number_format = self.CURRENCY_FORMAT
        cell.border = self.THIN_BORDER
        cell.font = self.BOLD_FONT
        current_row += 1

        # Sub-Total row
        subtotal_row = current_row
        ws.cell(current_row, 2, "Sub-Total")
        ws.cell(current_row, 2).font = self.BOLD_FONT
        ws.cell(current_row, 2).border = self.THIN_BORDER

        for period_idx in range(self.total_years):
            cell = ws.cell(current_row, 3 + period_idx)
            # Sum formula for this period column
            cell.value = f"=SUM({get_column_letter(3 + period_idx)}{data_start_row}:{get_column_letter(3 + period_idx)}{current_row - 1})"
            cell.number_format = self.CURRENCY_FORMAT
            cell.border = self.THIN_BORDER
            cell.font = self.BOLD_FONT

        # Total column for sub-total
        cell = ws.cell(current_row, total_col)
        cell.value = f"=SUM({get_column_letter(total_col)}{data_start_row}:{get_column_letter(total_col)}{current_row - 1})"
        cell.number_format = self.CURRENCY_FORMAT
        cell.border = self.THIN_BORDER
        cell.font = self.BOLD_FONT

        current_row += 1

        # Fee row
        fee_row = current_row
        ws.cell(current_row, 2, "Fee")
        ws.cell(current_row, 2).font = self.BOLD_FONT
        ws.cell(current_row, 2).border = self.THIN_BORDER

        fee_values = cost_elements.get('fee', {})
        for period_idx in range(self.total_years):
            period_key = f"year_{period_idx + 1}"
            value = fee_values.get(period_key, 0)
            cell = ws.cell(current_row, 3 + period_idx)
            cell.value = value
            cell.number_format = self.CURRENCY_FORMAT
            cell.border = self.THIN_BORDER

        cell = ws.cell(current_row, total_col)
        cell.value = fee_values.get('total', 0)
        cell.number_format = self.CURRENCY_FORMAT
        cell.border = self.THIN_BORDER
        cell.font = self.BOLD_FONT

        current_row += 1

        # Total Proposed row
        ws.cell(current_row, 2, "Total Proposed")
        ws.cell(current_row, 2).font = self.BOLD_FONT
        ws.cell(current_row, 2).border = self.THIN_BORDER
        ws.cell(current_row, 2).alignment = Alignment(horizontal='center')

        for period_idx in range(self.total_years):
            cell = ws.cell(current_row, 3 + period_idx)
            cell.value = f"={get_column_letter(3 + period_idx)}{subtotal_row}+{get_column_letter(3 + period_idx)}{fee_row}"
            cell.number_format = self.CURRENCY_FORMAT
            cell.border = self.THIN_BORDER
            cell.font = self.BOLD_FONT

        cell = ws.cell(current_row, total_col)
        cell.value = f"={get_column_letter(total_col)}{subtotal_row}+{get_column_letter(total_col)}{fee_row}"
        cell.number_format = self.CURRENCY_FORMAT
        cell.border = self.THIN_BORDER
        cell.font = self.BOLD_FONT

    def _create_prime_labor_detail_sheet(self):
        """Create the Prime Labor Detail sheet for prime contractor positions with FBLR breakdown."""
        ws = self.wb.create_sheet("Prime Labor Detail")

        # Column widths matching template
        ws.column_dimensions['A'].width = 2.33  # Padding
        ws.column_dimensions['B'].width = 50.5  # Labor Category
        ws.column_dimensions['C'].width = 19.66  # Site
        ws.column_dimensions['D'].width = 14.33  # Location (if used) or first Hours column

        # Apply standard header format (Rows 1-5)
        self._apply_standard_header(ws, start_col=2)

        # Column headers row
        header_row = 10
        headers = ["Labor Category", "Site", "Location"]
        for idx, header in enumerate(headers):
            cell = ws.cell(header_row, 2 + idx)
            cell.value = header
            self._style_header_cell(cell)

        # For each period: Hours, Rate, Dollars
        col = 5
        for year in range(1, self.total_years + 1):
            period_label = self._get_period_label(year)

            # Period header above sub-headers (row 7) - Light blue background
            period_cell = ws.cell(7, col, period_label)
            self._style_period_header_cell(period_cell)

            # Sub-headers for Hours, Rate, Dollars
            sub_headers = ["Hours/Base", "Rate", "Dollars"]
            for sub_idx, sub_header in enumerate(sub_headers):
                cell = ws.cell(header_row, col + sub_idx)
                cell.value = sub_header
                self._style_header_cell(cell)

                # Set column widths matching template
                if sub_idx == 0:  # Hours
                    ws.column_dimensions[get_column_letter(col + sub_idx)].width = 14.33
                elif sub_idx == 1:  # Rate
                    ws.column_dimensions[get_column_letter(col + sub_idx)].width = 11.33
                else:  # Dollars
                    ws.column_dimensions[get_column_letter(col + sub_idx)].width = 14.5

            col += 3

        # Total columns
        ws.cell(header_row, col, "Total Hours")
        self._style_header_cell(ws.cell(header_row, col))
        total_hours_col = col
        col += 1

        ws.cell(header_row, col, "Total Dollars")
        self._style_header_cell(ws.cell(header_row, col))
        total_dollars_col = col

        # Data rows
        current_row = header_row + 1
        positions = self.project_data.get('prime_positions', [])

        for position in positions:
            ws.cell(current_row, 2, position['labor_category'])
            ws.cell(current_row, 2).border = self.THIN_BORDER

            ws.cell(current_row, 3, position.get('site', 'Government'))
            ws.cell(current_row, 3).border = self.THIN_BORDER

            ws.cell(current_row, 4, position.get('location', ''))
            ws.cell(current_row, 4).border = self.THIN_BORDER

            # Calculate position data for each year
            results = Calculator.calculate_position_years(
                position_data=position,
                escalation_rates=self.project_data['escalation_rates'],
                indirect_rates=self.project_data['indirect_rates'],
                total_years=self.total_years
            )

            col = 5
            hours_cells = []
            dollars_cells = []

            for year in range(1, self.total_years + 1):
                year_data = results.get(f'year_{year}', {})

                # Hours
                hours_col = col
                cell = ws.cell(current_row, col)
                cell.value = year_data.get('hours', 0)
                cell.number_format = self.NUMBER_FORMAT
                cell.border = self.THIN_BORDER
                hours_cells.append(f"{get_column_letter(col)}{current_row}")
                col += 1

                # Rate (DL Rate - NOT FBLR, breakdown will add indirect costs)
                rate_col = col
                cell = ws.cell(current_row, col)
                cell.value = year_data.get('dl_rate', 0)  # Use DL rate, not FBLR
                cell.number_format = self.CURRENCY_FORMAT
                cell.border = self.THIN_BORDER
                col += 1

                # Dollars - USE FORMULA: Hours * Rate
                dollars_col = col
                cell = ws.cell(current_row, col)
                cell.value = f"={get_column_letter(hours_col)}{current_row}*{get_column_letter(rate_col)}{current_row}"
                cell.number_format = self.CURRENCY_FORMAT
                cell.border = self.THIN_BORDER
                dollars_cells.append(f"{get_column_letter(col)}{current_row}")
                col += 1

            # Total Hours
            cell = ws.cell(current_row, total_hours_col)
            cell.value = f"={'+'.join(hours_cells)}"
            cell.number_format = self.NUMBER_FORMAT
            cell.border = self.THIN_BORDER
            cell.font = self.BOLD_FONT

            # Total Dollars
            cell = ws.cell(current_row, total_dollars_col)
            cell.value = f"={'+'.join(dollars_cells)}"
            cell.number_format = self.CURRENCY_FORMAT
            cell.border = self.THIN_BORDER
            cell.font = self.BOLD_FONT

            current_row += 1

        # Total row
        if positions:
            ws.cell(current_row, 2, "Total Direct Labor")
            ws.cell(current_row, 2).font = self.BOLD_FONT
            ws.cell(current_row, 2).border = self.THIN_BORDER

            col = 5
            for year in range(1, self.total_years + 1):
                # Skip Hours column in sum (just dollars)
                col += 1  # Hours
                col += 1  # Rate

                # Dollars sum
                cell = ws.cell(current_row, col)
                cell.value = f"=SUM({get_column_letter(col)}{header_row + 1}:{get_column_letter(col)}{current_row - 1})"
                cell.number_format = self.CURRENCY_FORMAT
                cell.border = self.THIN_BORDER
                cell.font = self.BOLD_FONT
                col += 1

            # Total Dollars sum
            cell = ws.cell(current_row, total_dollars_col)
            cell.value = f"=SUM({get_column_letter(total_dollars_col)}{header_row + 1}:{get_column_letter(total_dollars_col)}{current_row - 1})"
            cell.number_format = self.CURRENCY_FORMAT
            cell.border = self.THIN_BORDER
            cell.font = self.BOLD_FONT

            # Store the Total Direct Labor row for FBLR breakdown references
            total_direct_labor_row = current_row
            current_row += 1

            # Add FBLR breakdown rows (matching template format)
            indirect_rates = self.project_data.get('indirect_rates', {})
            fringe_rate = indirect_rates.get('fringe', 0.247)
            oh_rate = indirect_rates.get('oh_onsite', indirect_rates.get('oh', 0.0711))
            ga_rate = indirect_rates.get('ga', 0.2243)
            fee_rates = self.project_data.get('fee_rates', {})
            prime_fee_rate = fee_rates.get('prime_labor', 0.08)

            # Fringe Benefits row
            fringe_row = current_row
            ws.cell(current_row, 2, "Fringe Benefits")
            ws.cell(current_row, 2).font = self.BOLD_FONT
            ws.cell(current_row, 2).border = self.THIN_BORDER

            col = 5
            for year in range(1, self.total_years + 1):
                col += 1  # Hours (skip)

                # Rate column - reference from Indirect Rate sheet
                rate_cell = ws.cell(current_row, col)
                rate_cell.value = "='Indirect Rate'!C9"  # Fringe rate
                rate_cell.number_format = self.PERCENT_FORMAT
                rate_cell.border = self.THIN_BORDER
                rate_col = col
                col += 1

                # Dollars column - use rate cell reference
                dl_cell = f"{get_column_letter(col)}{total_direct_labor_row}"
                rate_ref = f"{get_column_letter(rate_col)}{current_row}"
                cell = ws.cell(current_row, col)
                cell.value = f"={dl_cell}*{rate_ref}"
                cell.number_format = self.CURRENCY_FORMAT
                cell.border = self.THIN_BORDER
                col += 1

            # Total Dollars
            cell = ws.cell(current_row, total_dollars_col)
            cell.value = f"={get_column_letter(total_dollars_col)}{total_direct_labor_row}*'Indirect Rate'!C9"
            cell.number_format = self.CURRENCY_FORMAT
            cell.border = self.THIN_BORDER
            cell.font = self.BOLD_FONT
            current_row += 1

            # Labor Overhead row
            oh_row = current_row
            ws.cell(current_row, 2, "Labor Overhead")
            ws.cell(current_row, 2).font = self.BOLD_FONT
            ws.cell(current_row, 2).border = self.THIN_BORDER

            col = 5
            for year in range(1, self.total_years + 1):
                col += 1  # Hours (skip)

                # Rate column - reference from Indirect Rate sheet (Onsite OH)
                rate_cell = ws.cell(current_row, col)
                rate_cell.value = "='Indirect Rate'!C10"  # Onsite Overhead rate
                rate_cell.number_format = self.PERCENT_FORMAT
                rate_cell.border = self.THIN_BORDER
                rate_col = col
                col += 1

                # Dollars column - use rate cell reference
                col_letter = get_column_letter(col)
                rate_ref = f"{get_column_letter(rate_col)}{current_row}"
                cell = ws.cell(current_row, col)
                cell.value = f"=({col_letter}{total_direct_labor_row}+{col_letter}{fringe_row})*{rate_ref}"
                cell.number_format = self.CURRENCY_FORMAT
                cell.border = self.THIN_BORDER
                col += 1

            # Total Dollars
            total_col_letter = get_column_letter(total_dollars_col)
            cell = ws.cell(current_row, total_dollars_col)
            cell.value = f"=({total_col_letter}{total_direct_labor_row}+{total_col_letter}{fringe_row})*'Indirect Rate'!C10"
            cell.number_format = self.CURRENCY_FORMAT
            cell.border = self.THIN_BORDER
            cell.font = self.BOLD_FONT
            current_row += 1

            # G&A row
            ga_row = current_row
            ws.cell(current_row, 2, "General & Administrative (Labor)")
            ws.cell(current_row, 2).font = self.BOLD_FONT
            ws.cell(current_row, 2).border = self.THIN_BORDER

            col = 5
            for year in range(1, self.total_years + 1):
                col += 1  # Hours (skip)

                # Rate column - reference from Indirect Rate sheet
                rate_cell = ws.cell(current_row, col)
                rate_cell.value = "='Indirect Rate'!C12"  # G&A rate
                rate_cell.number_format = self.PERCENT_FORMAT
                rate_cell.border = self.THIN_BORDER
                rate_col = col
                col += 1

                # Dollars column - use rate cell reference
                col_letter = get_column_letter(col)
                rate_ref = f"{get_column_letter(rate_col)}{current_row}"
                cell = ws.cell(current_row, col)
                cell.value = f"=({col_letter}{total_direct_labor_row}+{col_letter}{fringe_row}+{col_letter}{oh_row})*{rate_ref}"
                cell.number_format = self.CURRENCY_FORMAT
                cell.border = self.THIN_BORDER
                col += 1

            # Total Dollars
            total_col_letter = get_column_letter(total_dollars_col)
            cell = ws.cell(current_row, total_dollars_col)
            cell.value = f"=({total_col_letter}{total_direct_labor_row}+{total_col_letter}{fringe_row}+{total_col_letter}{oh_row})*'Indirect Rate'!C12"
            cell.number_format = self.CURRENCY_FORMAT
            cell.border = self.THIN_BORDER
            cell.font = self.BOLD_FONT
            current_row += 1

            # Subtotal row (before fee)
            subtotal_row = current_row
            ws.cell(current_row, 2, "Subtotal")
            ws.cell(current_row, 2).font = self.BOLD_FONT
            ws.cell(current_row, 2).border = self.THIN_BORDER

            col = 5
            for year in range(1, self.total_years + 1):
                col += 1  # Hours
                col += 1  # Rate
                # Dollars column
                col_letter = get_column_letter(col)
                cell = ws.cell(current_row, col)
                cell.value = f"={col_letter}{total_direct_labor_row}+{col_letter}{fringe_row}+{col_letter}{oh_row}+{col_letter}{ga_row}"
                cell.number_format = self.CURRENCY_FORMAT
                cell.border = self.THIN_BORDER
                cell.font = self.BOLD_FONT
                col += 1

            # Total Dollars
            total_col_letter = get_column_letter(total_dollars_col)
            cell = ws.cell(current_row, total_dollars_col)
            cell.value = f"={total_col_letter}{total_direct_labor_row}+{total_col_letter}{fringe_row}+{total_col_letter}{oh_row}+{total_col_letter}{ga_row}"
            cell.number_format = self.CURRENCY_FORMAT
            cell.border = self.THIN_BORDER
            cell.font = self.BOLD_FONT
            current_row += 1

            # Fee row
            fee_row = current_row
            ws.cell(current_row, 2, "Fee")
            ws.cell(current_row, 2).font = self.BOLD_FONT
            ws.cell(current_row, 2).border = self.THIN_BORDER

            col = 5
            for year in range(1, self.total_years + 1):
                col += 1  # Hours (skip)

                # Rate column - reference from Indirect Rate sheet
                rate_cell = ws.cell(current_row, col)
                rate_cell.value = "='Indirect Rate'!C14"  # Fee on Labor rate
                rate_cell.number_format = self.PERCENT_FORMAT
                rate_cell.border = self.THIN_BORDER
                rate_col = col
                col += 1

                # Dollars column - use rate cell reference
                col_letter = get_column_letter(col)
                rate_ref = f"{get_column_letter(rate_col)}{current_row}"
                cell = ws.cell(current_row, col)
                cell.value = f"={col_letter}{subtotal_row}*{rate_ref}"
                cell.number_format = self.CURRENCY_FORMAT
                cell.border = self.THIN_BORDER
                col += 1

            # Total Dollars
            total_col_letter = get_column_letter(total_dollars_col)
            cell = ws.cell(current_row, total_dollars_col)
            cell.value = f"={total_col_letter}{subtotal_row}*'Indirect Rate'!C14"
            cell.number_format = self.CURRENCY_FORMAT
            cell.border = self.THIN_BORDER
            cell.font = self.BOLD_FONT
            current_row += 1

            # Total Prime Labor row
            ws.cell(current_row, 2, "Total Prime Labor")
            ws.cell(current_row, 2).font = self.BOLD_FONT
            ws.cell(current_row, 2).border = self.THIN_BORDER

            col = 5
            for year in range(1, self.total_years + 1):
                col += 1  # Hours
                col += 1  # Rate
                # Dollars column
                col_letter = get_column_letter(col)
                cell = ws.cell(current_row, col)
                cell.value = f"={col_letter}{subtotal_row}+{col_letter}{fee_row}"
                cell.number_format = self.CURRENCY_FORMAT
                cell.border = self.THIN_BORDER
                cell.font = self.BOLD_FONT
                col += 1

            # Total Dollars
            total_col_letter = get_column_letter(total_dollars_col)
            cell = ws.cell(current_row, total_dollars_col)
            cell.value = f"={total_col_letter}{subtotal_row}+{total_col_letter}{fee_row}"
            cell.number_format = self.CURRENCY_FORMAT
            cell.border = self.THIN_BORDER
            cell.font = self.BOLD_FONT

    def _create_subcontractor_sheet(self, sub_data: Dict):
        """Create a sheet for a single subcontractor, named by company."""
        # Use company name for sheet title (sanitize for Excel sheet name limits)
        company_name = sub_data.get('name', 'Subcontractor')
        # Excel sheet names have max 31 chars and can't contain: \ / ? * [ ]
        sheet_name = company_name[:31].replace('\\', '').replace('/', '').replace('?', '').replace('*', '').replace('[', '').replace(']', '')
        ws = self.wb.create_sheet(sheet_name)

        # Column widths matching template
        ws.column_dimensions['A'].width = 2.33  # Padding
        ws.column_dimensions['B'].width = 50.5  # Labor Category
        ws.column_dimensions['C'].width = 19.66  # Site

        # Apply standard header format (Rows 1-5)
        self._apply_standard_header(ws, start_col=2)

        # Column headers
        header_row = 10
        headers = ["Labor Category", "Site"]
        for idx, header in enumerate(headers):
            cell = ws.cell(header_row, 2 + idx)
            cell.value = header
            self._style_header_cell(cell)

        # Period columns
        col = 4
        for year in range(1, self.total_years + 1):
            period_label = self._get_period_label(year)

            # Period header above (row 7) - Light blue background, merged across 3 columns
            period_cell = ws.cell(7, col, period_label)
            self._style_period_header_cell(period_cell)
            # Merge across Hours, Rate, Dollars columns
            ws.merge_cells(start_row=7, start_column=col, end_row=7, end_column=col + 2)

            # Sub-headers for Hours, Rate, Dollars
            sub_headers = ["Hours/Base", "Rate", "Dollars"]
            for sub_idx, sub_header in enumerate(sub_headers):
                cell = ws.cell(header_row, col + sub_idx)
                cell.value = sub_header
                self._style_header_cell(cell)

                # Set column widths matching template
                if sub_idx == 0:  # Hours
                    ws.column_dimensions[get_column_letter(col + sub_idx)].width = 14.33
                elif sub_idx == 1:  # Rate
                    ws.column_dimensions[get_column_letter(col + sub_idx)].width = 11.33
                else:  # Dollars
                    ws.column_dimensions[get_column_letter(col + sub_idx)].width = 14.5

            col += 3

        # Total column
        ws.cell(header_row, col, "Total")
        self._style_header_cell(ws.cell(header_row, col))
        total_col = col

        # Data rows
        current_row = header_row + 1
        for labor_cat in sub_data.get('labor_categories', []):
            ws.cell(current_row, 2, labor_cat['labor_category'])
            ws.cell(current_row, 2).border = self.THIN_BORDER

            ws.cell(current_row, 3, labor_cat.get('site', 'Government'))
            ws.cell(current_row, 3).border = self.THIN_BORDER

            col = 4
            dollars_cells = []

            for year in range(1, self.total_years + 1):
                hours = labor_cat.get(f'year_{year}_hours', 0)
                rate = labor_cat.get(f'year_{year}_rate', 0)

                # Hours
                cell = ws.cell(current_row, col)
                cell.value = hours
                cell.number_format = self.NUMBER_FORMAT
                cell.border = self.THIN_BORDER
                col += 1

                # Rate
                cell = ws.cell(current_row, col)
                cell.value = rate
                cell.number_format = self.CURRENCY_FORMAT
                cell.border = self.THIN_BORDER
                hours_col = col - 1
                rate_col = col
                col += 1

                # Dollars (formula)
                cell = ws.cell(current_row, col)
                cell.value = f"={get_column_letter(hours_col)}{current_row}*{get_column_letter(rate_col)}{current_row}"
                cell.number_format = self.CURRENCY_FORMAT
                cell.border = self.THIN_BORDER
                dollars_cells.append(f"{get_column_letter(col)}{current_row}")
                col += 1

            # Total
            cell = ws.cell(current_row, total_col)
            cell.value = f"={'+'.join(dollars_cells)}"
            cell.number_format = self.CURRENCY_FORMAT
            cell.border = self.THIN_BORDER
            cell.font = self.BOLD_FONT

            current_row += 1

        # Total row - sum hours and dollars by column (only if there are labor categories)
        if sub_data.get('labor_categories'):
            ws.cell(current_row, 2, "Total")
            ws.cell(current_row, 2).font = self.BOLD_FONT
            ws.cell(current_row, 2).border = self.THIN_BORDER

            col = 4
            for year in range(1, self.total_years + 1):
                # Hours column - sum
                hours_col_letter = get_column_letter(col)
                cell = ws.cell(current_row, col)
                cell.value = f"=SUM({hours_col_letter}{header_row + 1}:{hours_col_letter}{current_row - 1})"
                cell.number_format = self.NUMBER_FORMAT
                cell.border = self.THIN_BORDER
                cell.font = self.BOLD_FONT
                col += 1

                # Rate column - skip (no total for rates)
                col += 1

                # Dollars column - sum
                dollars_col_letter = get_column_letter(col)
                cell = ws.cell(current_row, col)
                cell.value = f"=SUM({dollars_col_letter}{header_row + 1}:{dollars_col_letter}{current_row - 1})"
                cell.number_format = self.CURRENCY_FORMAT
                cell.border = self.THIN_BORDER
                cell.font = self.BOLD_FONT
                col += 1

            # Total column - sum
            total_col_letter = get_column_letter(total_col)
            cell = ws.cell(current_row, total_col)
            cell.value = f"=SUM({total_col_letter}{header_row + 1}:{total_col_letter}{current_row - 1})"
            cell.number_format = self.CURRENCY_FORMAT
            cell.border = self.THIN_BORDER
            cell.font = self.BOLD_FONT

    def _create_fully_loaded_labor_rates_sheet(self):
        """Create the Fully Loaded Labor Rates sheet showing all position rates per period."""
        ws = self.wb.create_sheet("Fully Loaded Labor Rates")

        # Column widths
        ws.column_dimensions['A'].width = 2.33  # Padding
        ws.column_dimensions['B'].width = 50.5  # Labor Category
        ws.column_dimensions['C'].width = 20  # Company
        ws.column_dimensions['D'].width = 20  # Location

        # Apply standard header format (Rows 1-5)
        self._apply_standard_header(ws, start_col=2)

        # Column headers
        header_row = 8
        ws.cell(header_row, 2, "Labor Category")
        self._style_header_cell(ws.cell(header_row, 2))

        ws.cell(header_row, 3, "Company")
        self._style_header_cell(ws.cell(header_row, 3))

        ws.cell(header_row, 4, "Location")
        self._style_header_cell(ws.cell(header_row, 4))

        # Period columns
        col = 5
        for year in range(1, self.total_years + 1):
            period_label = self._get_period_label(year)
            cell = ws.cell(header_row, col)
            cell.value = period_label
            self._style_period_header_cell(cell)
            ws.column_dimensions[get_column_letter(col)].width = 18
            col += 1

        # Data rows - Prime positions first
        current_row = header_row + 1
        prime_positions = self.project_data.get('prime_positions', [])
        indirect_rates = self.project_data.get('indirect_rates', {})

        for position in prime_positions:
            # Labor Category
            ws.cell(current_row, 2, position['labor_category'])
            ws.cell(current_row, 2).border = self.THIN_BORDER

            # Company (Prime)
            ws.cell(current_row, 3, self.project_data['prime_contractor_name'])
            ws.cell(current_row, 3).border = self.THIN_BORDER

            # Location
            ws.cell(current_row, 4, position.get('location', ''))
            ws.cell(current_row, 4).border = self.THIN_BORDER

            # Calculate FBLR for each year
            results = Calculator.calculate_position_years(
                position_data=position,
                escalation_rates=self.project_data['escalation_rates'],
                indirect_rates=indirect_rates,
                total_years=self.total_years
            )

            # Get prime labor fee rate (FBLR should include fee for "Fully Loaded" rates)
            fee_rates = self.project_data.get('fee_rates', {})
            prime_fee_rate = fee_rates.get('prime_labor', 0.08)

            col = 5
            for year in range(1, self.total_years + 1):
                year_data = results.get(f'year_{year}', {})
                fblr_without_fee = year_data.get('rate', 0)

                # Add fee to get fully loaded rate (matching frontend calculation)
                # FBLR = (DL + Fringe + OH + G&A) + Fee
                # Fee = (DL + Fringe + OH + G&A) × fee_rate
                fblr_with_fee = fblr_without_fee * (1 + prime_fee_rate)

                cell = ws.cell(current_row, col)
                cell.value = fblr_with_fee
                cell.number_format = self.CURRENCY_FORMAT
                cell.border = self.THIN_BORDER
                col += 1

            current_row += 1

        # Subcontractor positions
        for sub in self.project_data.get('subcontractors', []):
            sub_name = sub.get('name', 'Subcontractor')

            for labor_cat in sub.get('labor_categories', []):
                # Labor Category
                ws.cell(current_row, 2, labor_cat['labor_category'])
                ws.cell(current_row, 2).border = self.THIN_BORDER

                # Company (Subcontractor)
                ws.cell(current_row, 3, sub_name)
                ws.cell(current_row, 3).border = self.THIN_BORDER

                # Location
                ws.cell(current_row, 4, labor_cat.get('location', ''))
                ws.cell(current_row, 4).border = self.THIN_BORDER

                # Rates per year (subcontractors show base rate, fees applied at contract level)
                col = 5
                for year in range(1, self.total_years + 1):
                    rate = labor_cat.get(f'year_{year}_rate', 0)

                    cell = ws.cell(current_row, col)
                    cell.value = rate
                    cell.number_format = self.CURRENCY_FORMAT
                    cell.border = self.THIN_BORDER
                    col += 1

                current_row += 1

    def _create_odcs_sheet(self):
        """Create the ODCs sheet (separate from Materials)."""
        ws = self.wb.create_sheet("ODCs")

        # Column widths matching template
        ws.column_dimensions['A'].width = 2.33  # Padding
        ws.column_dimensions['B'].width = 40.66  # ODC description

        # Apply standard header format (Rows 1-5)
        self._apply_standard_header(ws, start_col=2)

        # Period columns
        header_row = 8
        col = 3

        for year in range(1, self.total_years + 1):
            period_label = self._get_period_label(year)
            # Merge period label across the 2 columns (amount + handling)
            period_cell = ws.cell(header_row, col, period_label)
            self._style_period_header_cell(period_cell)
            ws.merge_cells(start_row=header_row, start_column=col, end_row=header_row, end_column=col + 1)
            ws.column_dimensions[get_column_letter(col)].width = 18
            ws.column_dimensions[get_column_letter(col + 1)].width = 15
            col += 2  # Amount and handling columns

        # Total column
        ws.cell(header_row, col, "Total")
        self._style_header_cell(ws.cell(header_row, col))
        total_col = col

        # ODC rows
        current_row = header_row + 2
        smh_rate = self.project_data.get('passthrough_rates', {}).get('smh', 0.0665)

        odcs = self.project_data.get('odcs', [])
        odc_start_row = current_row
        escalation_rates = self.project_data.get('escalation_rates', {})

        for odc in odcs:
            # ODC base row
            ws.cell(current_row, 2, odc['category'])
            ws.cell(current_row, 2).border = self.THIN_BORDER
            escalate = odc.get('escalate', False)

            col = 3
            for year in range(1, self.total_years + 1):
                # Check for pre-calculated amounts
                if 'amount_per_year' in odc:
                    base_amount = odc['amount_per_year'].get(str(year)) or 0
                else:
                    base_amount = odc.get('amount_year_1') or 0

                # Apply compound escalation if flag is set
                escalated_amount = base_amount
                if escalate and year > 1:
                    for y in range(1, year):
                        esc_key = f"{y}_to_{y + 1}"
                        esc_rate = escalation_rates.get(esc_key) or 0
                        escalated_amount *= (1 + esc_rate)

                cell = ws.cell(current_row, col)
                cell.value = escalated_amount
                cell.number_format = self.CURRENCY_FORMAT
                cell.border = self.THIN_BORDER
                col += 2

            # Add Total column formula for ODC row
            total_cell = ws.cell(current_row, total_col)
            total_cell.value = f"=SUM({get_column_letter(3)}{current_row}:{get_column_letter(total_col - 2)}{current_row})"
            total_cell.number_format = self.CURRENCY_FORMAT
            total_cell.border = self.THIN_BORDER

            current_row += 1

            # S&MH Handling row
            ws.cell(current_row, 2, f"{odc['category']} Handling")
            ws.cell(current_row, 2).border = self.THIN_BORDER

            col = 3
            for year in range(1, self.total_years + 1):
                odc_cell = f"{get_column_letter(col)}{current_row - 1}"
                cell = ws.cell(current_row, col)
                cell.value = f"={odc_cell}*{smh_rate}"
                cell.number_format = self.CURRENCY_FORMAT
                cell.border = self.THIN_BORDER
                col += 2

            # Add Total column formula for handling row
            total_cell = ws.cell(current_row, total_col)
            total_cell.value = f"=SUM({get_column_letter(3)}{current_row}:{get_column_letter(total_col - 2)}{current_row})"
            total_cell.number_format = self.CURRENCY_FORMAT
            total_cell.border = self.THIN_BORDER

            current_row += 1

        # Total row
        ws.cell(current_row, 2, "Total ODCs")
        ws.cell(current_row, 2).font = self.BOLD_FONT
        ws.cell(current_row, 2).border = self.THIN_BORDER

        col = 3
        for year in range(1, self.total_years + 1):
            cell = ws.cell(current_row, col)
            cell.value = f"=SUM({get_column_letter(col)}{odc_start_row}:{get_column_letter(col)}{current_row - 1})"
            cell.number_format = self.CURRENCY_FORMAT
            cell.border = self.THIN_BORDER
            cell.font = self.BOLD_FONT
            col += 2

        # Add Total column formula for Total ODCs row
        total_cell = ws.cell(current_row, total_col)
        total_cell.value = f"=SUM({get_column_letter(3)}{current_row}:{get_column_letter(total_col - 2)}{current_row})"
        total_cell.number_format = self.CURRENCY_FORMAT
        total_cell.border = self.THIN_BORDER
        total_cell.font = self.BOLD_FONT

    def _create_materials_sheet(self):
        """Create the Materials sheet (separate from ODCs)."""
        ws = self.wb.create_sheet("Materials")

        # Column widths matching template
        ws.column_dimensions['A'].width = 2.33  # Padding
        ws.column_dimensions['B'].width = 40.66  # Material description

        # Apply standard header format (Rows 1-5)
        self._apply_standard_header(ws, start_col=2)

        # Period columns
        header_row = 8
        col = 3

        for year in range(1, self.total_years + 1):
            period_label = self._get_period_label(year)
            # Merge period label across the 2 columns (base + handling)
            period_cell = ws.cell(header_row, col, period_label)
            self._style_period_header_cell(period_cell)
            ws.merge_cells(start_row=header_row, start_column=col, end_row=header_row, end_column=col + 1)
            ws.column_dimensions[get_column_letter(col)].width = 18
            ws.column_dimensions[get_column_letter(col + 1)].width = 15
            col += 2

        # Total column
        ws.cell(header_row, col, "Total")
        self._style_header_cell(ws.cell(header_row, col))
        total_col = col

        # Material rows
        current_row = header_row + 2
        smh_rate = self.project_data.get('passthrough_rates', {}).get('smh', 0.0665)

        materials = self.project_data.get('materials', [])
        material_start_row = current_row
        escalation_rates = self.project_data.get('escalation_rates', {})

        for material in materials:
            # Material base row
            ws.cell(current_row, 2, material['category'])
            ws.cell(current_row, 2).border = self.THIN_BORDER
            escalate = material.get('escalate', False)

            col = 3
            for year in range(1, self.total_years + 1):
                if 'amount_per_year' in material:
                    base_amount = material['amount_per_year'].get(str(year)) or 0
                else:
                    base_amount = material.get('amount_year_1') or 0

                # Apply compound escalation if flag is set
                escalated_amount = base_amount
                if escalate and year > 1:
                    for y in range(1, year):
                        esc_key = f"{y}_to_{y + 1}"
                        esc_rate = escalation_rates.get(esc_key) or 0
                        escalated_amount *= (1 + esc_rate)

                cell = ws.cell(current_row, col)
                cell.value = escalated_amount
                cell.number_format = self.CURRENCY_FORMAT
                cell.border = self.THIN_BORDER
                col += 2

            # Add Total column formula for material row
            total_cell = ws.cell(current_row, total_col)
            total_cell.value = f"=SUM({get_column_letter(3)}{current_row}:{get_column_letter(total_col - 2)}{current_row})"
            total_cell.number_format = self.CURRENCY_FORMAT
            total_cell.border = self.THIN_BORDER

            current_row += 1

            # Material Handling row
            ws.cell(current_row, 2, f"{material['category']} Handling")
            ws.cell(current_row, 2).border = self.THIN_BORDER

            col = 3
            for year in range(1, self.total_years + 1):
                material_cell = f"{get_column_letter(col)}{current_row - 1}"
                cell = ws.cell(current_row, col)
                cell.value = f"={material_cell}*{smh_rate}"
                cell.number_format = self.CURRENCY_FORMAT
                cell.border = self.THIN_BORDER
                col += 2

            # Add Total column formula for handling row
            total_cell = ws.cell(current_row, total_col)
            total_cell.value = f"=SUM({get_column_letter(3)}{current_row}:{get_column_letter(total_col - 2)}{current_row})"
            total_cell.number_format = self.CURRENCY_FORMAT
            total_cell.border = self.THIN_BORDER

            current_row += 1

        # Total row
        ws.cell(current_row, 2, "Total Materials")
        ws.cell(current_row, 2).font = self.BOLD_FONT
        ws.cell(current_row, 2).border = self.THIN_BORDER

        col = 3
        for year in range(1, self.total_years + 1):
            cell = ws.cell(current_row, col)
            cell.value = f"=SUM({get_column_letter(col)}{material_start_row}:{get_column_letter(col)}{current_row - 1})"
            cell.number_format = self.CURRENCY_FORMAT
            cell.border = self.THIN_BORDER
            cell.font = self.BOLD_FONT
            col += 2

        # Add Total column formula for Total Materials row
        total_cell = ws.cell(current_row, total_col)
        total_cell.value = f"=SUM({get_column_letter(3)}{current_row}:{get_column_letter(total_col - 2)}{current_row})"
        total_cell.number_format = self.CURRENCY_FORMAT
        total_cell.border = self.THIN_BORDER
        total_cell.font = self.BOLD_FONT

    def _create_travel_sheet(self):
        """Create the Travel sheet."""
        ws = self.wb.create_sheet("Travel")

        # Column widths matching template
        ws.column_dimensions['A'].width = 2.33  # Padding
        ws.column_dimensions['B'].width = 40.66  # Travel description

        # Apply standard header format (Rows 1-5)
        self._apply_standard_header(ws, start_col=2)

        # Period columns
        header_row = 8
        col = 3

        for year in range(1, self.total_years + 1):
            period_label = self._get_period_label(year)
            # Merge period label across the 2 columns (base + G&A)
            period_cell = ws.cell(header_row, col, period_label)
            self._style_period_header_cell(period_cell)  # Light blue background for periods
            ws.merge_cells(start_row=header_row, start_column=col, end_row=header_row, end_column=col + 1)
            ws.column_dimensions[get_column_letter(col)].width = 18
            ws.column_dimensions[get_column_letter(col + 1)].width = 15
            col += 2

        # Total column
        ws.cell(header_row, col, "Total")
        self._style_header_cell(ws.cell(header_row, col))
        total_col = col

        # Travel rows
        current_row = header_row + 2
        ga_rate = self.project_data.get('indirect_rates', {}).get('ga', 0.2214)

        travel_items = self.project_data.get('travel', [])
        travel_start_row = current_row

        escalation_rates = self.project_data.get('escalation_rates', {})

        for travel in travel_items:
            description = travel.get('description', 'Travel')
            escalate = travel.get('escalate', False)

            # Travel base row
            ws.cell(current_row, 2, description)
            ws.cell(current_row, 2).border = self.THIN_BORDER

            col = 3
            for year in range(1, self.total_years + 1):
                if 'amount_per_year' in travel:
                    base_amount = travel['amount_per_year'].get(str(year)) or 0
                else:
                    base_amount = travel.get('amount_year_1') or 0

                # Apply compound escalation if flag is set
                escalated_amount = base_amount
                if escalate and year > 1:
                    for y in range(1, year):
                        esc_key = f"{y}_to_{y + 1}"
                        esc_rate = escalation_rates.get(esc_key) or 0
                        escalated_amount *= (1 + esc_rate)

                cell = ws.cell(current_row, col)
                cell.value = escalated_amount
                cell.number_format = self.CURRENCY_FORMAT
                cell.border = self.THIN_BORDER
                col += 2

            # Add Total column formula for this travel row
            total_cell = ws.cell(current_row, total_col)
            total_cell.value = f"=SUM({get_column_letter(3)}{current_row}:{get_column_letter(total_col - 2)}{current_row})"
            total_cell.number_format = self.CURRENCY_FORMAT
            total_cell.border = self.THIN_BORDER

            current_row += 1

        # G&A row
        ws.cell(current_row, 2, "General & Administrative")
        ws.cell(current_row, 2).border = self.THIN_BORDER

        col = 3
        for year in range(1, self.total_years + 1):
            # Sum travel amounts for this period and multiply by G&A rate
            cell = ws.cell(current_row, col)
            cell.value = f"=SUM({get_column_letter(col)}{travel_start_row}:{get_column_letter(col)}{current_row - 1})*{ga_rate}"
            cell.number_format = self.CURRENCY_FORMAT
            cell.border = self.THIN_BORDER
            col += 2

        # Add Total column formula for G&A row
        total_cell = ws.cell(current_row, total_col)
        total_cell.value = f"=SUM({get_column_letter(3)}{current_row}:{get_column_letter(total_col - 2)}{current_row})"
        total_cell.number_format = self.CURRENCY_FORMAT
        total_cell.border = self.THIN_BORDER

        current_row += 1

        # Total row
        ws.cell(current_row, 2, "Total Travel")
        ws.cell(current_row, 2).font = self.BOLD_FONT
        ws.cell(current_row, 2).border = self.THIN_BORDER

        col = 3
        for year in range(1, self.total_years + 1):
            cell = ws.cell(current_row, col)
            cell.value = f"=SUM({get_column_letter(col)}{travel_start_row}:{get_column_letter(col)}{current_row - 1})"
            cell.number_format = self.CURRENCY_FORMAT
            cell.border = self.THIN_BORDER
            cell.font = self.BOLD_FONT
            col += 2

        # Add Total column formula for Total Travel row
        total_cell = ws.cell(current_row, total_col)
        total_cell.value = f"=SUM({get_column_letter(3)}{current_row}:{get_column_letter(total_col - 2)}{current_row})"
        total_cell.number_format = self.CURRENCY_FORMAT
        total_cell.border = self.THIN_BORDER
        total_cell.font = self.BOLD_FONT

    def _create_loe_sheet(self):
        """Create the Level of Effort (LOE) sheet showing hours per category."""
        ws = self.wb.create_sheet("LOE")

        # Column widths matching template
        ws.column_dimensions['A'].width = 2.33  # Padding
        ws.column_dimensions['B'].width = 50.5  # Labor Category
        ws.column_dimensions['C'].width = 20  # Company (NEW)
        ws.column_dimensions['D'].width = 19.66  # Site
        ws.column_dimensions['E'].width = 14.33  # Location

        # Apply standard header format (Rows 1-5)
        self._apply_standard_header(ws, start_col=2)

        # Column headers
        header_row = 10
        headers = ["Labor Category", "Company", "Site", "Location"]
        for idx, header in enumerate(headers):
            cell = ws.cell(header_row, 2 + idx)
            cell.value = header
            self._style_header_cell(cell)

        # Period columns (Hours only)
        col = 6  # Changed from 5 to 6 because we added Company column
        for year in range(1, self.total_years + 1):
            period_label = self._get_period_label(year)

            # Period header above (row 7) - Light blue background
            period_cell = ws.cell(7, col, period_label)
            self._style_period_header_cell(period_cell)

            # Column header for hours
            cell = ws.cell(header_row, col)
            cell.value = "Hours/Base"
            self._style_header_cell(cell)
            ws.column_dimensions[get_column_letter(col)].width = 14.33
            col += 1
            
        # Total Hours column
        ws.cell(header_row, col, "Total Hours")
        self._style_header_cell(ws.cell(header_row, col))
        total_col = col
        
        # Data rows
        current_row = header_row + 1
        positions = self.project_data.get('prime_positions', [])
        
        for position in positions:
            # Labor Category
            ws.cell(current_row, 2, position['labor_category'])
            ws.cell(current_row, 2).border = self.THIN_BORDER

            # Company (Prime)
            ws.cell(current_row, 3, self.project_data['prime_contractor_name'])
            ws.cell(current_row, 3).border = self.THIN_BORDER

            # Site
            ws.cell(current_row, 4, position.get('site', 'Government'))
            ws.cell(current_row, 4).border = self.THIN_BORDER

            # Location
            ws.cell(current_row, 5, position.get('location', ''))
            ws.cell(current_row, 5).border = self.THIN_BORDER

            # Hours per year
            hour_cells = []
            col = 6  # Changed from 5 to 6
            hours_data = position.get('hours_per_year', {})
            
            for year in range(1, self.total_years + 1):
                # Handle dictionary format {"1": 1880} or parsed format if different
                if isinstance(hours_data, dict):
                    hours = hours_data.get(str(year), 0)
                else:
                    hours = 0
                    
                cell = ws.cell(current_row, col)
                cell.value = hours
                cell.number_format = self.NUMBER_FORMAT
                cell.border = self.THIN_BORDER
                hour_cells.append(f"{get_column_letter(col)}{current_row}")
                col += 1
                
            # Total Hours
            cell = ws.cell(current_row, total_col)
            cell.value = f"={'+'.join(hour_cells)}"
            cell.number_format = self.NUMBER_FORMAT
            cell.border = self.THIN_BORDER
            cell.font = self.BOLD_FONT
            
            current_row += 1

        # Add subcontractor positions
        for sub in self.project_data.get('subcontractors', []):
            sub_name = sub.get('name', 'Subcontractor')

            for labor_cat in sub.get('labor_categories', []):
                # Labor Category
                ws.cell(current_row, 2, labor_cat['labor_category'])
                ws.cell(current_row, 2).border = self.THIN_BORDER

                # Company (Subcontractor)
                ws.cell(current_row, 3, sub_name)
                ws.cell(current_row, 3).border = self.THIN_BORDER

                # Site
                ws.cell(current_row, 4, labor_cat.get('site', 'Government'))
                ws.cell(current_row, 4).border = self.THIN_BORDER

                # Location
                ws.cell(current_row, 5, labor_cat.get('location', ''))
                ws.cell(current_row, 5).border = self.THIN_BORDER

                # Hours per year
                hour_cells = []
                col = 6
                for year in range(1, self.total_years + 1):
                    hours = labor_cat.get(f'year_{year}_hours', 0)

                    cell = ws.cell(current_row, col)
                    cell.value = hours
                    cell.number_format = self.NUMBER_FORMAT
                    cell.border = self.THIN_BORDER
                    hour_cells.append(f"{get_column_letter(col)}{current_row}")
                    col += 1

                # Total Hours
                cell = ws.cell(current_row, total_col)
                cell.value = f"={'+'.join(hour_cells)}"
                cell.number_format = self.NUMBER_FORMAT
                cell.border = self.THIN_BORDER
                cell.font = self.BOLD_FONT

                current_row += 1

        # Total Row (for all positions - prime + subcontractors)
        ws.cell(current_row, 2, "Total")
        ws.cell(current_row, 2).font = self.BOLD_FONT
        ws.cell(current_row, 2).border = self.THIN_BORDER

        col = 6  # Changed from 5 to 6
        for year in range(1, self.total_years + 2): # Periods + Total column
            cell = ws.cell(current_row, col)
            col_letter = get_column_letter(col)
            cell.value = f"=SUM({col_letter}{header_row+1}:{col_letter}{current_row-1})"
            cell.number_format = self.NUMBER_FORMAT
            cell.border = self.THIN_BORDER
            cell.font = self.BOLD_FONT
            col += 1

    def _create_indirect_rates_sheet(self):
        """Create the Indirect Rates reference sheet."""
        ws = self.wb.create_sheet("Indirect Rate")

        # Column widths matching template
        ws.column_dimensions['A'].width = 2.33  # Padding
        ws.column_dimensions['B'].width = 40.66  # Rate description
        ws.column_dimensions['C'].width = 15  # Rate value

        # Apply standard header format (Rows 1-5)
        self._apply_standard_header(ws, start_col=2)

        # Indirect Rates header (with blue background like template)
        header_cell = ws.cell(8, 2, "Indirect Rates")
        header_cell.font = self.HEADER_FONT
        header_cell.fill = self.HEADER_FILL
        header_cell.border = self.THIN_BORDER
        header_cell.alignment = Alignment(horizontal='center', vertical='center')
        ws.merge_cells('B8:C8')

        # Rate rows
        indirect_rates = self.project_data.get('indirect_rates', {})
        passthrough_rates = self.project_data.get('passthrough_rates', {})
        fee_rates = self.project_data.get('fee_rates', {})
        escalation_rates = self.project_data.get('escalation_rates', {})

        # Calculate combined passthrough rate (S&MH + G&A Passthrough)
        combined_passthrough = passthrough_rates.get('smh', 0) + passthrough_rates.get('ga', 0)

        rates = [
            ("Fringe", indirect_rates.get('fringe', 0)),
            ("Onsite Overhead (OH)", indirect_rates.get('oh_onsite', indirect_rates.get('oh', 0))),
            ("Offsite Overhead (OH)", indirect_rates.get('oh_offsite', indirect_rates.get('oh', 0))),
            ("General & Administrative (G&A)", indirect_rates.get('ga', 0)),
            ("Passthrough (S&MH + G&A)", combined_passthrough),
            ("Fee on Labor", fee_rates.get('prime_labor', 0)),
            ("Fee on Subcontractor", fee_rates.get('sub_labor', 0)),
        ]

        current_row = 9
        for label, rate in rates:
            label_cell = ws.cell(current_row, 2, label)
            label_cell.font = self.BOLD_FONT
            label_cell.border = self.THIN_BORDER

            cell = ws.cell(current_row, 3)
            cell.value = rate
            cell.number_format = self.PERCENT_FORMAT
            cell.border = self.THIN_BORDER
            cell.font = self.NORMAL_FONT

            current_row += 1

        # Escalation factors
        current_row += 1
        for year in range(1, self.total_years):
            key = f"{year}_to_{year + 1}"
            rate = escalation_rates.get(key, 0.03)

            label = f"Escalation Factor (Year {year} to {year + 1})"
            label_cell = ws.cell(current_row, 2, label)
            label_cell.font = self.BOLD_FONT
            label_cell.border = self.THIN_BORDER

            cell = ws.cell(current_row, 3)
            cell.value = rate
            cell.number_format = self.PERCENT_FORMAT
            cell.border = self.THIN_BORDER
            cell.font = self.NORMAL_FONT

            current_row += 1

    def _calculate_cost_elements(self) -> Dict[str, Dict[str, float]]:
        """
        Calculate all cost elements for the CE Summary sheet.

        Returns a dict with keys for each cost element, each containing
        year values and total.
        """
        result = {
            'direct_labor': {},
            'fringe': {},
            'overhead': {},
            'ga_labor': {},
            'subcontractors': {},
            'sub_handling': {},
            'materials': {},
            'material_handling': {},
            'travel': {},
            'ga_travel': {},
            'fee': {},
        }

        indirect_rates = self.project_data.get('indirect_rates', {})
        fringe_rate = indirect_rates.get('fringe', 0.25)
        oh_rate = indirect_rates.get('oh_onsite', indirect_rates.get('oh', 0.07))
        ga_rate = indirect_rates.get('ga', 0.22)
        smh_rate = self.project_data.get('passthrough_rates', {}).get('smh', 0.0671)
        fee_rates = self.project_data.get('fee_rates', {})
        prime_fee_rate = fee_rates.get('prime_labor', 0.08)
        sub_fee_rate = fee_rates.get('sub_labor', 0.0126)

        # Calculate prime labor costs
        for year in range(1, self.total_years + 1):
            year_key = f"year_{year}"

            dl_total = 0
            for position in self.project_data.get('prime_positions', []):
                results = Calculator.calculate_position_years(
                    position_data=position,
                    escalation_rates=self.project_data['escalation_rates'],
                    indirect_rates=indirect_rates,
                    total_years=self.total_years
                )
                year_data = results.get(year_key, {})
                # Direct Labor = DL rate × hours
                dl_total += year_data.get('dl_rate', 0) * year_data.get('hours', 0)

            # Use full precision - no rounding to match UI exactly
            result['direct_labor'][year_key] = dl_total
            result['fringe'][year_key] = dl_total * fringe_rate
            subtotal1 = dl_total + result['fringe'][year_key]
            result['overhead'][year_key] = subtotal1 * oh_rate
            subtotal2 = subtotal1 + result['overhead'][year_key]
            result['ga_labor'][year_key] = subtotal2 * ga_rate

            # Prime labor total for fee calculation
            prime_labor_total = subtotal2 + result['ga_labor'][year_key]

            # Subcontractor costs
            sub_total = 0
            for sub in self.project_data.get('subcontractors', []):
                for labor_cat in sub.get('labor_categories', []):
                    hours = labor_cat.get(f'year_{year}_hours', 0)
                    rate = labor_cat.get(f'year_{year}_rate', 0)
                    sub_total += hours * rate

            result['subcontractors'][year_key] = sub_total
            result['sub_handling'][year_key] = sub_total * smh_rate

            # Materials with escalation
            material_total = 0
            escalation_rates = self.project_data.get('escalation_rates', {})
            for odc in self.project_data.get('odcs', []):
                if 'amount_per_year' in odc:
                    base_amount = odc['amount_per_year'].get(str(year)) or 0
                else:
                    base_amount = odc.get('amount_year_1') or 0

                # Apply compound escalation if flag is set
                escalated_amount = base_amount
                escalate = odc.get('escalate', False)
                if escalate and year > 1:
                    for y in range(1, year):
                        esc_key = f"{y}_to_{y + 1}"
                        esc_rate = escalation_rates.get(esc_key) or 0
                        escalated_amount *= (1 + esc_rate)

                material_total += escalated_amount

            result['materials'][year_key] = material_total
            result['material_handling'][year_key] = material_total * smh_rate

            # Travel with escalation
            travel_total = 0
            for travel in self.project_data.get('travel', []):
                if 'amount_per_year' in travel:
                    base_amount = travel['amount_per_year'].get(str(year)) or 0
                else:
                    base_amount = travel.get('amount_year_1') or 0

                # Apply compound escalation if flag is set
                escalated_amount = base_amount
                escalate = travel.get('escalate', False)
                if escalate and year > 1:
                    for y in range(1, year):
                        esc_key = f"{y}_to_{y + 1}"
                        esc_rate = escalation_rates.get(esc_key) or 0
                        escalated_amount *= (1 + esc_rate)

                travel_total += escalated_amount

            result['travel'][year_key] = travel_total
            result['ga_travel'][year_key] = travel_total * ga_rate

            # Fee (on labor only) - use full precision
            prime_fee = prime_labor_total * prime_fee_rate
            sub_labor_with_handling = sub_total + result['sub_handling'][year_key]
            sub_fee = sub_labor_with_handling * sub_fee_rate
            result['fee'][year_key] = prime_fee + sub_fee

        # Calculate totals
        for key in result:
            result[key]['total'] = sum(
                v for k, v in result[key].items() if k.startswith('year_')
            )

        return result

    def _style_header_cell(self, cell):
        """Apply header styling to a cell."""
        cell.fill = self.HEADER_FILL
        cell.font = self.HEADER_FONT
        cell.border = self.THIN_BORDER
        cell.alignment = Alignment(horizontal='center', vertical='center')

    def _style_period_header_cell(self, cell):
        """Apply period header styling to a cell (light blue background)."""
        cell.fill = self.PERIOD_HEADER_FILL
        cell.font = self.BOLD_FONT
        cell.border = self.THIN_BORDER
        cell.alignment = Alignment(horizontal='center', vertical='center')

    def _style_subheader_cell(self, cell):
        """Apply sub-header styling to a cell."""
        cell.font = self.BOLD_FONT
        cell.border = self.THIN_BORDER
        cell.alignment = Alignment(horizontal='center', vertical='center')

    def _create_bls_analysis_sheet(self):
        """Create the BLS Analysis sheet showing all positions with wage percentiles."""
        ws = self.wb.create_sheet("BLS Analysis")

        # Column widths
        ws.column_dimensions['A'].width = 2.33  # Padding
        ws.column_dimensions['B'].width = 30  # Labor Category
        ws.column_dimensions['C'].width = 20  # Location
        ws.column_dimensions['D'].width = 50  # Description
        ws.column_dimensions['E'].width = 10  # Source
        ws.column_dimensions['F'].width = 15  # SOC Code
        ws.column_dimensions['G'].width = 35  # SOC Title / GSA Labor Category
        ws.column_dimensions['H'].width = 15  # 10th Percentile
        ws.column_dimensions['I'].width = 15  # 25th Percentile
        ws.column_dimensions['J'].width = 15  # 50th Percentile
        ws.column_dimensions['K'].width = 15  # 75th Percentile
        ws.column_dimensions['L'].width = 15  # 90th Percentile
        ws.column_dimensions['M'].width = 18  # Selected Wage

        # Apply standard header format (Rows 1-5)
        self._apply_standard_header(ws, start_col=2)

        # Additional title row
        ws.cell(7, 2, "Wage Data - All Positions with Percentiles")
        ws.cell(7, 2).font = self.BOLD_FONT

        # Column headers
        header_row = 8
        headers = [
            "Labor Category",
            "Location",
            "Description",
            "Source",
            "SOC Code",
            "SOC Title / GSA Labor Category",
            "10th Percentile",
            "25th Percentile",
            "50th Percentile\n(Median)",
            "75th Percentile",
            "90th Percentile",
            "Selected Wage/Rate"
        ]

        for idx, header in enumerate(headers):
            cell = ws.cell(header_row, 2 + idx)
            cell.value = header
            self._style_header_cell(cell)
            cell.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)

        # Data rows
        current_row = header_row + 1
        wage_data = self.project_data.get('wage_data', {})
        positions = wage_data.get('positions', [])

        for pos in positions:
            col = 2

            # Labor Category
            cell = ws.cell(current_row, col, pos.get('labor_category', ''))
            cell.border = self.THIN_BORDER
            cell.font = self.BOLD_FONT
            col += 1

            # Location
            cell = ws.cell(current_row, col, pos.get('location', ''))
            cell.border = self.THIN_BORDER
            col += 1

            # Description
            cell = ws.cell(current_row, col, pos.get('description', ''))
            cell.border = self.THIN_BORDER
            cell.alignment = Alignment(wrap_text=True, vertical='top')
            col += 1

            # Source (BLS or GSA)
            wage_source = pos.get('wage_source', 'bls').upper()
            cell = ws.cell(current_row, col, wage_source)
            cell.border = self.THIN_BORDER
            cell.alignment = Alignment(horizontal='center')
            if wage_source == 'GSA':
                cell.fill = PatternFill(start_color="DBEAFE", end_color="DBEAFE", fill_type="solid")
                cell.font = Font(bold=True, color="1E40AF")
            else:
                cell.fill = PatternFill(start_color="F3E8FF", end_color="F3E8FF", fill_type="solid")
                cell.font = Font(bold=True, color="7C3AED")
            col += 1

            # SOC Code (BLS only)
            if wage_source == 'BLS':
                cell = ws.cell(current_row, col, format_soc_code(pos.get('soc_code', '')))
            else:
                cell = ws.cell(current_row, col, '-')
            cell.border = self.THIN_BORDER
            col += 1

            # SOC Title / GSA Labor Category
            if wage_source == 'GSA':
                cell = ws.cell(current_row, col, pos.get('gsa_title', ''))
            else:
                cell = ws.cell(current_row, col, pos.get('soc_title', ''))
            cell.border = self.THIN_BORDER
            cell.alignment = Alignment(wrap_text=True, vertical='top')
            col += 1

            # Percentiles (BLS only, GSA shows '-')
            # Strip " (default)" suffix from percentile field
            raw_percentile = pos.get('percentile', '50th')
            selected_percentile = raw_percentile.replace(' (default)', '') if raw_percentile else '50th'

            # For highlighting, check if user manually edited (selected_salaries exists)
            selected_salaries = pos.get('selected_salaries', [])
            highlighted_percentile = None
            if selected_salaries and len(selected_salaries) > 0:
                # User edited - determine which percentile matches the selected wage
                avg_wage = sum(selected_salaries) / len(selected_salaries)
                rounded_avg = round(avg_wage)
                # Check which percentile wage matches
                for pct in ['10th', '25th', '50th', '75th', '90th']:
                    pct_wage = pos.get(f'wage_{pct}')
                    if pct_wage and round(pct_wage) == rounded_avg:
                        highlighted_percentile = pct
                        break
            else:
                # No user edit - use system's selected percentile
                highlighted_percentile = selected_percentile

            for percentile in ['10th', '25th', '50th', '75th', '90th']:
                if wage_source == 'BLS':
                    wage_key = f'wage_{percentile}'
                    wage_value = pos.get(wage_key)
                    cell = ws.cell(current_row, col)

                    if wage_value is not None:
                        cell.value = wage_value
                        cell.number_format = self.CURRENCY_FORMAT

                        # Highlight the percentile that's actually selected
                        if percentile == highlighted_percentile:
                            cell.fill = PatternFill(start_color="D1FAE5", end_color="D1FAE5", fill_type="solid")
                            cell.font = Font(bold=True, color="059669")
                        else:
                            cell.font = Font(color="7C3AED")
                    else:
                        cell.value = '-'
                        cell.alignment = Alignment(horizontal='center')
                else:
                    cell = ws.cell(current_row, col, '-')
                    cell.alignment = Alignment(horizontal='center')

                cell.border = self.THIN_BORDER
                col += 1

            # Selected Wage/Rate
            cell = ws.cell(current_row, col)

            if wage_source == 'GSA':
                # For GSA, get the current year's rate
                gsa_rates = pos.get('gsa_rates_by_year', {})
                current_year = pos.get('gsa_current_year', 1)
                custom_rate = pos.get('gsa_custom_rate')

                if custom_rate is not None:
                    selected_wage = custom_rate
                else:
                    selected_wage = gsa_rates.get(str(current_year), 0)
            else:
                # For BLS: prioritize user edits, then system selection
                if selected_salaries and len(selected_salaries) > 0:
                    # User edited - show average
                    selected_wage = sum(selected_salaries) / len(selected_salaries)
                elif pos.get('selected_wage'):
                    # System selected wage
                    selected_wage = pos.get('selected_wage')
                else:
                    # Fallback to percentile lookup (with cleaned percentile)
                    selected_wage = pos.get(f'wage_{selected_percentile}', 0)

            cell.value = selected_wage if selected_wage else 0
            cell.number_format = self.CURRENCY_FORMAT
            cell.border = self.THIN_BORDER
            cell.fill = PatternFill(start_color="DBEAFE", end_color="DBEAFE", fill_type="solid")
            cell.font = Font(bold=True, color="1E40AF")

            current_row += 1

        # Set row height for better readability
        for row_idx in range(header_row + 1, current_row):
            ws.row_dimensions[row_idx].height = 40
