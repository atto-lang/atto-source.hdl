import copy
import unittest
from tools.validate_optimization_intent import Rejected, validate

GOOD = {
    "schema_version": 1,
    "kernel": "bounded_add",
    "trip_count": 64,
    "unroll_factor": 4,
    "word_width": 7,
    "signed": False,
    "value_min": 0,
    "value_max": 100,
    "target_ii": 1,
    "loop_carried_dependency": False,
    "bank_count": 4,
    "read_ports_per_bank": 1,
    "concurrent_read_indices": [0, 1, 2, 3],
}


class StaticOptimizationIntentTests(unittest.TestCase):
    def check_rejected(self, **changes):
        spec = copy.deepcopy(GOOD)
        spec.update(changes)
        with self.assertRaises(Rejected):
            validate(spec)

    def test_bounded_manifest_not_synthesis_proof(self):
        report = validate(copy.deepcopy(GOOD))
        self.assertEqual(report["status"], "STATIC_PREFLIGHT_ONLY")
        self.assertFalse(report["proved_scheduling"])
        self.assertFalse(report["synthesized"])
        self.assertEqual(report["read_counts_per_bank"], [1, 1, 1, 1])

    def test_conflicting_bank_ports(self):
        self.check_rejected(concurrent_read_indices=[0, 4])
        self.assertEqual(validate({**GOOD, "read_ports_per_bank": 2,
                                   "concurrent_read_indices": [0, 4]})
                         ["read_counts_per_bank"], [2, 0, 0, 0])

    def test_ii_one_not_claimed_for_dependent_loop(self):
        self.check_rejected(loop_carried_dependency=True)
        self.assertEqual(validate({**GOOD, "loop_carried_dependency": True,
                                   "target_ii": 2})["target_ii"], 2)

    def test_unsigned_counter_needs_enough_bits(self):
        self.check_rejected(word_width=6)
        self.check_rejected(value_min=-1)
        self.check_rejected(value_max=128)

    def test_no_unbounded_or_unreasonable_resources(self):
        self.check_rejected(trip_count=0)
        self.check_rejected(trip_count=65537)
        self.check_rejected(unroll_factor=65)
        self.check_rejected(bank_count=0)
        self.check_rejected(concurrent_read_indices=[64])

    def test_booleans_not_ints_and_unknown_fields_rejected(self):
        self.check_rejected(word_width=True)
        self.check_rejected(signed=1)
        self.check_rejected(loop_carried_dependency=0)
        self.check_rejected(arbitrary_feature=True)


if __name__ == "__main__":
    unittest.main()
