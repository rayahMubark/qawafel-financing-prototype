"""Score the matching engine against the generator's ground truth (amount-weighted precision and recall)."""
import csv
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from engine.report import build_demo_report  # noqa: E402

DATA = Path(__file__).resolve().parent.parent / "data"


def main():
    report = build_demo_report(include_internals=True)
    truth = defaultdict(float)
    with open(DATA / "_ground_truth_allocations.csv", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            truth[(r["invoice_number"], r["bank_ref"])] += float(r["amount_sar"])
    pred = defaultdict(float)
    by_method = defaultdict(lambda: [0.0, 0.0])
    for a in report["_allocations"]:
        pred[(a["invoice_number"], a["bank_ref"])] += a["amount_sar"]
    for a in report["_allocations"]:
        k = (a["invoice_number"], a["bank_ref"])
        by_method[a["method"]][1] += a["amount_sar"]
        by_method[a["method"]][0] += min(a["amount_sar"], truth.get(k, 0.0)) * a["amount_sar"] / pred[k]
    correct = sum(min(v, truth.get(k, 0.0)) for k, v in pred.items())
    precision = correct / sum(pred.values())
    recall = correct / sum(truth.values())
    print(f"Allocated SAR {sum(pred.values()):,.0f} | true SAR {sum(truth.values()):,.0f}")
    print(f"Precision {precision:.1%} | Recall {recall:.1%}")
    for m, (c, t) in sorted(by_method.items(), key=lambda x: -x[1][1]):
        print(f"  {m:<10} SAR {t:>14,.0f}  correct {c / t:.1%}")
    return precision, recall


if __name__ == "__main__":
    main()
