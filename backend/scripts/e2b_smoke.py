"""
Live check of the E2B setup, using the app's own settings (backend/.env).

    cd backend && uv run python -m scripts.e2b_smoke

Creates ONE sandbox from E2B_TEMPLATE_ID, checks the template's tools and
libraries and that its docgen matches this checkout, builds a small PDF with
the real document runner, pauses and resumes the box (the file must survive),
then kills it. Prints results only; never prints the API key.
"""

import asyncio
import json
import sys
import time

from app.settings import settings


async def main() -> int:
    from e2b_code_interpreter import AsyncSandbox

    from utils.docgen_runtime import ensure_docgen_ready, local_sha
    from utils.e2b_sandbox import _APP_TAG, _STORE, pause_by_id

    key = settings.E2B_API_KEY
    print(f"E2B_API_KEY set: {bool(key)} (starts with e2b_: {key.startswith('e2b_')})")
    print(f"E2B_TEMPLATE_ID: {settings.E2B_TEMPLATE_ID or '(empty: stock template)'}")
    if not key:
        return 1

    ok = True
    api = {"api_key": key}
    t0 = time.monotonic()
    kwargs = {"timeout": 300, "allow_internet_access": False,
              "metadata": {"app": _APP_TAG, "store": _STORE, "smoke": "1",
                           "created_at": str(int(time.time()))}, **api}
    if settings.E2B_TEMPLATE_ID:
        kwargs["template"] = settings.E2B_TEMPLATE_ID
    sbx = await AsyncSandbox.create(**kwargs)
    print(f"created sandbox {sbx.sandbox_id} in {time.monotonic() - t0:.1f}s")
    try:
        checks = {
            "python libs": "/opt/priceiq/python -c 'import reportlab, docx, pptx, openpyxl, "
                           "xlsxwriter, pdfplumber, pypdf, pandas, matplotlib, pytesseract, markitdown, "
                           "docgen.pdf, docgen.checks; print(\"ok\")'",
            "cli tools": "for t in soffice qpdf pdftk pandoc tesseract pdftoppm node; do "
                         "command -v $t >/dev/null || echo missing:$t; done; echo ok",
            "node packages": "cd /home/user && node -e \"require('docx');require('pptxgenjs');"
                             "require('sharp');console.log('ok')\"",
            "Inter font": "/opt/priceiq/python -c 'from docgen import fonts; print(\"ok\" if fonts.available() else \"missing\")'",
        }
        for name, cmd in checks.items():
            try:
                r = await sbx.commands.run(cmd, timeout=60)
                out = (r.stdout or "").strip().splitlines()
                good = bool(out) and out[-1] == "ok" and not any(l.startswith("missing") for l in out)
            except Exception as exc:  # noqa: BLE001
                out, good = [str(exc)[:200]], False
            ok &= good
            print(f"{'PASS' if good else 'FAIL'} {name}: {' '.join(out)[-200:]}")

        r = await sbx.commands.run("cat /opt/priceiq/docgen.sha 2>/dev/null || echo none", timeout=30)
        baked = (r.stdout or "").strip()
        print(f"{'PASS' if baked == local_sha() else 'WARN'} template docgen hash {baked} vs this checkout "
              f"{local_sha()}" + ("" if baked == local_sha() else " (works via upload; rebuild template to skip it)"))

        runtime = await ensure_docgen_ready(sbx)
        spec = {"format": "pdf", "filename": "smoke.pdf", "title": "E2B smoke test",
                "content": [{"type": "h1", "text": "It works"},
                            {"type": "kpi_row", "pairs": [["$3.02M", "Total"], ["14", "Positions"]]},
                            {"type": "table", "headers": ["Role", "Hours"], "rows": [["PM", "1,920"]],
                             "align": ["left", "right"]}]}
        await sbx.files.write("/home/user/specs/smoke.json", json.dumps(spec))
        t1 = time.monotonic()
        try:
            r = await sbx.commands.run(f"{runtime.python} {runtime.docgen_build} /home/user/specs/smoke.json",
                                       timeout=180)
            stdout = r.stdout or ""
        except Exception as exc:  # noqa: BLE001 - non-zero exit still carries the envelope
            stdout = getattr(exc, "stdout", "") or str(exc)
        line = next((l for l in stdout.splitlines() if l.startswith("@@PRICEIQ_RESULT@@")), None)
        env = json.loads(line[len("@@PRICEIQ_RESULT@@"):]) if line else {}
        good = bool(env.get("ok"))
        ok &= good
        print(f"{'PASS' if good else 'FAIL'} build_document PDF in {time.monotonic() - t1:.1f}s: "
              f"{(env.get('document') or {}).get('size')} bytes, "
              f"errors={[e.get('code') for e in (env.get('verification') or {}).get('errors', [])]}"
              + ("" if good else f" {env.get('error') or stdout[-300:]}"))

        t2 = time.monotonic()
        await pause_by_id(sbx.sandbox_id)
        resumed = await AsyncSandbox.connect(sbx.sandbox_id, timeout=300, **api)
        r = await resumed.commands.run("test -s /home/user/out/smoke.pdf && echo ok || echo gone", timeout=30)
        good = (r.stdout or "").strip() == "ok"
        ok &= good
        print(f"{'PASS' if good else 'FAIL'} pause + resume in {time.monotonic() - t2:.1f}s, file kept: {good}")
    finally:
        await AsyncSandbox.kill(sbx.sandbox_id, **api)
        print(f"killed {sbx.sandbox_id}")
    print("ALL PASSED" if ok else "SOME CHECKS FAILED")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
