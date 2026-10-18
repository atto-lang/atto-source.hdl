#!/usr/bin/env python3
"""Conservative *manifest-only* HLS experiment preflight.

No Oreslang source parsing, scheduling proof, Verilog emission or synthesis.
This module intentionally rejects any unknown/nonstatic hardware attributes.
"""
import json
import os
import stat
import re
import sys
from pathlib import Path

KEYS = {
    "schema_version", "kernel", "trip_count", "unroll_factor",
    "word_width", "signed", "value_min", "value_max",
    "target_ii", "loop_carried_dependency", "bank_count",
    "read_ports_per_bank", "concurrent_read_indices",
}


class Rejected(ValueError):
    pass


def integer(value, name, low, high):
    if type(value) is not int or not low <= value <= high:
        raise Rejected(f"{name} must be an integer in [{low}, {high}]")
    return value


def validate(spec):
    if not isinstance(spec, dict):
        raise Rejected("manifest must be an object")
    if set(spec) != KEYS:
        raise Rejected(f"missing/unknown manifest keys: {sorted(set(spec) ^ KEYS)}")
    if spec["schema_version"] != 1 or type(spec["schema_version"]) is not int:
        raise Rejected("unknown schema version")
    name = spec["kernel"]
    if not isinstance(name, str) or re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]{0,127}", name) is None:
        raise Rejected("kernel must be a bounded SystemVerilog identifier")
    if name in {"module", "endmodule", "input", "output", "inout", "wire", "reg", "logic",
                "assign", "always", "initial", "begin", "end"}:
        raise Rejected("kernel collides with a reserved SystemVerilog keyword")
    trip = integer(spec["trip_count"], "trip_count", 1, 65536)
    lanes = integer(spec["unroll_factor"], "unroll_factor", 1, 256)
    if lanes > trip:
        raise Rejected("unroll factor exceeds bounded trip count")
    width = integer(spec["word_width"], "word_width", 1, 128)
    signed = spec["signed"]
    if type(signed) is not bool:
        raise Rejected("signed must be a boolean")
    low = -(1 << (width - 1)) if signed else 0
    high = (1 << (width - (1 if signed else 0))) - 1
    minimum = integer(spec["value_min"], "value_min", low, high)
    maximum = integer(spec["value_max"], "value_max", low, high)
    if minimum > maximum:
        raise Rejected("inverted range")
    ii = integer(spec["target_ii"], "target_ii", 1, 65536)
    depend = spec["loop_carried_dependency"]
    if type(depend) is not bool:
        raise Rejected("loop_carried_dependency must be a boolean")
    # Deliberate false-negative policy: dependency distance/latency scheduling
    # isn't modeled here, so reject II=1 claims requiring such a proof.
    if ii == 1 and depend:
        raise Rejected("II=1 cannot be admitted without dependence proof")
    banks = integer(spec["bank_count"], "bank_count", 1, 256)
    ports = integer(spec["read_ports_per_bank"], "read_ports_per_bank", 1, 2)
    indices = spec["concurrent_read_indices"]
    if not isinstance(indices, list) or len(indices) > 1024:
        raise Rejected("concurrent_read_indices must be a bounded list")
    reads = [0] * banks
    for value in indices:
        index = integer(value, "read index", 0, trip - 1)
        bank = index % banks
        reads[bank] += 1
        if reads[bank] > ports:
            raise Rejected(f"bank {bank} exceeds declared per-cycle read ports")
    return {
        "status": "STATIC_PREFLIGHT_ONLY",
        "kernel": name,
        "target_ii": ii,
        "declared_unroll_factor": lanes,
        "declared_width": width,
        "read_counts_per_bank": reads,
        "proved_scheduling": False,
        "proved_equivalence": False,
        "synthesized": False,
    }


MAX_MANIFEST_BYTES = 65536


def _unique_json_fields(pairs):
    values = {}
    for key, value in pairs:
        if key in values:
            raise Rejected(f"duplicate JSON field: {key}")
        values[key] = value
    return values


def _reject_nonstandard_constant(value):
    raise Rejected(f"nonstandard JSON number: {value}")


def read_manifest(path):
    """Read one bounded regular file without following the final symlink.

    This only enforces file-format admission, not a secure filesystem sandbox.
    """
    if not hasattr(os, "O_NOFOLLOW") or not hasattr(os, "O_NONBLOCK"):
        raise Rejected("safe manifest input unsupported on this host")
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode):
            raise Rejected("manifest must be a regular file")
        if info.st_size > MAX_MANIFEST_BYTES:
            raise Rejected("manifest exceeds 64 KiB")
        data = bytearray()
        while len(data) <= MAX_MANIFEST_BYTES:
            block = os.read(fd, min(16384, MAX_MANIFEST_BYTES + 1 - len(data)))
            if not block:
                break
            data.extend(block)
        if len(data) > MAX_MANIFEST_BYTES:
            raise Rejected("manifest exceeds 64 KiB")
    finally:
        os.close(fd)
    return json.loads(data.decode("utf-8"),
                      object_pairs_hook=_unique_json_fields,
                      parse_constant=_reject_nonstandard_constant)


def main(argv):
    if len(argv) != 2:
        print("usage: validate_optimization_intent.py manifest.json", file=sys.stderr)
        return 64
    try:
        spec = read_manifest(Path(argv[1]))
        print(json.dumps(validate(spec), sort_keys=True))
        return 0
    except (OSError, ValueError, UnicodeError, RecursionError) as exc:
        print(f"REJECTED: {exc}", file=sys.stderr)
        return 65


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
