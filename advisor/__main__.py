from __future__ import annotations

import argparse
import json

from advisor.analyze import analyze
from advisor.config import APP_NAME, HORIZONS


def main() -> None:
    parser = argparse.ArgumentParser(description=f"{APP_NAME}: is this company investable?")
    parser.add_argument("company", help="Company name, e.g. Apple or Tata Consultancy")
    parser.add_argument("--horizon", type=int, default=90, choices=HORIZONS)
    parser.add_argument("--json", action="store_true", help="Print raw JSON")
    args = parser.parse_args()

    result = analyze(args.company, args.horizon)
    if args.json:
        print(json.dumps(result, indent=2, default=str))
        return

    company = result["company"]
    verdict = result["verdict"]
    filing = (company.get("filing") or {}).get("label")
    print(f"\n{APP_NAME}")
    print(f"{company['name']} ({company['ticker']})")
    print(f"{company.get('sector') or ''} · {result['horizon_label']}")
    if filing:
        print(filing)
    print(f"\n{verdict['label'].upper()}  ·  {verdict['score']}/100  ·  {verdict['stance']}")
    print(verdict["thesis"])
    print(f"\n{result['briefing']}")
    print("\nFundamentals:", result["fundamental"]["rating"], result["fundamental"]["score"])
    print("Technicals:  ", result["technical"]["signal"], result["technical"]["score"])
    print("News risk:   ", result["news"]["controversy"], result["news"]["score"])
    if verdict["reasons"]:
        print("\nFor:")
        for line in verdict["reasons"]:
            print("  -", line)
    if verdict["against"]:
        print("\nAgainst:")
        for line in verdict["against"]:
            print("  -", line)
    print(f"\n{result['disclaimer']}\n")


if __name__ == "__main__":
    main()
