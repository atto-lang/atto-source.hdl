"""Adversarial HLS JSON manifest admission, not hardware synthesis tests."""
import contextlib
import io
import json
import os
from pathlib import Path
import tempfile
import unittest

from test_optimization_intent import GOOD
from tools.validate_optimization_intent import Rejected, main, read_manifest, validate


class ManifestAdmissionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "intent.json"

    def write(self, data):
        if isinstance(data, str):
            data = data.encode("utf-8")
        self.path.write_bytes(data)
        return self.path

    def test_regular_manifest_remains_valid(self):
        self.write(json.dumps(GOOD))
        self.assertEqual(validate(read_manifest(self.path))["status"],
                         "STATIC_PREFLIGHT_ONLY")
        with contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(main(["validator", str(self.path)]), 0)
        self.assertFalse(json.loads(output.getvalue())["synthesized"])

    def test_duplicate_key_top_level_and_nested_rejected_before_validation(self):
        self.write('{"word_width": 8, "word_width": 1}')
        with self.assertRaisesRegex(Rejected, "duplicate JSON field: word_width"):
            read_manifest(self.path)
        self.write('{"future": {"bank_count": 1, "bank_count": 2}}')
        with self.assertRaisesRegex(Rejected, "duplicate JSON field: bank_count"):
            read_manifest(self.path)

    def test_nonstandard_numbers_and_corrupt_unicode_rejected(self):
        for value in ("NaN", "Infinity", "-Infinity"):
            with self.subTest(value=value):
                self.write('{"value_max": ' + value + '}')
                with self.assertRaisesRegex(Rejected, "nonstandard JSON number"):
                    read_manifest(self.path)
        self.write(bytes([255]))
        with self.assertRaises(UnicodeError):
            read_manifest(self.path)

    def test_final_component_symlink_rejected(self):
        self.write(json.dumps(GOOD))
        link = self.path.parent / "alias.json"
        link.symlink_to(self.path)
        with self.assertRaises((Rejected, OSError)):
            read_manifest(link)

    def test_fifo_directory_and_oversize_rejected(self):
        with self.assertRaises(Rejected):
            read_manifest(self.path.parent)
        self.write(b" " * 65537)
        with self.assertRaisesRegex(Rejected, "exceeds 64 KiB"):
            read_manifest(self.path)
        self.path.unlink()
        if hasattr(os, "mkfifo"):
            os.mkfifo(self.path)
            with self.assertRaises(Rejected):
                read_manifest(self.path)

    def test_deep_nesting_returns_rejection_code_not_uncaught_traceback(self):
        self.write("[" * 1200 + "0" + "]" * 1200)
        with contextlib.redirect_stderr(io.StringIO()) as error:
            self.assertEqual(main(["validator", str(self.path)]), 65)
        self.assertIn("REJECTED:", error.getvalue())


if __name__ == "__main__":
    unittest.main()
