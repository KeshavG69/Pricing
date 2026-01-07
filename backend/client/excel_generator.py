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


class ExcelGenerator:
    """
    Generates government contract cost proposal Excel files.
    Matches the Price IQ Sample Template format.
    """

    # Style constants matching sample template
    HEADER_FILL = PatternFill(start_color="284C82", end_color="284C82", fill_type="solid")
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
        
        # Create sheets in order (matching sample template)
        # 1. CE Summary (Cost Element Summary) - the main sheet
        self._create_ce_summary_sheet()

        # 2. Labor Detail - Prime contractor labor categories
        self._create_labor_detail_sheet()

        # 3. Subcontractor sheets - One per subcontractor
        if project_data.get('subcontractors'):
            for idx, sub in enumerate(project_data['subcontractors'], 1):
                self._create_subcontractor_sheet(sub, idx)

        # 4. Material sheet (ODCs excluding travel)
        if project_data.get('odcs'):
            self._create_material_sheet()

        # 5. Travel sheet
        if project_data.get('travel'):
            self._create_travel_sheet()

        # 6. LOE sheet - Level of Effort (Hours only)
        self._create_loe_sheet()

        # 7. Indirect Rates reference sheet
        self._create_indirect_rates_sheet()

        # Remove default empty sheet if exists
        if 'Sheet' in self.wb.sheetnames:
            del self.wb['Sheet']

        return self.wb

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
        """Create the CE Summary (Cost Element Summary) sheet."""
        ws = self.wb.active
        ws.title = "CE Summary"

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

        # Header section (Rows 1-5)
        ws.cell(1, 2, "Proprietary Data")
        ws.cell(2, 2, f"Prime Contractor Name: {self.project_data['prime_contractor_name']}")

        sub_names = ", ".join(self.project_data.get('subcontractor_names', []))
        ws.cell(3, 2, f"Subcontractor(s) Name: {sub_names}")

        ws.cell(4, 2, f"Solicitation: {self.project_data['solicitation_number']}")
        ws.cell(5, 2, f"Task Order Number: {self.project_data.get('task_order_number', '')}")

        # Row 9: Column headers
        header_row = 9
        ws.cell(header_row, 2, "Cost Element")
        self._style_header_cell(ws.cell(header_row, 2))

        # Period column headers
        col = 3
        for year in range(1, self.total_years + 1):
            label = self._get_period_label(year)
            ws.cell(header_row, col, label)
            self._style_header_cell(ws.cell(header_row, col))
            col += 1

        # Total column
        ws.cell(header_row, col, "Total")
        self._style_header_cell(ws.cell(header_row, col))
        total_col = col

        # Row 10: "Cost" sub-header for each period
        for c in range(3, total_col + 1):
            ws.cell(10, c, "Cost")
            self._style_subheader_cell(ws.cell(10, c))

        # Cost Element rows (starting row 11)
        data_start_row = 11
        current_row = data_start_row

        # Calculate base totals (aggregated from positions/subcontractors/odcs)
        cost_elements = self._calculate_cost_elements()

        # Get rates for formulas
        indirect_rates = self.project_data.get('indirect_rates', {})
        fringe_rate = indirect_rates.get('fringe', 0.247)
        oh_rate = indirect_rates.get('oh_onsite', indirect_rates.get('oh', 0.0711))
        ga_rate = indirect_rates.get('ga', 0.2243)
        smh_rate = self.project_data.get('passthrough_rates', {}).get('smh', 0.0665)

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

        # Row 16: Subcontractor Handling (FORMULA: Sub * smh_rate)
        sub_handling_row = current_row
        ws.cell(current_row, 2, "Subcontractor Handling")
        ws.cell(current_row, 2).font = self.BOLD_FONT
        ws.cell(current_row, 2).border = self.THIN_BORDER
        for period_idx in range(self.total_years):
            col_letter = get_column_letter(3 + period_idx)
            cell = ws.cell(current_row, 3 + period_idx)
            cell.value = f"={col_letter}{sub_row}*{smh_rate}"
            cell.number_format = self.CURRENCY_FORMAT
            cell.border = self.THIN_BORDER
        cell = ws.cell(current_row, total_col)
        cell.value = f"={get_column_letter(total_col)}{sub_row}*{smh_rate}"
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

    def _create_labor_detail_sheet(self):
        """Create the Labor Detail sheet for prime contractor positions."""
        ws = self.wb.create_sheet("Labor Detail")

        # Column widths matching template
        ws.column_dimensions['A'].width = 2.33  # Padding
        ws.column_dimensions['B'].width = 50.5  # Labor Category
        ws.column_dimensions['C'].width = 19.66  # Site
        ws.column_dimensions['D'].width = 14.33  # Location (if used) or first Hours column

        # Header section
        ws.cell(1, 2, "Proprietary Data")
        ws.cell(2, 2, f"Prime Contractor Name: {self.project_data['prime_contractor_name']}")

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

            # Period header above sub-headers (row 7)
            ws.cell(7, col, period_label)
            ws.cell(7, col).font = self.BOLD_FONT
            ws.cell(7, col).alignment = Alignment(horizontal='center')

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

                # Rate (FBLR)
                rate_col = col
                cell = ws.cell(current_row, col)
                cell.value = year_data.get('rate', 0)
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

    def _create_subcontractor_sheet(self, sub_data: Dict, sub_index: int):
        """Create a sheet for a single subcontractor."""
        sheet_name = f"Subcontractor {sub_index}"
        ws = self.wb.create_sheet(sheet_name)

        # Column widths matching template
        ws.column_dimensions['A'].width = 2.33  # Padding
        ws.column_dimensions['B'].width = 50.5  # Labor Category
        ws.column_dimensions['C'].width = 19.66  # Site

        # Header
        ws.cell(1, 2, "Proprietary Data")
        ws.cell(2, 2, f"Subcontractor Name: {sub_data['name']}")

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

            # Period header above (row 7)
            ws.cell(7, col, period_label)
            ws.cell(7, col).font = self.BOLD_FONT
            ws.cell(7, col).alignment = Alignment(horizontal='center')

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

        # Total row
        ws.cell(current_row, 2, f"Total {sub_data['name']}")
        ws.cell(current_row, 2).font = self.BOLD_FONT
        ws.cell(current_row, 2).border = self.THIN_BORDER

        cell = ws.cell(current_row, total_col)
        cell.value = f"=SUM({get_column_letter(total_col)}{header_row + 1}:{get_column_letter(total_col)}{current_row - 1})"
        cell.number_format = self.CURRENCY_FORMAT
        cell.border = self.THIN_BORDER
        cell.font = self.BOLD_FONT

    def _create_material_sheet(self):
        """Create the Material sheet for ODCs."""
        ws = self.wb.create_sheet("Material")

        # Column widths matching template
        ws.column_dimensions['A'].width = 2.33  # Padding
        ws.column_dimensions['B'].width = 40.66  # Material description

        # Header
        ws.cell(1, 2, "Proprietary Data")
        ws.cell(2, 2, f"Prime Contractor Name: {self.project_data['prime_contractor_name']}")

        # Period columns
        header_row = 8
        col = 3

        for year in range(1, self.total_years + 1):
            period_label = self._get_period_label(year)
            ws.cell(header_row, col, period_label)
            self._style_header_cell(ws.cell(header_row, col))
            ws.column_dimensions[get_column_letter(col)].width = 18
            ws.column_dimensions[get_column_letter(col + 1)].width = 15
            col += 2  # Amount and handling columns

        # Total column
        ws.cell(header_row, col, "Total")
        self._style_header_cell(ws.cell(header_row, col))
        total_col = col

        # Material rows
        current_row = header_row + 2
        smh_rate = self.project_data.get('passthrough_rates', {}).get('smh', 0.0671)

        odcs = self.project_data.get('odcs', [])
        material_start_row = current_row

        for odc in odcs:
            # Material base row
            ws.cell(current_row, 2, odc['category'])
            ws.cell(current_row, 2).border = self.THIN_BORDER

            col = 3
            for year in range(1, self.total_years + 1):
                # Check for pre-calculated amounts
                if 'amount_per_year' in odc:
                    amount = odc['amount_per_year'].get(str(year), 0)
                else:
                    amount = odc.get('amount_year_1', 0)

                cell = ws.cell(current_row, col)
                cell.value = amount
                cell.number_format = self.CURRENCY_FORMAT
                cell.border = self.THIN_BORDER
                col += 2

            current_row += 1

            # Material Handling row
            ws.cell(current_row, 2, f"{odc['category']} Handling")
            ws.cell(current_row, 2).border = self.THIN_BORDER

            col = 3
            for year in range(1, self.total_years + 1):
                material_cell = f"{get_column_letter(col)}{current_row - 1}"
                cell = ws.cell(current_row, col)
                cell.value = f"={material_cell}*{smh_rate}"
                cell.number_format = self.CURRENCY_FORMAT
                cell.border = self.THIN_BORDER
                col += 2

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

    def _create_travel_sheet(self):
        """Create the Travel sheet."""
        ws = self.wb.create_sheet("Travel")

        # Column widths matching template
        ws.column_dimensions['A'].width = 2.33  # Padding
        ws.column_dimensions['B'].width = 40.66  # Travel description

        # Header
        ws.cell(1, 2, "Proprietary Data")
        ws.cell(2, 2, f"Prime Contractor Name: {self.project_data['prime_contractor_name']}")

        # Period columns
        header_row = 8
        col = 3

        for year in range(1, self.total_years + 1):
            period_label = self._get_period_label(year)
            ws.cell(header_row, col, period_label)
            self._style_header_cell(ws.cell(header_row, col))
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

        for travel in travel_items:
            description = travel.get('description', 'Travel')

            # Travel base row
            ws.cell(current_row, 2, description)
            ws.cell(current_row, 2).border = self.THIN_BORDER

            col = 3
            for year in range(1, self.total_years + 1):
                if 'amount_per_year' in travel:
                    amount = travel['amount_per_year'].get(str(year), 0)
                else:
                    amount = travel.get('amount_year_1', 0)

                cell = ws.cell(current_row, col)
                cell.value = amount
                cell.number_format = self.CURRENCY_FORMAT
                cell.border = self.THIN_BORDER
                col += 2

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

    def _create_loe_sheet(self):
        """Create the Level of Effort (LOE) sheet showing hours per category."""
        ws = self.wb.create_sheet("LOE")

        # Column widths matching template
        ws.column_dimensions['A'].width = 2.33  # Padding
        ws.column_dimensions['B'].width = 50.5  # Labor Category
        ws.column_dimensions['C'].width = 19.66  # Site
        ws.column_dimensions['D'].width = 14.33  # Location

        # Header
        ws.cell(1, 2, "Proprietary Data")
        ws.cell(2, 2, f"Prime Contractor Name: {self.project_data['prime_contractor_name']}")

        # Column headers
        header_row = 10
        headers = ["Labor Category", "Site", "Location"]
        for idx, header in enumerate(headers):
            cell = ws.cell(header_row, 2 + idx)
            cell.value = header
            self._style_header_cell(cell)
            
        # Period columns (Hours only)
        col = 5
        for year in range(1, self.total_years + 1):
            period_label = self._get_period_label(year)

            # Period header above (row 7)
            ws.cell(7, col, period_label)
            ws.cell(7, col).font = self.BOLD_FONT
            ws.cell(7, col).alignment = Alignment(horizontal='center')

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
            ws.cell(current_row, 2, position['labor_category'])
            ws.cell(current_row, 2).border = self.THIN_BORDER
            
            ws.cell(current_row, 3, position.get('site', 'Government'))
            ws.cell(current_row, 3).border = self.THIN_BORDER
            
            ws.cell(current_row, 4, position.get('location', ''))
            ws.cell(current_row, 4).border = self.THIN_BORDER
            
            # Hours per year
            hour_cells = []
            col = 5
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
            
        # Total Row
        if positions:
            ws.cell(current_row, 2, "Total")
            ws.cell(current_row, 2).font = self.BOLD_FONT
            ws.cell(current_row, 2).border = self.THIN_BORDER
            
            col = 5
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

        # Header
        ws.cell(1, 2, "Proprietary Data")
        ws.cell(2, 2, f"Prime Contractor Name: {self.project_data['prime_contractor_name']}")

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

        rates = [
            ("Fringe", indirect_rates.get('fringe', 0)),
            ("Onsite Overhead (OH)", indirect_rates.get('oh_onsite', indirect_rates.get('oh', 0))),
            ("Offsite Overhead (OH)", indirect_rates.get('oh_offsite', indirect_rates.get('oh', 0))),
            ("General & Administrative (G&A)", indirect_rates.get('ga', 0)),
            ("Subcontractor Material Handling (S&MH)", passthrough_rates.get('smh', 0)),
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

            result['direct_labor'][year_key] = round(dl_total, 2)
            result['fringe'][year_key] = round(dl_total * fringe_rate, 2)
            subtotal1 = dl_total + result['fringe'][year_key]
            result['overhead'][year_key] = round(subtotal1 * oh_rate, 2)
            subtotal2 = subtotal1 + result['overhead'][year_key]
            result['ga_labor'][year_key] = round(subtotal2 * ga_rate, 2)

            # Prime labor total for fee calculation
            prime_labor_total = subtotal2 + result['ga_labor'][year_key]

            # Subcontractor costs
            sub_total = 0
            for sub in self.project_data.get('subcontractors', []):
                for labor_cat in sub.get('labor_categories', []):
                    hours = labor_cat.get(f'year_{year}_hours', 0)
                    rate = labor_cat.get(f'year_{year}_rate', 0)
                    sub_total += hours * rate

            result['subcontractors'][year_key] = round(sub_total, 2)
            result['sub_handling'][year_key] = round(sub_total * smh_rate, 2)

            # Materials
            material_total = 0
            for odc in self.project_data.get('odcs', []):
                if 'amount_per_year' in odc:
                    material_total += odc['amount_per_year'].get(str(year), 0)
                else:
                    material_total += odc.get('amount_year_1', 0)

            result['materials'][year_key] = round(material_total, 2)
            result['material_handling'][year_key] = round(material_total * smh_rate, 2)

            # Travel
            travel_total = 0
            for travel in self.project_data.get('travel', []):
                if 'amount_per_year' in travel:
                    travel_total += travel['amount_per_year'].get(str(year), 0)
                else:
                    travel_total += travel.get('amount_year_1', 0)

            result['travel'][year_key] = round(travel_total, 2)
            result['ga_travel'][year_key] = round(travel_total * ga_rate, 2)

            # Fee (on labor only)
            prime_fee = prime_labor_total * prime_fee_rate
            sub_labor_with_handling = sub_total + result['sub_handling'][year_key]
            sub_fee = sub_labor_with_handling * sub_fee_rate
            result['fee'][year_key] = round(prime_fee + sub_fee, 2)

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

    def _style_subheader_cell(self, cell):
        """Apply sub-header styling to a cell."""
        cell.font = self.BOLD_FONT
        cell.border = self.THIN_BORDER
        cell.alignment = Alignment(horizontal='center', vertical='center')
