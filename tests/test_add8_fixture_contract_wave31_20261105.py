"""Source and generated RTL fixture identity, NOT compiler synthesis or FPGA evidence."""
import hashlib
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "tests/fixtures/add8.ores"
RTL = ROOT / "tests/fixtures/add8.generated.sv"
SOURCE_SHA256 = "26d446e1d903edca9691d37fc55c946033b590687468449103507c61b7026e80"
RTL_SHA256 = "7888f715405fb1207ee4988d9b9cf9cd03ecc9eeca58b85782654d46104e01cd"


class Add8FixtureContractWave31(unittest.TestCase):
    def test_pinned_utf8_source_and_rtl_bytes_remain_exact(self):
        self.assertEqual(hashlib.sha256(SRC.read_bytes()).hexdigest(), SOURCE_SHA256)
        self.assertEqual(hashlib.sha256(RTL.read_bytes()).hexdigest(), RTL_SHA256)

    def test_single_unsigned_add8_source_and_combination_only_rtl(self):
        source = SRC.read_text(encoding="utf-8")
        rtl = RTL.read_text(encoding="utf-8")
        self.assertEqual(source.count("pub fnc add8(u8 a, u8 b): u8"), 1)
        self.assertEqual(source.count("return a + b;"), 1)
        self.assertEqual(len(re.findall(r"\bmodule\s+ores_add8\s*\(", rtl)), 1)
        self.assertEqual(len(re.findall(r"\bassign\s+out_result\s*=\s*\(in_a \+ in_b\);", rtl)), 1)
        self.assertEqual(len(re.findall(r"\bendmodule\b", rtl)), 1)
        self.assertNotRegex(rtl, r"\b(?:always|initial|bind|force|release)\b|\$[A-Za-z_]")

    def test_mutated_source_and_rtl_no_longer_match_pin(self):
        for original, pin in ((SRC.read_bytes(), SOURCE_SHA256),
                              (RTL.read_bytes(), RTL_SHA256)):
            with self.subTest(size=len(original)):
                self.assertNotEqual(hashlib.sha256(original + b" ").hexdigest(), pin)
                self.assertNotEqual(hashlib.sha256(original.replace(b"+", b"-", 1)).hexdigest(), pin)


if __name__ == "__main__":
    unittest.main()
