"""
Live end-to-end test of parse_gsa_contract against a real GSA contract.

Makes real LLM calls — costs tokens and takes minutes. Run from backend/:

    uv run python -m scripts.test_gsa_parser_live "/path/to/contract.rtf"

The load-bearing check is VERBATIM FIDELITY: with anchor-based extraction every
description is sliced out of the source document, so each one MUST be an exact
substring of the extracted text. That is an objective correctness check needing
no ground truth — if an anchor resolved to the wrong span, or the model
paraphrased instead of copying, this fails.
"""

import json
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from client import gsa_parser as g
from client.anchor_resolver import anchor_miss_summary

DEFAULT_FILE = "/Users/keshav/Downloads/FSS Price List.rtf"
OUT_DIR = Path(__file__).resolve().parent.parent / "tmp"


def _bar(title: str) -> None:
    print(f"\n{'=' * 72}\n{title}\n{'=' * 72}")


def main() -> int:
    file_path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_FILE
    if not Path(file_path).exists():
        print(f"❌ File not found: {file_path}")
        return 1

    _bar(f"GSA PARSER LIVE TEST\n{file_path}")
    print(f"file size: {Path(file_path).stat().st_size:,} bytes")

    # ------------------------------------------------------------------
    # Stage 1: text extraction (also gives us full_text for the checks below)
    # ------------------------------------------------------------------
    t0 = time.perf_counter()
    full_text = g._extract_full_text(file_path)
    t_extract = time.perf_counter() - t0

    chunks = [full_text]
    print(f"extracted: {len(full_text):,} chars in {t_extract:.1f}s")
    print(f"single-call extraction (no chunking)")

    # ------------------------------------------------------------------
    # Instrument the resolver so we can see anchor misses before they're
    # stripped off inside _extract_descriptions_with_llm.
    # ------------------------------------------------------------------
    captured = {}
    original_resolve = g.resolve_descriptions

    def instrumented(text, entries):
        resolved = original_resolve(text, entries)
        captured["anchors_in"] = len(entries)
        captured["misses"] = anchor_miss_summary(resolved)
        # Persist the raw anchors. Runs are non-deterministic, so without these
        # an anchor miss in one run cannot be reproduced or diagnosed later.
        captured["raw_anchors"] = entries
        captured["unresolved"] = [
            {**{k: v for k, v in a.items()},
             "_miss": r.get("_anchor_miss")}
            for a, r in zip(entries, resolved)
            if r.get("_anchor_miss")
        ]
        return resolved

    g.resolve_descriptions = instrumented

    # ------------------------------------------------------------------
    # Stage 2: full parse
    # ------------------------------------------------------------------
    _bar("RUNNING parse_gsa_contract()")
    t0 = time.perf_counter()
    try:
        result = g.parse_gsa_contract(file_path)
    finally:
        g.resolve_descriptions = original_resolve
    elapsed = time.perf_counter() - t0

    # ------------------------------------------------------------------
    # Results
    # ------------------------------------------------------------------
    lcats = result["labor_categories"]
    _bar("RESULTS")
    print(f"⏱  total parse time: {elapsed:.1f}s  ({elapsed / 60:.1f} min)")
    print(f"   contract_number:  {result['contract_number']}")
    print(f"   company_name:     {result['company_name']}")
    print(f"   start / end:      {result['contract_start_date']} -> {result['contract_end_date']}")
    print(f"   needs_date:       {result['needs_date']}")
    print(f"   labor categories: {len(lcats)}")

    with_desc = [c for c in lcats if c.get("description")]
    with_rates = [c for c in lcats if c.get("rates_by_year")]
    with_exp = [c for c in lcats if c.get("experience")]
    print(f"   with description: {len(with_desc)}/{len(lcats)}")
    print(f"   with rates:       {len(with_rates)}/{len(lcats)}")
    print(f"   with experience:  {len(with_exp)}/{len(lcats)}")

    if captured:
        print(f"\n   anchors returned by LLM: {captured.get('anchors_in')}")
        print(f"   anchor misses:           {captured.get('misses') or 'none'}")

    if with_desc:
        lengths = sorted(len(c["description"]) for c in with_desc)
        print(f"\n   description length: min={lengths[0]} "
              f"median={lengths[len(lengths) // 2]} max={lengths[-1]}")
        capped = sum(1 for n in lengths if n >= 1990)
        if capped:
            print(f"   ⚠️  {capped} description(s) at the {g.MAX_DESC_CHARS if hasattr(g,'MAX_DESC_CHARS') else 2000}-char cap "
                  f"-> end anchor likely missed")

    # ------------------------------------------------------------------
    # CORRECTNESS CHECKS
    # ------------------------------------------------------------------
    _bar("CORRECTNESS CHECKS")
    checks = []

    # 1. Verbatim fidelity — the whole premise of anchor extraction.
    not_verbatim = [c for c in with_desc if c["description"] not in full_text]
    ok = not not_verbatim
    checks.append(ok)
    print(f"{'PASS' if ok else 'FAIL'}  every description is a verbatim substring of the source "
          f"({len(with_desc) - len(not_verbatim)}/{len(with_desc)})")
    for c in not_verbatim[:3]:
        print(f"        ✗ {c['title']}: {c['description'][:90]!r}...")

    # 2. No swallowed spans — a description covering several LCATs shows up as
    #    an OUTLIER length that also names other categories. Both conditions are
    #    required: title text alone gives false positives, because ordinary prose
    #    contains category names as substrings ("system architecture" contains
    #    the category "System Architect"). Match on word boundaries for the same
    #    reason.
    median_len = (sorted(len(c["description"]) for c in with_desc)[len(with_desc) // 2]
                  if with_desc else 0)
    outlier_len = max(3 * median_len, 1200)
    other_titles = {c["title"].lower() for c in lcats if len(c["title"]) > 12}

    def names_others(desc: str, own: str) -> int:
        low = desc.lower()
        return sum(
            1 for t in other_titles
            if t != own and re.search(rf"\b{re.escape(t)}\b", low)
        )

    swallowed = [
        c for c in with_desc
        if len(c["description"]) > outlier_len
        and names_others(c["description"], c["title"].lower()) >= 2
    ]
    ok = not swallowed
    checks.append(ok)
    print(f"{'PASS' if ok else 'FAIL'}  no description swallows other labor categories "
          f"({len(swallowed)} suspect)")
    for c in swallowed[:3]:
        print(f"        ✗ {c['title']}: len={len(c['description'])}")

    # 3. Extraction actually produced something.
    ok = len(lcats) > 0
    checks.append(ok)
    print(f"{'PASS' if ok else 'FAIL'}  labor categories extracted ({len(lcats)})")

    # 4. Rates parsed as numbers.
    bad_rates = [
        (c["title"], y, v) for c in with_rates
        for y, v in c["rates_by_year"].items()
        if not isinstance(v, (int, float))
    ]
    ok = not bad_rates
    checks.append(ok)
    print(f"{'PASS' if ok else 'FAIL'}  all rates are numeric ({len(bad_rates)} bad)")
    for t, y, v in bad_rates[:3]:
        print(f"        ✗ {t} year {y}: {v!r}")

    # 5. No internal bookkeeping leaked into stored records.
    leaked = [c for c in lcats if any(k.startswith("_") for k in c)]
    ok = not leaked
    checks.append(ok)
    print(f"{'PASS' if ok else 'FAIL'}  no internal keys leaked into output ({len(leaked)})")

    # ------------------------------------------------------------------
    # Samples + artifact
    # ------------------------------------------------------------------
    _bar("SAMPLE LABOR CATEGORIES")
    for c in lcats[:5]:
        rates = c.get("rates_by_year") or {}
        first = f"${list(rates.values())[0]}" if rates else "no rates"
        desc = (c.get("description") or "(none)").replace("\n", " ")
        print(f"\n  {c['lcat_id']}  {c['title']}  [SIN {c.get('sin')}]  {first}")
        print(f"     exp:  {c.get('experience')}")
        print(f"     desc: {desc[:150]}...")

    OUT_DIR.mkdir(exist_ok=True)
    out_file = OUT_DIR / "gsa_parse_result.json"
    if lcats:
        out_file.write_text(json.dumps(result, indent=2, default=str))
        print(f"\n💾 full result written to {out_file}")
    else:
        # A failed run (API error, empty extraction) must not clobber the
        # artifact from a good one — that artifact is the diagnostic baseline.
        print(f"\n⚠️  0 labor categories — leaving {out_file} untouched")

    if captured.get("raw_anchors") is not None:
        anchors_file = OUT_DIR / "gsa_raw_anchors.json"
        anchors_file.write_text(json.dumps(captured["raw_anchors"], indent=2, default=str))
        print(f"💾 raw LLM anchors written to {anchors_file}")

    if captured.get("unresolved"):
        print(f"\n⚠️  {len(captured['unresolved'])} unresolved anchor(s):")
        for a in captured["unresolved"]:
            print(f"     [{a.get('_miss')}] {a.get('title')!r}")
            print(f"         start={a.get('desc_start')!r}")
            print(f"         end  ={a.get('desc_end')!r}")

    _bar(f"{sum(checks)}/{len(checks)} CHECKS PASSED  —  {elapsed:.1f}s total")
    return 0 if all(checks) else 1


if __name__ == "__main__":
    sys.exit(main())
