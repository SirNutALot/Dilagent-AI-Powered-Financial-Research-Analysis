from __future__ import annotations

import re
from datetime import date
from typing import Any

from advisor.config import HORIZON_LABELS, HORIZONS


def label(days: int) -> str:
    return HORIZON_LABELS.get(days, f"{days} days")


def snap_horizon(days: int) -> int:
    fit = [item for item in HORIZONS if item <= max(days, HORIZONS[0])]
    return fit[-1] if fit else HORIZONS[0]


def max_from_sessions(count: int) -> int:
    if count <= 1:
        return HORIZONS[0]
    return snap_horizon(count - 1)


def statement_span_days(company: dict[str, Any]) -> int | None:
    years: set[int] = set()
    for key in ("financials", "quarterly_financials", "balance_sheet"):
        frame = company.get(key)
        if frame is None or getattr(frame, "empty", True):
            continue
        for col in getattr(frame, "columns", []):
            try:
                years.add(int(str(col)[:4]))
            except Exception:
                continue
    years = {year for year in years if 2000 <= year <= date.today().year + 1}
    if len(years) >= 2:
        return min(1825, (max(years) - min(years) + 1) * 365)
    if len(years) == 1:
        quarterly = company.get("quarterly_financials")
        if quarterly is not None and not getattr(quarterly, "empty", True):
            cols = len(getattr(quarterly, "columns", []))
            if cols:
                return min(365, max(90, cols * 90))
        return 365
    return None


def estimate_report_days(text: str, meta: dict[str, Any] | None = None) -> int | None:
    blob = (text or "").lower()
    form = str((meta or {}).get("form") or (meta or {}).get("label") or "")
    if not blob and not form:
        return None
    ended = [int(year) for year in re.findall(r"year ended[^\.]{0,48}?(20\d{2})", text or "", re.I)]
    ended = [year for year in ended if 2005 <= year <= date.today().year + 1]
    if len(set(ended)) >= 2:
        return min(1825, (max(ended) - min(ended) + 1) * 365)
    if re.search(r"form 10-q|quarter ended|three months", blob) and not re.search(
        r"form 10-k|year ended|annual report", blob
    ):
        return 90
    if "six months" in blob:
        return 180
    if re.search(r"form 10-k|20-f|annual report|year ended", blob) or "10-K" in form or "20-F" in form:
        return 365
    if "upload" in form.lower() or "uploaded" in form.lower():
        return 365 if "year" in blob or "annual" in blob else 90
    return 365 if blob or form else None


def resolve_horizon(
    requested: int,
    *,
    sessions: int,
    statement_days: int | None,
    report_days: int | None,
    uploaded: bool,
) -> dict[str, Any]:
    requested = requested if requested in HORIZONS else snap_horizon(requested)
    price_max = max_from_sessions(sessions)
    caps = [("price history", price_max, price_max < requested)]
    if statement_days:
        stmt = snap_horizon(statement_days)
        caps.append(("published financial statements", stmt, stmt < requested))
    if report_days:
        report = snap_horizon(report_days)
        reason = "uploaded financial reports" if uploaded else "company filings"
        caps.append((reason, report, report < requested))

    limit = requested
    notes: list[str] = []
    for reason, cap, short in caps:
        if short:
            notes.append(f"{reason} only cover about {label(cap)}")
            limit = min(limit, cap)
    used = snap_horizon(limit)
    adjusted = used != requested
    note = ""
    if adjusted:
        extras = ""
        if uploaded and report_days and snap_horizon(report_days) < requested:
            extras = (
                " Dilagent only used the horizon supported by the information in the "
                "financial report you uploaded."
            )
        note = (
            f"{label(requested)} is not available for this company. "
            f"The run used {label(used)}, the longest window the current data supports "
            f"({'; '.join(notes)}).{extras}"
        )
    return {
        "requested": requested,
        "requested_label": label(requested),
        "used": used,
        "used_label": label(used),
        "adjusted": adjusted,
        "note": note,
    }
