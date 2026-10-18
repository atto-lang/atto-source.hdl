"""Fail closed on repeated authority fields in static HLS manifests."""
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

VALIDATOR = Path(__file__).resolve().parents[1] / "tools/validate_optimization_intent.py"

class AmbiguousOptimizationIntentTests(unittest.TestCase):
    def rejected(self, text, key):
        with tempfile.TemporaryDirectory() as folder:
            manifest = Path(folder) / "intent.json"
            manifest.write_text(text, encoding="utf8")
            result = subprocess.run([sys.executable,str(VALIDATOR),str(manifest)],capture_output=True,text=True)
        self.assertEqual(result.returncode,65,result.stdout+result.stderr)
        self.assertIn("duplicate JSON field: " + key,result.stderr)

    def test_duplicate_word_width(self):
        self.rejected('{"word_width":8,"word_width":1}',"word_width")

    def test_duplicate_unroll_factor(self):
        self.rejected('{"unroll_factor":1,"unroll_factor":128}',"unroll_factor")

    def test_nested_duplicate_keys(self):
        self.rejected('{"future":{"bank_count":1,"bank_count":2}}',"bank_count")

if __name__ == "__main__":
    unittest.main()
