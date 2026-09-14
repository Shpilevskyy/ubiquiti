#!/usr/bin/env python3
"""Manual regression check for the stale-write conflict signal.

Covers the seven cases in specs/05-sync-conflict-resolution.md. Automated tests are deferred
(see tasks/DEFERRED.md), so this is the runnable regression suite for that area in the meantime.

Usage:
    npm run build
    (cd apps/server && PORT=3999 node dist/index.js &)
    python3 scripts/verify-conflict.py [base-url]

Exits non-zero if any case fails. Creates and deletes its own list; leaves no data behind.
"""
import json
import sys
import urllib.error
import urllib.request
import uuid

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3999") + "/api"
failures = []


def req(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    # Only send a content-type when there's a body: Fastify rejects an empty JSON body with 400.
    headers = {"content-type": "application/json"} if data else {}
    r = urllib.request.Request(BASE + path, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(r) as resp:
            raw = resp.read()
            return resp.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        return e.code, None


def check(label, actual, expected):
    ok = actual == expected
    print(f"  {'PASS' if ok else 'FAIL'}  {label}: got {actual!r}, expected {expected!r}")
    if not ok:
        failures.append(label)


_, created = req("POST", "/lists", {"title": "conflict regression"})
lid = created["list"]["id"]
tid = str(uuid.uuid4())
req("POST", f"/lists/{lid}/todos", {"id": tid, "title": "orig", "position": 1})
P = f"/lists/{lid}/todos/{tid}"

print("todo conflict signal")
# The regression that motivated the rewrite: a concurrent edit to a field this write never
# touches must NOT report a conflict. The old version-based check reported one here.
req("PATCH", P, {"descriptionMd": "edited by someone else"})
_, d = req("PATCH", P, {"done": True, "base": {"done": False}})
check("different field touched -> no conflict", d["hadConflict"], False)
check("write still applied", d["todo"]["done"], True)

req("PATCH", P, {"done": False})
_, d = req("PATCH", P, {"done": True, "base": {"done": True}})
check("same field touched -> conflict", d["hadConflict"], True)
check("conflicting write still applies (LWW)", d["todo"]["done"], True)

_, d = req("PATCH", P, {"title": "no base"})
check("no base -> check skipped", d["hadConflict"], False)

_, d = req("PATCH", P, {"descriptionMd": "mine", "base": {"descriptionMd": None}})
check("null base vs non-null current -> conflict", d["hadConflict"], True)

_, d = req("PATCH", P, {"descriptionMd": "same", "base": {"descriptionMd": "mine"}})
check("agreeing base -> no conflict", d["hadConflict"], False)

print("subtask conflict signal")
sid = str(uuid.uuid4())
req("POST", f"{P}/subtasks", {"id": sid, "title": "sub", "position": 1})
SP = f"{P}/subtasks/{sid}"
req("PATCH", SP, {"title": "renamed by someone else"})
_, d = req("PATCH", SP, {"done": True, "base": {"done": False}})
check("different field touched -> no conflict", d["hadConflict"], False)
req("PATCH", SP, {"done": False})
_, d = req("PATCH", SP, {"done": True, "base": {"done": True}})
check("same field touched -> conflict", d["hadConflict"], True)

print("delete wins")
req("DELETE", P)
st, _ = req("PATCH", P, {"done": True, "base": {"done": False}})
check("patch after delete -> 404", st, 404)

req("DELETE", f"/lists/{lid}")
print()
if failures:
    print(f"{len(failures)} FAILED: {', '.join(failures)}")
    sys.exit(1)
print("all conflict cases passed")
