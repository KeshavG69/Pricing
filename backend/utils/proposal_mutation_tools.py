"""
Mutation logic for proposal rates and positions.

Pure Python — no agno decorator. The agno @tool wrapping (with
`requires_confirmation=True` + identity closure) lives in agno_tools.py:

  create_update_rates_tool / create_update_positions_tool

This file owns:
  - Field-level validation (rate keys, percentile, location_type, etc.)
  - The actual MongoDB writes (atomic dot-notation $set so sibling fields
    aren't clobbered)
  - Building the change descriptor that the frontend uses to patch its local
    pricingStore in-place after a successful confirmation

Both `apply_rate_update` and `apply_position_update` take identity (proposal,
user, org, role) as explicit args so they're easy to unit-test and reuse.
"""

import logging
from typing import Any, Dict, List, Optional

from utils.proposals import get_proposal_crud

logger = logging.getLogger(__name__)


# ─── Validation tables ───────────────────────────────────────────────────

# Indirect rate keys we accept on update_rates.
_VALID_RATE_KEYS = {
    "fringe",
    "oh_onsite",
    "oh_offsite",
    "ga",
    "fee",
    "smh",
    "ga_passthrough",
    "sub_fee",
    "ot_multiplier",
    "surge_multiplier",
}

_VALID_PERCENTILES = {"10th", "25th", "50th", "75th", "90th"}
_VALID_LOCATION_TYPES = {"On-Site", "Off-Site"}

_VALID_POSITION_FIELDS = {
    "percentile",
    "location_type",
    "custom_salary",
    "hours_per_year",
    "gsa_discount_rate",
    "ot_hours_per_year",
    "is_key_position",
}


# ─── Validation helpers ───────────────────────────────────────────────────

def _validate_rates(rates: Dict[str, Any]) -> Dict[str, float]:
    cleaned: Dict[str, float] = {}
    for k, v in rates.items():
        if k not in _VALID_RATE_KEYS:
            raise ValueError(
                f"Unknown rate key '{k}'. Valid keys: {sorted(_VALID_RATE_KEYS)}"
            )
        try:
            cleaned[k] = float(v)
        except (TypeError, ValueError):
            raise ValueError(f"Rate '{k}' must be numeric, got {v!r}")
    return cleaned


def _validate_escalation(escalation_rates: Dict[str, Any]) -> Dict[str, float]:
    cleaned: Dict[str, float] = {}
    for k, v in escalation_rates.items():
        if not isinstance(k, str) or "_to_" not in k:
            raise ValueError(
                f"Escalation key '{k}' must be of the form 'N_to_M' (e.g. '1_to_2')."
            )
        try:
            cleaned[k] = float(v)
        except (TypeError, ValueError):
            raise ValueError(f"Escalation '{k}' must be numeric, got {v!r}")
    return cleaned


def _validate_position_update(fields: Dict[str, Any]) -> Dict[str, Any]:
    """Coerce + validate a single position's `fields` dict."""
    cleaned: Dict[str, Any] = {}
    for k, v in fields.items():
        if k not in _VALID_POSITION_FIELDS:
            raise ValueError(
                f"Unknown position field '{k}'. Valid: {sorted(_VALID_POSITION_FIELDS)}"
            )
        if k == "percentile":
            normalized = str(v).strip()
            # Accept "75th (default)" form by stripping the suffix.
            if normalized.endswith(" (default)"):
                normalized = normalized[: -len(" (default)")]
            if normalized not in _VALID_PERCENTILES:
                raise ValueError(
                    f"percentile must be one of {sorted(_VALID_PERCENTILES)}, got {v!r}"
                )
            cleaned[k] = normalized
        elif k == "location_type":
            if v not in _VALID_LOCATION_TYPES:
                raise ValueError(
                    f"location_type must be one of {sorted(_VALID_LOCATION_TYPES)}, got {v!r}"
                )
            cleaned[k] = v
        elif k == "custom_salary":
            try:
                cleaned[k] = float(v)
            except (TypeError, ValueError):
                raise ValueError(f"custom_salary must be numeric, got {v!r}")
        elif k == "gsa_discount_rate":
            try:
                cleaned[k] = float(v)
            except (TypeError, ValueError):
                raise ValueError(f"gsa_discount_rate must be numeric, got {v!r}")
        elif k in ("hours_per_year", "ot_hours_per_year"):
            if not isinstance(v, dict):
                raise ValueError(f"{k} must be a dict like {{'1': 1920, '2': 1920}}")
            sub: Dict[str, float] = {}
            for yk, yv in v.items():
                try:
                    sub[str(yk)] = float(yv)
                except (TypeError, ValueError):
                    raise ValueError(f"{k}['{yk}'] must be numeric, got {yv!r}")
            cleaned[k] = sub
        elif k == "is_key_position":
            cleaned[k] = bool(v)
    return cleaned


# ─── Public mutation API ──────────────────────────────────────────────────

def apply_rate_update(
    *,
    proposal_id: str,
    user_id: str,
    organization_id: Optional[str],
    role: Optional[str],
    rates: Optional[Dict[str, Any]] = None,
    escalation_rates: Optional[Dict[str, Any]] = None,
    rationale: str = "",
) -> Dict[str, Any]:
    """
    Persist a rate / escalation change to MongoDB and return a change
    descriptor the frontend can use to patch its local store.

    Returns:
        Dict with success status, the change descriptor, and the proposal_id.
    """
    crud = get_proposal_crud()

    rates_in = rates or {}
    esc_in = escalation_rates or {}

    if not rates_in and not esc_in:
        return {
            "success": False,
            "error": "No changes provided — pass at least one rate or escalation key.",
        }

    try:
        clean_rates = _validate_rates(rates_in)
        clean_esc = _validate_escalation(esc_in)
    except ValueError as e:
        return {"success": False, "error": str(e)}

    logger.info(
        f"[apply_rate_update] proposal_id={proposal_id!r} user_id={user_id!r} "
        f"org={organization_id!r} role={role!r}"
    )
    current = crud.get_proposal(
        proposal_id=proposal_id,
        user_id=user_id,
        organization_id=organization_id,
        role=role,
    )
    if not current:
        return {"success": False, "error": "Proposal not found or access denied."}

    sd = current.get("spreadsheet_data") or {}
    cur_rates = sd.get("rates") or current.get("rates") or {}
    cur_esc = sd.get("escalation_rates") or current.get("escalation_rates") or {}

    update_doc: Dict[str, Any] = {}
    rate_changes: List[Dict[str, Any]] = []
    for k, v in clean_rates.items():
        update_doc[f"spreadsheet_data.rates.{k}"] = v
        rate_changes.append({"key": k, "current": cur_rates.get(k), "proposed": v})
    esc_changes: List[Dict[str, Any]] = []
    for k, v in clean_esc.items():
        update_doc[f"spreadsheet_data.escalation_rates.{k}"] = v
        esc_changes.append({"key": k, "current": cur_esc.get(k), "proposed": v})

    updated = crud.update_proposal(
        proposal_id=proposal_id,
        user_id=user_id,
        updates=update_doc,
        organization_id=organization_id,
        role=role,
    )
    if not updated:
        return {
            "success": False,
            "error": "Update failed (proposal not found or access denied).",
        }

    logger.info(
        f"[update_rates] proposal={proposal_id} "
        f"rates={list(clean_rates.keys())} esc={list(clean_esc.keys())}"
    )
    return {
        "success": True,
        "action": "update_rates",
        "proposal_id": proposal_id,
        "rates": clean_rates,
        "escalation_rates": clean_esc,
        "rate_changes": rate_changes,
        "escalation_changes": esc_changes,
        "rationale": rationale,
    }


def apply_position_update(
    *,
    proposal_id: str,
    user_id: str,
    organization_id: Optional[str],
    role: Optional[str],
    updates: List[Dict[str, Any]],
    rationale: str = "",
) -> Dict[str, Any]:
    """
    Persist a batch of per-position field updates to MongoDB and return a
    change descriptor the frontend can use to patch its local store.
    """
    crud = get_proposal_crud()

    if not isinstance(updates, list) or not updates:
        return {
            "success": False,
            "error": "`updates` must be a non-empty list of {position_id, fields} entries.",
        }

    logger.info(
        f"[apply_position_update] proposal_id={proposal_id!r} user_id={user_id!r} "
        f"org={organization_id!r} role={role!r}"
    )
    current = crud.get_proposal(
        proposal_id=proposal_id,
        user_id=user_id,
        organization_id=organization_id,
        role=role,
    )
    if not current:
        return {"success": False, "error": "Proposal not found or access denied."}

    sd = current.get("spreadsheet_data") or {}
    positions: List[Dict[str, Any]] = sd.get("positions") or []
    pos_by_id = {p.get("id"): (i, p) for i, p in enumerate(positions) if p.get("id")}

    # Validate every entry up-front; refuse to mutate if any are bad.
    cleaned_updates: List[Dict[str, Any]] = []
    for entry in updates:
        if not isinstance(entry, dict):
            return {"success": False, "error": f"Invalid update entry: {entry!r}"}
        pid = entry.get("position_id")
        fields = entry.get("fields") or {}
        if not pid or pid not in pos_by_id:
            return {
                "success": False,
                "error": (
                    f"Unknown position_id '{pid}'. "
                    f"Valid IDs: {list(pos_by_id.keys())[:5]}…"
                ),
            }
        if not isinstance(fields, dict) or not fields:
            return {
                "success": False,
                "error": f"Position '{pid}' has no fields to update.",
            }
        try:
            clean_fields = _validate_position_update(fields)
        except ValueError as e:
            return {"success": False, "error": f"Position '{pid}': {e}"}
        cleaned_updates.append({"position_id": pid, "fields": clean_fields})

    update_doc: Dict[str, Any] = {}
    change_descriptors: List[Dict[str, Any]] = []
    for u in cleaned_updates:
        idx, pos = pos_by_id[u["position_id"]]
        per_pos_changes: Dict[str, Any] = {}
        for k, v in u["fields"].items():
            update_doc[f"spreadsheet_data.positions.{idx}.{k}"] = v
            per_pos_changes[k] = {"current": pos.get(k), "proposed": v}
        change_descriptors.append({
            "position_id": u["position_id"],
            "labor_category": pos.get("labor_category"),
            "changes": per_pos_changes,
        })

    updated = crud.update_proposal(
        proposal_id=proposal_id,
        user_id=user_id,
        updates=update_doc,
        organization_id=organization_id,
        role=role,
    )
    if not updated:
        return {
            "success": False,
            "error": "Update failed (proposal not found or access denied).",
        }

    logger.info(
        f"[update_positions] proposal={proposal_id} count={len(cleaned_updates)}"
    )
    return {
        "success": True,
        "action": "update_positions",
        "proposal_id": proposal_id,
        "updates": cleaned_updates,
        "changes": change_descriptors,
        "rationale": rationale,
    }
