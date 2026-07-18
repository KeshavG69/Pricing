"""
Token cost calculator + per-call usage recorder.

Two things:
  - calculate_cost(model, input_tokens, output_tokens) -> pure price lookup.
  - record_usage(...) -> compute cost + insert ONE row into `token_usage`.

Cost per proposal / per org is then a simple aggregate over that collection.
This is internal LLM spend (what WE pay), separate from Stripe `billing` (what
the customer pays).

Identity (user_id / organization_id / proposal_id) is passed EXPLICITLY by the
caller — no contextvars. Best-effort throughout: cost tracking must never
raise into a chat stream or the processing pipeline.
"""

import json
import logging
import os
from datetime import datetime

from auth.database import get_mongodb_client

logger = logging.getLogger(__name__)

# Static per-token price table (LiteLLM format, same file used elsewhere).
with open(os.path.join(os.path.dirname(__file__), "model_prices_being_used.json")) as _f:
    _PRICES = json.load(_f)


def _price(model):
    """Resolve a runtime model id to a price-table entry.

    Runtime ids look like ``anthropic/claude-sonnet-4.6`` or ``openai/gpt-4.1``;
    table keys are a mix of prefixed and bare, so try exact then provider-stripped.
    """
    if not model:
        return None
    return _PRICES.get(model) or _PRICES.get(model.split("/")[-1])


def calculate_cost(model, input_tokens, output_tokens):
    """Return (input_cost, output_cost, total_cost) in USD.

    Returns zeros (and logs) when the model isn't in the price table, so an
    unpriced model records tokens at $0 rather than breaking the caller.
    """
    inp = int(input_tokens or 0)
    out = int(output_tokens or 0)
    price = _price(model)
    if not price:
        logger.warning(f"[token_cost] no price for model '{model}'; recording $0")
        return 0.0, 0.0, 0.0
    input_cost = inp * price.get("input_cost_per_token", 0)
    output_cost = out * price.get("output_cost_per_token", 0)
    return input_cost, output_cost, input_cost + output_cost


def _tokens(metrics):
    """Pull (input, output) token counts from an Agno Metrics object or a dict."""
    if metrics is None:
        return 0, 0
    if isinstance(metrics, dict):
        return int(metrics.get("input_tokens") or 0), int(metrics.get("output_tokens") or 0)
    return (
        int(getattr(metrics, "input_tokens", 0) or 0),
        int(getattr(metrics, "output_tokens", 0) or 0),
    )


def record_usage(
    *,
    module,
    model,
    metrics,
    user_id=None,
    organization_id=None,
    proposal_id=None,
    session_id=None,
):
    """Compute the cost of one LLM call and insert a `token_usage` row.

    ``metrics`` is Agno's run metrics (a Metrics object or its dict form).
    No-op when there are no tokens; swallows all errors.
    """
    input_tokens, output_tokens = _tokens(metrics)
    if not input_tokens and not output_tokens:
        return

    input_cost, output_cost, total_cost = calculate_cost(model, input_tokens, output_tokens)

    try:
        get_mongodb_client().get_database()["token_usage"].insert_one({
            "userId": user_id,
            "organizationId": organization_id,
            "proposalId": proposal_id,
            "sessionId": session_id,
            "module": module,
            "model": model,
            "inputTokens": input_tokens,
            "outputTokens": output_tokens,
            "totalTokens": input_tokens + output_tokens,
            "inputCost": input_cost,
            "outputCost": output_cost,
            "totalCost": total_cost,
            "createdAt": datetime.utcnow(),
        })
        logger.info(
            f"[token_cost] {module} {model} in={input_tokens} out={output_tokens} "
            f"cost=${total_cost:.6f}"
        )
    except Exception as e:  # never break the caller over cost logging
        logger.error(f"[token_cost] insert failed: {e}")
