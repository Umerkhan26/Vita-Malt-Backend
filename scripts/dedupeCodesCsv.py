from pathlib import Path
import re

p = Path(r"D:\WEB\Vita Malt\backend\data\crown-codes-grand-prize.csv")
lines = p.read_text(encoding="utf-8").splitlines()
header = lines[0] if lines else "code"
ok = re.compile(r"^[A-Z0-9-]{4,32}$")
seen = []
seen_set = set()
dupes = 0
invalid = 0

for line in lines[1:]:
    c = line.split(",")[0].strip().strip('"').upper()
    if not c:
        continue
    if not ok.match(c) or c in {"CODE", "CODES"}:
        invalid += 1
        continue
    if c in seen_set:
        dupes += 1
        continue
    seen_set.add(c)
    seen.append(c)

p.write_text(header + "\n" + "\n".join(seen) + "\n", encoding="utf-8")
print(f"unique={len(seen)} extra_copies_removed={dupes} invalid_removed={invalid}")
