"""
Excel Generator for Government Contract Cost Proposals.

Generates professional Excel files matching the Intprepix format:
- Dynamic year columns (adjusts to contract length)
- Prime labor with full FBLR calculations
- Subcontractor rates (simple table, no calculation breakdown)
- Pass-through costs (prime's management overhead)
- Fee calculations (profit)
- ODCs (Other Direct Costs)
"""

from typing import Dict, List, Any
from openpyxl import Workbook
from openpyxl.styles import Font, Alignment, Border, Side, PatternFill
from openpyxl.utils import get_column_letter
from .calculation_service import Calculator


class ExcelGenerator:
    """
    Generates government contract cost proposal Excel files.

    Creates professional, formatted Excel workbooks with:
    - Dynamic year columns based on contract structure
    - Prime contractor labor calculations
    - Subcontractor rate tables (no calculation details)
    - Pass-through and fee sections
    - ODC sections
    """

    def __init__(self):
        """Initialize the Excel generator."""
        self.wb = None
        self.ws = None
        self.row_trackers = {}  # Track important row numbers for references

    def generate_cost_proposal(self, project_data: Dict[str, Any]) -> Workbook:
        """
        Generate complete cost proposal Excel workbook.

        Args:
            project_data: Complete project data including:
                - solicitation_number: str
                - prime_contractor_name: str
                - subcontractor_names: List[str]
                - dcaa_contact: str (optional)
                - total_years: int
                - base_years: int
                - option_years: int
                - escalation_rates: Dict[str, float]
                - indirect_rates: Dict[str, float] (fringe, oh, ga)
                - prime_positions: List[Dict]
                - subcontractors: List[Dict]
                - passthrough_rates: Dict[str, float] (smh, ga)
                - fee_rates: Dict[str, float] (prime_labor, sub_labor)
                - odcs: List[Dict]
                - ga_adder_rate: float
                - include_rate_table: bool (optional, default True)

        Returns:
            Workbook ready to save
        """
        # Create workbook
        self.wb = Workbook()
        self.ws = self.wb.active
        self.ws.title = "Cost Proposal Spreadsheet"

        # Extract key configuration
        total_years = project_data['total_years']

        # Default months if missing (backward compatibility)
        if 'months_per_year' not in project_data or project_data['months_per_year'] is None:
            project_data['months_per_year'] = {
                str(year): 12 for year in range(1, total_years + 1)
            }

        # Build Excel section by section
        current_row = 1

        # Header section (rows 1-10)
        current_row = self._write_header_section(self.ws, project_data, total_years)

        # Prime labor section
        prime_start_row = current_row
        current_row = self._write_prime_labor_section(
            self.ws,
            project_data['prime_positions'],
            project_data['indirect_rates'],
            project_data['escalation_rates'],
            project_data['fee_rates'],
            current_row,
            total_years
        )
        self.row_trackers['prime_labor_end'] = current_row - 1

        # Subcontractor section (only if subcontractors exist)
        if project_data['subcontractors'] and len(project_data['subcontractors']) > 0:
            sub_start_row = current_row
            current_row = self._write_subcontractor_section(
                self.ws,
                project_data['subcontractors'],
                current_row,
                total_years
            )
            self.row_trackers['sub_labor_end'] = current_row - 1
        else:
            self.row_trackers['sub_labor_end'] = current_row - 1

        # Pass-through section (only if subcontractors exist)
        if project_data['subcontractors'] and len(project_data['subcontractors']) > 0:
            current_row = self._write_passthrough_section(
                self.ws,
                project_data['passthrough_rates'],
                current_row,
                total_years
            )

        # Fee section
        current_row = self._write_fee_section(
            self.ws,
            project_data['fee_rates'],
            current_row,
            total_years
        )

        # ODC section
        current_row = self._write_odc_section(
            self.ws,
            project_data['odcs'],
            project_data['ga_adder_rate'],
            project_data['escalation_rates'],
            current_row,
            total_years
        )

        # Apply formatting
        self._apply_formatting(self.ws, total_years)

        # Add Sheet 2: Subcontractor Fee/MH Rate Table (only if subcontractors exist)
        has_subcontractors = project_data.get('subcontractors') and len(project_data['subcontractors']) > 0
        if has_subcontractors and project_data.get('include_rate_table', True):
            self._create_rate_table_sheet(project_data)

        return self.wb

    def _write_header_section(self, ws, project_data: Dict, total_years: int) -> int:
        """
        Write header section (rows 1-10).

        Includes:
        - Solicitation number and escalation rate labels
        - Company names (prime and subcontractors)
        - DCAA contact info
        - Year column headers (dynamic based on total_years)
        - Sub-headers (Cost Elements, Labor Category, etc.)

        Args:
            ws: Worksheet
            project_data: Project configuration
            total_years: Total number of years

        Returns:
            Next available row number
        """
        # Row 1: Solicitation number and escalation labels
        ws.cell(1, 1, f"SOLICITATION NO. {project_data['solicitation_number']}")

        # Add escalation labels in year columns (every 3rd column starting at I/9)
        esc_col = 9
        for i in range(total_years - 1):
            ws.cell(1, esc_col, "Escalation")
            esc_col += 3

        # Row 2: Title and escalation rates
        ws.cell(2, 1, "COST PROPOSAL SPREADSHEET")

        # Put escalation rates in their columns
        escalation_rates = project_data['escalation_rates']
        esc_col = 9
        for year in range(1, total_years):
            key = f"{year}_to_{year+1}"
            rate = escalation_rates.get(key, 0)
            ws.cell(2, esc_col, rate)
            esc_col += 3

        # Row 4-6: Company information
        ws.cell(4, 1, f"Prime Offeror Name: {project_data['prime_contractor_name']}")

        sub_names = ", ".join(project_data.get('subcontractor_names', []))
        ws.cell(5, 1, f"Subcontractor Name (if applicable): {sub_names}")

        dcaa = project_data.get('dcaa_contact', '')
        ws.cell(6, 1, f"DCAA Point of Contact Information: {dcaa}")

        # Row 7: Year column headers (DYNAMIC)
        ws.cell(7, 4, "Total for All Years")  # Column D

        # Get months_per_year
        months_per_year = project_data.get('months_per_year', {})

        # Base Period - starts at column 7 (G) to align with Rate column
        col_offset = 7  # Column G
        base_months = months_per_year.get('1', 12)
        base_label = f"Base Period ({base_months} mo)" if base_months != 12 else "Base Period"
        ws.cell(7, col_offset, base_label)

        # Option Years
        option_years = total_years - project_data['base_years']
        for year_num in range(1, option_years + 1):
            col_offset += 3  # Each year takes 3 columns
            year_key = str(year_num + project_data['base_years'])
            option_months = months_per_year.get(year_key, 12)
            option_label = f"Option Year {year_num}"
            if option_months != 12:
                option_label += f" ({option_months} mo)"
            ws.cell(7, col_offset, option_label)

        # Row 8: Sub-headers (also dynamic)
        ws.cell(8, 1, "Cost Elements")
        ws.cell(8, 2, "Company Labor Category")
        ws.cell(8, 3, "BLS Labor Category")
        ws.cell(8, 4, "BLS Code")
        ws.cell(8, 5, "Hours")
        ws.cell(8, 6, "Amount")

        # For each year: Rate, Hours, Amount
        col_offset = 7
        for year in range(1, total_years + 1):
            ws.cell(8, col_offset, "Rate")
            ws.cell(8, col_offset + 1, "Hours")
            ws.cell(8, col_offset + 2, "Amount")
            col_offset += 3

        # Averaged FBLR columns (after all year columns)
        avg_fblr_start_col = 7 + (total_years * 3)
        ws.cell(7, avg_fblr_start_col, "Averaged FBLR")
        # Merge cells for averaged FBLR header (spans 6 columns)
        ws.merge_cells(
            start_row=7,
            start_column=avg_fblr_start_col,
            end_row=7,
            end_column=avg_fblr_start_col + 5
        )

        # Sub-headers for averaged FBLR
        ws.cell(8, avg_fblr_start_col, "DL Rate ($/hr)")
        ws.cell(8, avg_fblr_start_col + 1, "Fringe ($/hr)")
        ws.cell(8, avg_fblr_start_col + 2, "OH ($/hr)")
        ws.cell(8, avg_fblr_start_col + 3, "G&A ($/hr)")
        ws.cell(8, avg_fblr_start_col + 4, "Fee ($/hr)")
        ws.cell(8, avg_fblr_start_col + 5, "FBLR ($/hr)")

        # Row 9: Add editable rates reference section (far right columns)
        # These cells will be referenced by all formulas
        # Place them in columns starting AFTER the averaged FBLR columns
        # Averaged FBLR ends at: avg_fblr_start_col + 5, so start at +7 for safety
        rates_col = avg_fblr_start_col + 7  # Start after averaged FBLR columns

        ws.cell(1, rates_col, "RATES REFERENCE")
        ws.cell(2, rates_col, "Edit these values to update all calculations")

        # Indirect rates
        ws.cell(3, rates_col, "Fringe Rate:")
        ws.cell(3, rates_col + 1, project_data['indirect_rates']['fringe'])
        self.row_trackers['fringe_rate_cell'] = f"{get_column_letter(rates_col + 1)}3"

        ws.cell(4, rates_col, "OH Rate:")
        ws.cell(4, rates_col + 1, project_data['indirect_rates']['oh'])
        self.row_trackers['oh_rate_cell'] = f"{get_column_letter(rates_col + 1)}4"

        ws.cell(5, rates_col, "G&A Rate:")
        ws.cell(5, rates_col + 1, project_data['indirect_rates']['ga'])
        self.row_trackers['ga_rate_cell'] = f"{get_column_letter(rates_col + 1)}5"

        # Fee rates
        ws.cell(6, rates_col, "Prime Labor Fee:")
        ws.cell(6, rates_col + 1, project_data['fee_rates']['prime_labor'])
        self.row_trackers['prime_fee_rate_cell'] = f"{get_column_letter(rates_col + 1)}6"

        ws.cell(7, rates_col, "Sub Labor Fee:")
        ws.cell(7, rates_col + 1, project_data['fee_rates']['sub_labor'])
        self.row_trackers['sub_fee_rate_cell'] = f"{get_column_letter(rates_col + 1)}7"

        # Passthrough rates
        ws.cell(8, rates_col, "S&MH Rate:")
        ws.cell(8, rates_col + 1, project_data['passthrough_rates']['smh'])
        self.row_trackers['smh_rate_cell'] = f"{get_column_letter(rates_col + 1)}8"

        ws.cell(9, rates_col, "G&A Passthrough:")
        ws.cell(9, rates_col + 1, project_data['passthrough_rates']['ga'])
        self.row_trackers['ga_passthrough_rate_cell'] = f"{get_column_letter(rates_col + 1)}9"

        # ODC rate
        ws.cell(10, rates_col, "G&A Adder (ODC):")
        ws.cell(10, rates_col + 1, project_data['ga_adder_rate'])
        self.row_trackers['ga_adder_rate_cell'] = f"{get_column_letter(rates_col + 1)}10"

        # Row 9-10: Section headers (back to main content area)
        ws.cell(9, 1, "Prime Contractor Labor Cost")
        ws.cell(10, 1, "Prime Contractor Direct Labor")

        return 11  # Next section starts at row 11

    def _write_prime_labor_section(
        self,
        ws,
        positions: List[Dict],
        indirect_rates: Dict[str, float],
        escalation_rates: Dict[str, float],
        fee_rates: Dict[str, float],
        start_row: int,
        total_years: int
    ) -> int:
        """
        Write prime contractor labor section.

        For each position:
        - Name | Labor Category | eCRAFT Code
        - Total hours and amount (SUM formulas)
        - Year-by-year: Rate, Hours, Amount

        Uses Calculator.calculate_position_years() for FBLR calculations.

        Args:
            ws: Worksheet
            positions: List of position data dicts
            indirect_rates: Fringe, OH, G&A rates
            escalation_rates: Year-over-year escalation
            fee_rates: Fee rates for prime and sub labor
            start_row: Starting row number
            total_years: Total years in contract

        Returns:
            Next available row number
        """
        current_row = start_row

        for position in positions:
            # Calculate year-by-year costs using Calculator
            results = Calculator.calculate_position_years(
                position_data=position,
                escalation_rates=escalation_rates,
                indirect_rates=indirect_rates,
                total_years=total_years
            )

            # Column A: Name (or "TBD")
            ws.cell(current_row, 1, position.get('name', 'TBD'))

            # Column B: Labor Category
            ws.cell(current_row, 2, position['labor_category'])

            # Column C: BLS Labor Category
            ws.cell(current_row, 3, position['ecraft_code'])

            # Column D: BLS Code
            ws.cell(current_row, 4, position.get('bls_code', ''))

            # Build year column cell references for SUM formulas
            year_hour_cells = []
            year_amount_cells = []

            for year in range(1, total_years + 1):
                col_offset = self._calculate_column_offset(year)
                hour_col = get_column_letter(col_offset + 1)
                amount_col = get_column_letter(col_offset + 2)
                year_hour_cells.append(f"{hour_col}{current_row}")
                year_amount_cells.append(f"{amount_col}{current_row}")

            # Column E: Total Hours (SUM formula)
            ws.cell(current_row, 5, f"={'+'.join(year_hour_cells)}")

            # Column F: Total Amount (SUM formula)
            ws.cell(current_row, 6, f"={'+'.join(year_amount_cells)}")

            # Year-by-year data
            for year in range(1, total_years + 1):
                year_data = results[f'year_{year}']
                col_offset = self._calculate_column_offset(year)

                # Rate
                ws.cell(current_row, col_offset, year_data['rate'])

                # Hours
                ws.cell(current_row, col_offset + 1, year_data['hours'])

                # Amount (formula: Rate × Hours)
                rate_cell = get_column_letter(col_offset) + str(current_row)
                hours_cell = get_column_letter(col_offset + 1) + str(current_row)
                ws.cell(current_row, col_offset + 2, f"={rate_cell}*{hours_cell}")

            # Averaged FBLR calculation
            base_wage = position.get(f"wage_{position['percentile']}", 0)
            hours_per_year = position.get('hours_per_year', {})
            standard_fte_hours = position.get('standard_fte_hours', 1880)

            avg_fblr = Calculator.calculate_averaged_fblr(
                base_wage=base_wage,
                hours_per_year=hours_per_year,
                escalation_rates=escalation_rates,
                fringe_rate=indirect_rates['fringe'],
                oh_rate=indirect_rates['oh'],
                ga_rate=indirect_rates['ga'],
                fee_rate=fee_rates['prime_labor'],
                standard_fte_hours=standard_fte_hours,
                total_years=total_years
            )

            # Write averaged FBLR values with currency formatting
            avg_fblr_start_col = 7 + (total_years * 3)
            currency_format = '_($* #,##0.00_);_($* (#,##0.00);_($* "-"??_);_(@_)'

            ws.cell(current_row, avg_fblr_start_col, avg_fblr['dl_rate'])
            ws.cell(current_row, avg_fblr_start_col).number_format = currency_format

            ws.cell(current_row, avg_fblr_start_col + 1, avg_fblr['fringe'])
            ws.cell(current_row, avg_fblr_start_col + 1).number_format = currency_format

            ws.cell(current_row, avg_fblr_start_col + 2, avg_fblr['oh'])
            ws.cell(current_row, avg_fblr_start_col + 2).number_format = currency_format

            ws.cell(current_row, avg_fblr_start_col + 3, avg_fblr['ga'])
            ws.cell(current_row, avg_fblr_start_col + 3).number_format = currency_format

            ws.cell(current_row, avg_fblr_start_col + 4, avg_fblr['fee'])
            ws.cell(current_row, avg_fblr_start_col + 4).number_format = currency_format

            ws.cell(current_row, avg_fblr_start_col + 5, avg_fblr['fblr'])
            ws.cell(current_row, avg_fblr_start_col + 5).number_format = currency_format

            current_row += 1

        # Total Direct Labor row
        total_dl_row = current_row
        ws.cell(current_row, 1, "Total Direct Labor")

        # Add formulas for each year column
        for year in range(1, total_years + 1):
            col_offset = self._calculate_column_offset(year)
            amount_col = get_column_letter(col_offset + 2)
            ws.cell(current_row, col_offset + 2, f"=SUM({amount_col}{start_row}:{amount_col}{current_row-1})")

        # Total column (column F)
        ws.cell(current_row, 6, f"=SUM(F{start_row}:F{current_row-1})")
        current_row += 1

        # Indirect costs breakdown with formulas
        # Fringe row
        fringe_row = current_row
        fringe_rate_cell = self.row_trackers['fringe_rate_cell']
        ws.cell(current_row, 1, "Fringe")
        for year in range(1, total_years + 1):
            col_offset = self._calculate_column_offset(year)
            amount_col = get_column_letter(col_offset + 2)
            ws.cell(current_row, col_offset + 2, f"={amount_col}{total_dl_row}*${fringe_rate_cell}")
        ws.cell(current_row, 6, f"=F{total_dl_row}*${fringe_rate_cell}")
        current_row += 1

        # Subtotal after Fringe
        subtotal_1_row = current_row
        ws.cell(current_row, 1, "Subtotal (DL + Fringe)")
        for year in range(1, total_years + 1):
            col_offset = self._calculate_column_offset(year)
            amount_col = get_column_letter(col_offset + 2)
            ws.cell(current_row, col_offset + 2, f"={amount_col}{total_dl_row}+{amount_col}{fringe_row}")
        ws.cell(current_row, 6, f"=F{total_dl_row}+F{fringe_row}")
        current_row += 1

        # Overhead row
        oh_row = current_row
        oh_rate_cell = self.row_trackers['oh_rate_cell']
        ws.cell(current_row, 1, "Overhead")
        for year in range(1, total_years + 1):
            col_offset = self._calculate_column_offset(year)
            amount_col = get_column_letter(col_offset + 2)
            ws.cell(current_row, col_offset + 2, f"={amount_col}{subtotal_1_row}*${oh_rate_cell}")
        ws.cell(current_row, 6, f"=F{subtotal_1_row}*${oh_rate_cell}")
        current_row += 1

        # Subtotal after OH
        subtotal_2_row = current_row
        ws.cell(current_row, 1, "Subtotal (DL + Fringe + OH)")
        for year in range(1, total_years + 1):
            col_offset = self._calculate_column_offset(year)
            amount_col = get_column_letter(col_offset + 2)
            ws.cell(current_row, col_offset + 2, f"={amount_col}{subtotal_1_row}+{amount_col}{oh_row}")
        ws.cell(current_row, 6, f"=F{subtotal_1_row}+F{oh_row}")
        current_row += 1

        # G&A row
        ga_row = current_row
        ga_rate_cell = self.row_trackers['ga_rate_cell']
        ws.cell(current_row, 1, "G&A")
        for year in range(1, total_years + 1):
            col_offset = self._calculate_column_offset(year)
            amount_col = get_column_letter(col_offset + 2)
            ws.cell(current_row, col_offset + 2, f"={amount_col}{subtotal_2_row}*${ga_rate_cell}")
        ws.cell(current_row, 6, f"=F{subtotal_2_row}*${ga_rate_cell}")
        current_row += 1

        # Total Prime Labor (DL + Fringe + OH + G&A)
        ws.cell(current_row, 1, "Total Prime Labor Cost (FBLR)")
        for year in range(1, total_years + 1):
            col_offset = self._calculate_column_offset(year)
            amount_col = get_column_letter(col_offset + 2)
            ws.cell(current_row, col_offset + 2, f"={amount_col}{subtotal_2_row}+{amount_col}{ga_row}")
        ws.cell(current_row, 6, f"=F{subtotal_2_row}+F{ga_row}")
        current_row += 2

        return current_row

    def _write_subcontractor_section(
        self,
        ws,
        subcontractors: List[Dict],
        start_row: int,
        total_years: int
    ) -> int:
        """
        Write subcontractor section (SIMPLE - just rates, no calculation breakdown).

        For each subcontractor:
        - Company name
        - Labor categories with their provided FBLR rates
        - No individual employee breakdown
        - No Fee/S&MH calculation details

        Args:
            ws: Worksheet
            subcontractors: List of subcontractor data
            start_row: Starting row number
            total_years: Total years in contract

        Returns:
            Next available row number
        """
        current_row = start_row

        # Section headers
        ws.cell(current_row, 1, "Subcontractor Labor Cost")
        current_row += 1
        ws.cell(current_row, 1, "Subcontractor proposed cost and fee")
        current_row += 1

        # Track start for total calculation
        sub_data_start = current_row

        # For each subcontractor company
        for idx, sub in enumerate(subcontractors, 1):
            # Company header
            ws.cell(current_row, 1, f"Subcontractor {idx} ({sub['name']})")
            current_row += 1

            # Labor category rate table (no individual employees)
            for labor_cat_data in sub['labor_categories']:
                # Column A: Blank or placeholder
                ws.cell(current_row, 1, "")

                # Column B: Labor Category
                ws.cell(current_row, 2, labor_cat_data['labor_category'])

                # Column C: eCRAFT Code
                ws.cell(current_row, 3, labor_cat_data['ecraft_code'])

                # Build year cell references for SUM
                year_hour_cells = []
                year_amount_cells = []

                for year in range(1, total_years + 1):
                    col_offset = self._calculate_column_offset(year)
                    hour_col = get_column_letter(col_offset + 1)
                    amount_col = get_column_letter(col_offset + 2)
                    year_hour_cells.append(f"{hour_col}{current_row}")
                    year_amount_cells.append(f"{amount_col}{current_row}")

                # Column D: Total Hours (SUM formula)
                ws.cell(current_row, 4, f"={'+'.join(year_hour_cells)}")

                # Column E: Total Amount (SUM formula)
                ws.cell(current_row, 5, f"={'+'.join(year_amount_cells)}")

                # Year-by-year data (rates provided by subcontractor)
                for year in range(1, total_years + 1):
                    col_offset = self._calculate_column_offset(year)

                    # Get rate and hours from subcontractor data (required, no defaults)
                    year_rate = labor_cat_data[f'year_{year}_rate']
                    year_hours = labor_cat_data[f'year_{year}_hours']

                    # Write rate
                    ws.cell(current_row, col_offset, year_rate)

                    # Write hours
                    ws.cell(current_row, col_offset + 1, year_hours)

                    # Write amount formula (Rate × Hours)
                    rate_cell = get_column_letter(col_offset) + str(current_row)
                    hours_cell = get_column_letter(col_offset + 1) + str(current_row)
                    ws.cell(current_row, col_offset + 2, f"={rate_cell}*{hours_cell}")

                current_row += 1

            # Blank row between subcontractors
            current_row += 1

        # Total subcontractor labor row
        ws.cell(current_row, 1, "Total proposed subcontractor labor cost and fee")
        ws.cell(current_row, 5, f"=SUM(E{sub_data_start}:E{current_row-1})")
        self.row_trackers['sub_labor_total'] = current_row
        current_row += 2

        return current_row

    def _write_passthrough_section(
        self,
        ws,
        passthrough_rates: Dict[str, float],
        start_row: int,
        total_years: int
    ) -> int:
        """
        Write prime contractor pass-through section.

        Pass-through covers prime's costs for managing subcontractors:
        - S&MH (Subcontractor & Material Handling)
        - G&A (if applicable)
        - Other costs

        Applied to total subcontractor costs.

        Args:
            ws: Worksheet
            passthrough_rates: Dict with 'smh' and 'ga' rates
            start_row: Starting row number
            total_years: Total years in contract

        Returns:
            Next available row number
        """
        current_row = start_row

        # Section header
        ws.cell(current_row, 1, "Prime contractor pass through (not including fee)")
        current_row += 1

        # Get subcontractor total row reference
        sub_total_row = self.row_trackers.get('sub_labor_total', start_row - 3)

        # S&MH (Handling) row
        ws.cell(current_row, 1, "Handling")

        smh_rate = passthrough_rates['smh']  # Required, no default
        smh_rate_cell = self.row_trackers['smh_rate_cell']
        ws.cell(current_row, 6, smh_rate)  # Show rate in Base Period column

        # Calculate S&MH for each year
        year_smh_cells = []
        for year in range(1, total_years + 1):
            col_offset = self._calculate_column_offset(year)
            amount_col = get_column_letter(col_offset + 2)

            # Reference subcontractor amount for this year
            sub_amount_cell = f"{amount_col}{sub_total_row}"

            # S&MH = sub_amount × smh_rate (reference cell)
            ws.cell(current_row, col_offset + 2, f"={sub_amount_cell}*${smh_rate_cell}")
            year_smh_cells.append(f"{amount_col}{current_row}")

        # Total S&MH
        ws.cell(current_row, 5, f"={'+'.join(year_smh_cells)}")
        current_row += 1

        # G&A row (if applicable)
        ga_rate = passthrough_rates.get('ga', 0)
        ga_passthrough_cell = self.row_trackers['ga_passthrough_rate_cell']
        if ga_rate > 0:
            ws.cell(current_row, 1, "G&A")
            ws.cell(current_row, 6, ga_rate)
            # Calculate G&A passthrough for each year
            year_ga_cells = []
            for year in range(1, total_years + 1):
                col_offset = self._calculate_column_offset(year)
                amount_col = get_column_letter(col_offset + 2)
                sub_amount_cell = f"{amount_col}{sub_total_row}"
                ws.cell(current_row, col_offset + 2, f"={sub_amount_cell}*${ga_passthrough_cell}")
                year_ga_cells.append(f"{amount_col}{current_row}")
            ws.cell(current_row, 5, f"={'+'.join(year_ga_cells)}")
            current_row += 1

        # Other row (placeholder)
        ws.cell(current_row, 1, "Other (if any)")
        current_row += 1

        # Total pass-through row
        ws.cell(current_row, 1, "Total pass through (not including fee)")
        current_row += 1

        # Total Subcontractor Cost including pass-through
        ws.cell(current_row, 1, "Total Subcontractor Cost including pass through")
        current_row += 2

        return current_row

    def _write_fee_section(
        self,
        ws,
        fee_rates: Dict[str, float],
        start_row: int,
        total_years: int
    ) -> int:
        """
        Write fee (profit) section.

        Calculates prime contractor's profit on:
        - Prime labor (higher fee rate, e.g., 8%)
        - Subcontractor labor (lower fee rate, e.g., 1.26%)

        Args:
            ws: Worksheet
            fee_rates: Dict with 'prime_labor' and 'sub_labor' fee rates
            start_row: Starting row number
            total_years: Total years in contract

        Returns:
            Next available row number
        """
        current_row = start_row

        # Total Labor Cost row
        ws.cell(current_row, 1, "Total Labor Cost (Prime and Subcontractor Labor)")
        current_row += 2

        # Fixed Fee section header
        ws.cell(current_row, 1, "Fixed Fee")
        current_row += 1

        # Prime contractor fee for prime labor
        ws.cell(current_row, 1, "Prime Contractor Fee for Prime Contractor Labor")

        prime_fee_rate = fee_rates['prime_labor']  # Required, no default
        ws.cell(current_row, 6, prime_fee_rate)  # Show rate
        current_row += 1

        # Prime contractor fee for subcontractor labor
        ws.cell(current_row, 1, "Prime Contractor Fee for Subcontractor Labor *")

        sub_fee_rate = fee_rates['sub_labor']  # Required, no default
        ws.cell(current_row, 6, sub_fee_rate)  # Show rate
        current_row += 1

        # Total Fee row
        ws.cell(current_row, 1, "Total Fee (for Prime and Subcontractor Labor)")
        current_row += 2

        # Total Labor Cost Plus Fixed Fee (CPFF)
        ws.cell(current_row, 1, "Total Labor Cost Plus Fixed Fee (CPFF)")
        current_row += 2

        return current_row

    def _write_odc_section(
        self,
        ws,
        odcs: List[Dict],
        ga_adder_rate: float,
        escalation_rates: Dict[str, float],
        start_row: int,
        total_years: int
    ) -> int:
        """
        Write Other Direct Costs (ODCs) section.

        ODCs include travel, materials, equipment, etc.
        Each ODC can be:
        - Fixed (same amount all years) or Escalating (increases with inflation)
        - With or without G&A adder

        Uses Calculator.calculate_odc_years() for calculations.

        Args:
            ws: Worksheet
            odcs: List of ODC data dicts
            ga_adder_rate: G&A rate to apply to ODCs
            escalation_rates: Year-over-year escalation rates
            start_row: Starting row number
            total_years: Total years in contract

        Returns:
            Next available row number
        """
        current_row = start_row

        # Section header
        ws.cell(current_row, 1, "Other Direct Costs")
        current_row += 1

        odc_start_row = current_row

        # Process each ODC
        for odc in odcs:
            # Use Calculator to get year-by-year costs
            results = Calculator.calculate_odc_years(
                odc_data=odc,
                ga_adder_rate=ga_adder_rate,
                escalation_rates=escalation_rates,
                total_years=total_years,
                apply_adder=odc.get('apply_adder', True),
                escalate=odc.get('escalate', False)
            )

            # Write ODC category
            ws.cell(current_row, 1, odc['category'])

            # Build year cell references
            year_amount_cells = []

            # Write year-by-year amounts
            for year in range(1, total_years + 1):
                year_data = results[f'year_{year}']
                col_offset = self._calculate_column_offset(year)

                # Write total amount (base + G&A adder)
                amount_col = get_column_letter(col_offset + 2)
                ws.cell(current_row, col_offset + 2, year_data['total'])
                year_amount_cells.append(f"{amount_col}{current_row}")

            # Write total in column E
            ws.cell(current_row, 5, f"={'+'.join(year_amount_cells)}")

            current_row += 1

        # Total ODCs row
        ws.cell(current_row, 1, "Total Other Direct Costs")
        ws.cell(current_row, 5, f"=SUM(E{odc_start_row}:E{current_row-1})")
        current_row += 2

        # GRAND TOTAL
        ws.cell(current_row, 1, "GRAND TOTAL (Labor + Fee + ODCs)")
        current_row += 1

        return current_row

    def _calculate_column_offset(self, year_num: int) -> int:
        """
        Calculate Excel column number for a given year.

        Base Period (Year 1) starts at column 7 (G).
        Each year takes 3 columns (Rate, Hours, Amount).

        Args:
            year_num: Year number (1, 2, 3, ...)

        Returns:
            Column number (1-indexed)
        """
        return 7 + ((year_num - 1) * 3)

    def _apply_formatting(self, ws, total_years: int):
        """
        Apply professional formatting to the worksheet.

        Includes:
        - Column widths
        - Bold headers
        - Borders
        - Number formatting (currency, percentages)
        - Cell fills for headers
        - Freeze panes

        Args:
            ws: Worksheet
            total_years: Total years in contract
        """
        # Column widths
        ws.column_dimensions['A'].width = 35  # Cost Elements
        ws.column_dimensions['B'].width = 30  # Labor Category
        ws.column_dimensions['C'].width = 25  # BLS Labor Category
        ws.column_dimensions['D'].width = 12  # BLS Code
        ws.column_dimensions['E'].width = 15  # Total Hours
        ws.column_dimensions['F'].width = 15  # Total Amount

        # Year columns (start at G/column 7)
        for year in range(total_years):
            col_offset = 7 + (year * 3)
            ws.column_dimensions[get_column_letter(col_offset)].width = 12      # Rate
            ws.column_dimensions[get_column_letter(col_offset + 1)].width = 10  # Hours
            ws.column_dimensions[get_column_letter(col_offset + 2)].width = 15  # Amount

        # Header formatting (rows 1-10)
        header_font = Font(bold=True, size=11)
        for row in range(1, 11):
            for col in range(1, 7 + (total_years * 3)):
                cell = ws.cell(row, col)
                if cell.value:
                    cell.font = header_font

        # Solicitation row - bigger font
        ws.cell(1, 1).font = Font(bold=True, size=12)

        # Year headers (row 7) - filled and centered
        year_fill = PatternFill(start_color="D3D3D3", end_color="D3D3D3", fill_type="solid")
        ws.cell(7, 4).fill = year_fill  # Total for All Years column

        for year in range(total_years):
            col_offset = 7 + (year * 3)  # Start at column G
            cell = ws.cell(7, col_offset)
            cell.fill = year_fill
            cell.alignment = Alignment(horizontal='center', vertical='center')

        # Format Averaged FBLR header (only write to top-left cell of merged range)
        avg_fblr_start_col = 7 + (total_years * 3)
        avg_fblr_cell = ws.cell(7, avg_fblr_start_col)
        avg_fblr_cell.fill = year_fill
        avg_fblr_cell.alignment = Alignment(horizontal='center', vertical='center')

        # Sub-headers (row 8) - centered (including averaged FBLR columns)
        for col in range(1, 7 + (total_years * 3) + 6):  # +6 for averaged FBLR columns
            cell = ws.cell(8, col)
            if cell.value:
                cell.alignment = Alignment(horizontal='center', vertical='center')
                cell.font = Font(bold=True, size=10)

        # Number formatting
        for row in range(11, ws.max_row + 1):
            # Total Hours column (E) - plain number, no currency
            ws.cell(row, 5).number_format = '#,##0'

            # Total Amount column (F) - currency
            ws.cell(row, 6).number_format = '_($* #,##0.00_);_($* (#,##0.00);_($* "-"??_);_(@_)'

            # Year columns
            for year in range(total_years):
                col_offset = 7 + (year * 3)  # Start at column G

                # Rate column - currency
                ws.cell(row, col_offset).number_format = '_($* #,##0.00_);_($* (#,##0.00);_($* "-"??_);_(@_)'

                # Hours column - plain number, no currency
                ws.cell(row, col_offset + 1).number_format = '#,##0'

                # Amount column - currency
                ws.cell(row, col_offset + 2).number_format = '_($* #,##0.00_);_($* (#,##0.00);_($* "-"??_);_(@_)'

        # Freeze panes - freeze top 10 rows and first 3 columns
        ws.freeze_panes = 'D11'

        # Highlight editable rate reference cells (rows 3-10)
        # Light yellow fill to indicate these are user-editable
        rate_fill = PatternFill(start_color="FFFF99", end_color="FFFF99", fill_type="solid")
        # Calculate where rates section is (after averaged FBLR columns)
        avg_fblr_start_col = 7 + (total_years * 3)
        rates_col = avg_fblr_start_col + 7 + 1  # +1 because values are in the column AFTER labels

        for row_num in range(3, 11):  # Rows 3-10 contain the rate values
            cell = ws.cell(row_num, rates_col)
            cell.fill = rate_fill
            # Also format as percentage
            cell.number_format = '0.00%'
            # Make bold
            cell.font = Font(bold=True, size=11)

        # Set column widths for rates reference section
        # Calculate where rates section is (after averaged FBLR columns)
        avg_fblr_start_col = 7 + (total_years * 3)
        rates_col = avg_fblr_start_col + 7

        ws.column_dimensions[get_column_letter(rates_col)].width = 20  # Labels column
        ws.column_dimensions[get_column_letter(rates_col + 1)].width = 15  # Values column

    def _create_rate_table_sheet(self, project_data: Dict[str, Any]):
        """
        Create Sheet 2: Subcontractor Fee_MH Rate Table.

        This sheet shows the calculation formulas for subcontractor rates,
        demonstrating how Fee and S&MH are calculated from base rates.

        Similar to Intprepix Volume III Sheet 2 structure.

        Args:
            project_data: Project configuration
        """
        # Create new sheet
        ws2 = self.wb.create_sheet("Subcontractor Fee_MH Rate Table")

        # Get rates from project data (no fallbacks - must be provided)
        fee_rate = project_data['fee_rates']['sub_labor']
        smh_rate = project_data['passthrough_rates']['smh']
        prime_name = project_data['prime_contractor_name']

        # Get first subcontractor rate for example calculation
        example_rate = 100  # Default if no subcontractors (but Sheet 2 shouldn't exist without subs)
        if project_data.get('subcontractors') and len(project_data['subcontractors']) > 0:
            first_sub = project_data['subcontractors'][0]
            if first_sub.get('labor_categories') and len(first_sub['labor_categories']) > 0:
                example_rate = first_sub['labor_categories'][0].get('year_1_rate', 100)

        # Example calculation section (Rows 2-4, Columns B-F)
        ws2.cell(2, 3, f"{prime_name} FBLR")  # Dynamic prime contractor name

        # Row 3: FEE calculation example
        ws2.cell(3, 2, "FEE")
        ws2.cell(3, 3, example_rate)  # Use actual first subcontractor rate
        ws2.cell(3, 4, fee_rate)  # Fee rate
        ws2.cell(3, 5, "=C3*D3")  # Fee amount
        ws2.cell(3, 6, "=C3+E3")  # Total with fee

        # Row 4: S&MH calculation example
        ws2.cell(4, 2, "S&MH")
        ws2.cell(4, 3, "=F3")  # Reference total from row 3
        ws2.cell(4, 4, smh_rate)  # S&MH rate
        ws2.cell(4, 5, "=C4*D4")  # S&MH amount
        ws2.cell(4, 6, "=C4+E4")  # Final total

        # Rows 7-8: BACKWARD/REVERSE calculation (remove S&MH first, then FEE)
        # This shows how to go from final billable rate back to base rate

        # Row 7: Remove S&MH from final rate
        ws2.cell(7, 2, "S&MH")
        ws2.cell(7, 3, "=F4")  # Start with final rate from row 4
        ws2.cell(7, 4, smh_rate)  # S&MH rate
        ws2.cell(7, 5, "=C7*D7/(1+D7)")  # S&MH amount (reverse calc)
        ws2.cell(7, 6, "=C7-E7")  # Total after removing S&MH

        # Row 8: Remove FEE from subtotal
        ws2.cell(8, 2, "FEE")
        ws2.cell(8, 3, "=F7")  # Start with subtotal from row 7
        ws2.cell(8, 4, fee_rate)  # Fee rate
        ws2.cell(8, 5, "=C8*D8/(1+D8)")  # Fee amount (reverse calc)
        ws2.cell(8, 6, "=C8-E8")  # Final base rate (should match C3)

        # Rate table section (Columns H-O)
        # Row 2: Store reference rates
        ws2.cell(2, 10, "=D8")  # J2: FEE rate reference (derived)
        ws2.cell(2, 11, "=D7")  # K2: S&MH rate reference (derived)
        ws2.cell(2, 13, "=D4")  # M2: S&MH rate for reverse calc (original)
        ws2.cell(2, 14, "=D3")  # N2: FEE rate for reverse calc (original)

        # Row 3: Column headers
        ws2.cell(3, 8, "Labor Category")
        ws2.cell(3, 9, f"{prime_name} FBLR")  # Dynamic prime contractor name
        ws2.cell(3, 10, "FEE")
        ws2.cell(3, 11, "S&MH")
        ws2.cell(3, 12, "Target Rate")
        ws2.cell(3, 13, "S&MH")
        ws2.cell(3, 14, "FEE")
        ws2.cell(3, 15, "Diff Check")

        # Extract unique labor categories from subcontractors
        labor_categories = []
        if 'subcontractors' in project_data:
            for sub in project_data['subcontractors']:
                for cat in sub.get('labor_categories', []):
                    labor_categories.append({
                        'name': cat['labor_category'],
                        'rate': cat['year_1_rate']  # Required field, no fallback
                    })

        # Write labor categories with formulas (starting row 4)
        current_row = 4
        for cat in labor_categories:
            # Column H: Labor Category
            ws2.cell(current_row, 8, cat['name'])

            # Column I: Base FBLR (Nexagen rate)
            ws2.cell(current_row, 9, cat['rate'])

            # Forward calculation (remove fee and S&MH from base)
            # Column J: FEE = ROUND(I - (I * fee_rate), 0)
            ws2.cell(current_row, 10, f"=ROUND(I{current_row}-(I{current_row}*$J$2),0)")

            # Column K: S&MH = ROUND(J - (J * smh_rate), 0)
            ws2.cell(current_row, 11, f"=ROUND(J{current_row}-(J{current_row}*$K$2),0)")

            # Column L: Target Rate (after removing both)
            ws2.cell(current_row, 12, f"=ROUND(K{current_row},0)")

            # Reverse calculation (add S&MH and fee to target)
            # Column M: S&MH = ROUND(L + (L * smh_rate), 0)
            ws2.cell(current_row, 13, f"=ROUND(L{current_row}+(L{current_row}*$M$2),0)")

            # Column N: FEE = ROUND(M + (M * fee_rate), 0)
            ws2.cell(current_row, 14, f"=ROUND(M{current_row}+(M{current_row}*$N$2),0)")

            # Column O: Diff Check (should be 0 or close to 0)
            ws2.cell(current_row, 15, f"=I{current_row}-N{current_row}")

            current_row += 1

        # Formatting for Sheet 2
        self._format_rate_table_sheet(ws2, len(labor_categories))

    def _format_rate_table_sheet(self, ws, num_categories: int):
        """
        Apply formatting to the rate table sheet.

        Args:
            ws: Rate table worksheet
            num_categories: Number of labor categories
        """
        # Column widths
        ws.column_dimensions['B'].width = 12
        ws.column_dimensions['C'].width = 15
        ws.column_dimensions['D'].width = 12
        ws.column_dimensions['E'].width = 12
        ws.column_dimensions['F'].width = 15
        ws.column_dimensions['H'].width = 35
        ws.column_dimensions['I'].width = 15
        ws.column_dimensions['J'].width = 12
        ws.column_dimensions['K'].width = 12
        ws.column_dimensions['L'].width = 12
        ws.column_dimensions['M'].width = 12
        ws.column_dimensions['N'].width = 12
        ws.column_dimensions['O'].width = 12

        # Header formatting (row 3)
        header_font = Font(bold=True, size=11)
        header_fill = PatternFill(start_color="D3D3D3", end_color="D3D3D3", fill_type="solid")

        for col_idx in [8, 9, 10, 11, 12, 13, 14, 15]:
            cell = ws.cell(3, col_idx)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = Alignment(horizontal='center', vertical='center')

        # Example calculation section formatting
        ws.cell(2, 3).font = Font(bold=True, size=11)
        ws.cell(3, 2).font = Font(bold=True)
        ws.cell(4, 2).font = Font(bold=True)

        # Number formatting - currency for rate columns
        for row in range(4, 4 + num_categories):
            ws.cell(row, 9).number_format = '$#,##0.00'   # Base FBLR
            ws.cell(row, 10).number_format = '$#,##0.00'  # FEE
            ws.cell(row, 11).number_format = '$#,##0.00'  # S&MH
            ws.cell(row, 12).number_format = '$#,##0.00'  # Target
            ws.cell(row, 13).number_format = '$#,##0.00'  # S&MH reverse
            ws.cell(row, 14).number_format = '$#,##0.00'  # FEE reverse
            ws.cell(row, 15).number_format = '$#,##0.00'  # Diff

        # Percentage formatting for rates in example section
        ws.cell(3, 4).number_format = '0.00%'
        ws.cell(4, 4).number_format = '0.00%'

        # Currency formatting for example section
        for col_idx in [3, 5, 6]:
            ws.cell(3, col_idx).number_format = '$#,##0.00'
            ws.cell(4, col_idx).number_format = '$#,##0.00'
