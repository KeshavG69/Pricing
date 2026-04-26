"""
Chart tool — adapted from Kroolo's enterprise-fastapi/utils/visualization_tool.py.

Validates Chart.js code from the agent, asks the LLM to fix it on validation
failure, and returns a clean config object the frontend can render.
"""

from agno.tools import tool
import re
import logging
from typing import Tuple

from app.settings import settings
from client.llm_client import get_chat_llm

logger = logging.getLogger(__name__)


def validate_javascript_code(code: str) -> Tuple[bool, str]:
    if not code or not code.strip():
        return False, "Code is empty"

    if code.count("{") != code.count("}"):
        return False, f"Unbalanced curly braces: {code.count('{')} open, {code.count('}')} close"
    if code.count("(") != code.count(")"):
        return False, f"Unbalanced parentheses: {code.count('(')} open, {code.count(')')} close"
    if code.count("[") != code.count("]"):
        return False, f"Unbalanced square brackets: {code.count('[')} open, {code.count(']')} close"

    if not re.search(r"new\s+Chart\s*\(", code):
        return False, "No Chart.js constructor found (e.g., new Chart())"

    for pattern, error in [
        (r"\btype\s*:", "Missing 'type' configuration"),
        (r"\bdata\s*:", "Missing 'data' configuration"),
    ]:
        if not re.search(pattern, code):
            return False, error

    return True, ""


def extract_config_object(code: str) -> str:
    """Strip the `new Chart(ctx, ...)` wrapper, returning just the config object."""
    pattern = r"new\s+Chart\s*\(\s*[^,]+,\s*"
    match = re.search(pattern, code, re.IGNORECASE | re.DOTALL)
    if match:
        config = code[match.end():]
        config = re.sub(r"[\s);]+$", "", config, flags=re.DOTALL)
        return config.strip()
    return code


_CORRECTION_SYSTEM_PROMPT = """You are an expert JavaScript developer specializing in Chart.js visualizations.

Your task is to fix and rewrite broken JavaScript Chart.js code into complete, production-ready, executable code.

MANDATORY REQUIREMENTS:
1. Use new Chart(ctx, {...}) constructor
2. Include complete chart configuration object with:
   - type: 'line' | 'bar' | 'pie' | 'doughnut' | 'radar' | 'polarArea' | 'bubble' | 'scatter'
   - data: { labels: [...], datasets: [{ label, data, backgroundColor, borderColor }] }
   - options: { plugins: { title, legend }, scales: { x, y } }
3. All braces, brackets, and parentheses must be properly matched
4. Syntactically correct, executable JavaScript
5. Include proper styling (backgroundColor, borderColor)
6. Include responsive options
7. Code should be production-ready and complete

Return ONLY the corrected JavaScript code. No explanations, no markdown blocks, no backticks."""


async def correct_code_with_llm(code: str, validation_error: str) -> str:
    """Ask the LLM to repair invalid Chart.js code."""
    llm = get_chat_llm(
        model="google/gemini-3-flash-preview",
        api_key=settings.OPENROUTER_API_KEY,
        base_url="https://openrouter.ai/api/v1",
    )

    user_prompt = (
        f"The following Chart.js code has validation errors. Fix it and return only the corrected code.\n\n"
        f"Validation Error: {validation_error}\n\nBroken Code:\n{code}"
    )

    response = await llm.ainvoke([
        {"role": "system", "content": _CORRECTION_SYSTEM_PROMPT},
        {"role": "user", "content": user_prompt},
    ])
    fixed = (response.content or "").strip()
    fixed = re.sub(r"^```javascript\s*\n", "", fixed)
    fixed = re.sub(r"^```js\s*\n", "", fixed)
    fixed = re.sub(r"^```\s*\n", "", fixed)
    fixed = re.sub(r"\n```\s*$", "", fixed)
    return fixed.strip()


@tool(stop_after_tool_call=False)
async def chart_tool(code: str):
    """
    📊 Build a Chart.js visualization from pricing data.

    USE THIS for any visualization the user asks for — cost-by-year bars,
    prime-vs-sub pie charts, FBLR comparison across positions, escalation
    trends, location-type breakdowns, percentile distributions, etc.

    HOW IT WORKS:
    Provide Chart.js JavaScript. Don't worry about syntax — the tool
    validates and auto-corrects via LLM. The frontend renders the returned
    config object as an interactive chart.

    SUPPORTED TYPES:
    bar, line, pie, doughnut, scatter, radar, polarArea, bubble

    EXAMPLE — cost by year bar chart:
    ```javascript
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Year 1', 'Year 2', 'Year 3', 'Year 4', 'Year 5'],
            datasets: [{
                label: 'Total Cost',
                data: [513682, 529093, 544966, 561314, 578154],
                backgroundColor: 'rgba(54, 162, 235, 0.6)',
                borderColor: 'rgba(54, 162, 235, 1)'
            }]
        },
        options: {
            responsive: true,
            plugins: {
                title: { display: true, text: 'Cost by Year' }
            }
        }
    });
    ```

    PRICING-DATA WORKFLOW:
    1. Use python_repl_tool to compute the data series from <proposal_state>
    2. Hardcode the resulting numbers into the Chart.js code below
    3. Pass to this tool

    Args:
        code: Chart.js JavaScript code (basic structure is fine — auto-fixed).

    Returns:
        Dict with `success`, `code` (cleaned config object), `validation_status`, `error`.
    """
    try:
        is_valid, error_msg = validate_javascript_code(code)

        if is_valid:
            return {
                "success": True,
                "code": extract_config_object(code),
                "validation_status": "valid",
                "error": None,
            }

        logger.warning(f"[chart_tool] validation failed: {error_msg}")

        try:
            corrected = await correct_code_with_llm(code, error_msg)
            ok, err2 = validate_javascript_code(corrected)
            if ok:
                return {
                    "success": True,
                    "code": extract_config_object(corrected),
                    "validation_status": "corrected",
                    "error": None,
                }
            return {
                "success": False,
                "code": extract_config_object(corrected),
                "validation_status": "failed",
                "error": f"LLM correction failed validation: {err2}",
            }
        except Exception as e:
            logger.error(f"[chart_tool] LLM correction failed: {e}", exc_info=True)
            return {
                "success": False,
                "code": extract_config_object(code),
                "validation_status": "error",
                "error": f"LLM correction error: {e}",
            }

    except Exception as e:
        logger.error(f"[chart_tool] unexpected error: {e}", exc_info=True)
        return {
            "success": False,
            "code": extract_config_object(code) if code else "",
            "validation_status": "error",
            "error": f"Unexpected error: {e}",
        }
