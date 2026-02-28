import sys
import unittest
from unittest.mock import patch
from io import StringIO

from dice_roller import roll_dice, main


class TestRollDice(unittest.TestCase):

    def test_result_within_range(self):
        for sides in [1, 4, 6, 10, 20, 100]:
            with self.subTest(sides=sides):
                result = roll_dice(sides)
                self.assertGreaterEqual(result, 1)
                self.assertLessEqual(result, sides)

    def test_single_side_always_returns_one(self):
        for _ in range(10):
            self.assertEqual(roll_dice(1), 1)

    def test_returns_integer(self):
        self.assertIsInstance(roll_dice(6), int)

    @patch("random.randint", return_value=4)
    def test_uses_random_randint(self, mock_randint):
        result = roll_dice(6)
        mock_randint.assert_called_once_with(1, 6)
        self.assertEqual(result, 4)


class TestMain(unittest.TestCase):

    def _run_main(self, args):
        """Helper to run main() with given CLI args, returns (stdout, exit_code)."""
        with patch.object(sys, "argv", ["dice_roller.py"] + args):
            with patch("sys.stdout", new_callable=StringIO) as mock_out:
                try:
                    main()
                    return mock_out.getvalue(), 0
                except SystemExit as e:
                    return mock_out.getvalue(), e.code

    def test_valid_input_prints_result(self):
        with patch("dice_roller.roll_dice", return_value=3):
            output, code = self._run_main(["6"])
        self.assertEqual(code, 0)
        self.assertIn("3", output)
        self.assertIn("d6", output)

    def test_no_args_exits_with_error(self):
        _, code = self._run_main([])
        self.assertEqual(code, 1)

    def test_too_many_args_exits_with_error(self):
        _, code = self._run_main(["6", "20"])
        self.assertEqual(code, 1)

    def test_non_integer_arg_exits_with_error(self):
        output, code = self._run_main(["abc"])
        self.assertEqual(code, 1)
        self.assertIn("integer", output)

    def test_zero_sides_exits_with_error(self):
        output, code = self._run_main(["0"])
        self.assertEqual(code, 1)
        self.assertIn("at least 1", output)

    def test_negative_sides_exits_with_error(self):
        output, code = self._run_main(["-5"])
        self.assertEqual(code, 1)
        self.assertIn("at least 1", output)

    def test_usage_message_on_no_args(self):
        output, _ = self._run_main([])
        self.assertIn("Usage", output)


if __name__ == "__main__":
    unittest.main()
