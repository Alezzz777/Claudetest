"""
Unit tests for dice_roller.py

Coverage areas:
  - Boundary conditions: min/max sides, min/max dice count, modifier edges
  - Internal correctness: result ranges, totals, roll counts, modifier storage
  - Type validation: non-integer and boolean inputs
  - dice notation parsing: valid patterns, edge values, invalid strings
"""

import unittest
from unittest.mock import patch

from dice_roller import (
    DiceRollerError,
    MAX_DICE,
    MAX_SIDES,
    MIN_DICE,
    MIN_SIDES,
    parse_dice_notation,
    roll_die,
    roll_dice,
)


# ---------------------------------------------------------------------------
# roll_die
# ---------------------------------------------------------------------------

class TestRollDieBoundary(unittest.TestCase):
    """Boundary tests for roll_die."""

    def test_min_sides_always_returns_one(self):
        """A d1 must always produce 1."""
        self.assertEqual(MIN_SIDES, 1)
        for _ in range(20):
            self.assertEqual(roll_die(MIN_SIDES), 1)

    def test_max_sides_result_in_range(self):
        """Result for a MAX_SIDES die must be within [1, MAX_SIDES]."""
        result = roll_die(MAX_SIDES)
        self.assertGreaterEqual(result, 1)
        self.assertLessEqual(result, MAX_SIDES)

    def test_sides_one_below_min_raises(self):
        """sides = MIN_SIDES - 1 (i.e. 0) must raise DiceRollerError."""
        with self.assertRaises(DiceRollerError):
            roll_die(MIN_SIDES - 1)

    def test_sides_zero_raises(self):
        with self.assertRaises(DiceRollerError):
            roll_die(0)

    def test_sides_negative_raises(self):
        with self.assertRaises(DiceRollerError):
            roll_die(-1)

    def test_sides_one_above_max_raises(self):
        """sides = MAX_SIDES + 1 must raise DiceRollerError."""
        with self.assertRaises(DiceRollerError):
            roll_die(MAX_SIDES + 1)

    def test_sides_large_negative_raises(self):
        with self.assertRaises(DiceRollerError):
            roll_die(-1000)


class TestRollDieInternal(unittest.TestCase):
    """Internal / correctness tests for roll_die."""

    def test_result_within_range_d6_many_rolls(self):
        """Every result of a d6 must be in [1, 6]."""
        for _ in range(200):
            r = roll_die(6)
            self.assertGreaterEqual(r, 1)
            self.assertLessEqual(r, 6)

    def test_result_within_range_d20(self):
        for _ in range(200):
            r = roll_die(20)
            self.assertGreaterEqual(r, 1)
            self.assertLessEqual(r, 20)

    def test_mocked_randint_is_used(self):
        """roll_die must delegate to random.randint."""
        with patch("dice_roller.random.randint", return_value=3) as mock_rand:
            result = roll_die(6)
        mock_rand.assert_called_once_with(1, 6)
        self.assertEqual(result, 3)

    def test_mocked_min_value(self):
        with patch("dice_roller.random.randint", return_value=1):
            self.assertEqual(roll_die(6), 1)

    def test_mocked_max_value(self):
        with patch("dice_roller.random.randint", return_value=6):
            self.assertEqual(roll_die(6), 6)

    def test_returns_int(self):
        self.assertIsInstance(roll_die(6), int)


class TestRollDieTypeValidation(unittest.TestCase):
    """Type-validation tests for roll_die."""

    def test_float_sides_raises(self):
        with self.assertRaises(DiceRollerError):
            roll_die(6.0)

    def test_string_sides_raises(self):
        with self.assertRaises(DiceRollerError):
            roll_die("6")

    def test_none_sides_raises(self):
        with self.assertRaises(DiceRollerError):
            roll_die(None)

    def test_bool_sides_raises(self):
        """bool is a subclass of int in Python; we treat it as invalid."""
        with self.assertRaises(DiceRollerError):
            roll_die(True)


# ---------------------------------------------------------------------------
# roll_dice
# ---------------------------------------------------------------------------

class TestRollDiceBoundary(unittest.TestCase):
    """Boundary tests for roll_dice."""

    # -- count boundaries --

    def test_min_count_produces_one_roll(self):
        result = roll_dice(MIN_DICE, 6)
        self.assertEqual(len(result["rolls"]), MIN_DICE)

    def test_max_count_produces_correct_number_of_rolls(self):
        result = roll_dice(MAX_DICE, 6)
        self.assertEqual(len(result["rolls"]), MAX_DICE)

    def test_count_zero_raises(self):
        with self.assertRaises(DiceRollerError):
            roll_dice(0, 6)

    def test_count_one_below_min_raises(self):
        with self.assertRaises(DiceRollerError):
            roll_dice(MIN_DICE - 1, 6)

    def test_count_one_above_max_raises(self):
        with self.assertRaises(DiceRollerError):
            roll_dice(MAX_DICE + 1, 6)

    def test_count_negative_raises(self):
        with self.assertRaises(DiceRollerError):
            roll_dice(-1, 6)

    # -- sides boundaries --

    def test_min_sides_all_rolls_are_one(self):
        """With d1, every individual roll must be 1."""
        result = roll_dice(5, MIN_SIDES)
        self.assertEqual(result["rolls"], [1, 1, 1, 1, 1])

    def test_min_sides_total_equals_count(self):
        result = roll_dice(4, MIN_SIDES)
        self.assertEqual(result["total"], 4)

    def test_max_sides_result_in_range(self):
        result = roll_dice(1, MAX_SIDES)
        self.assertGreaterEqual(result["total"], 1)
        self.assertLessEqual(result["total"], MAX_SIDES)

    def test_sides_zero_raises(self):
        with self.assertRaises(DiceRollerError):
            roll_dice(1, 0)

    def test_sides_negative_raises(self):
        with self.assertRaises(DiceRollerError):
            roll_dice(1, -1)

    def test_sides_one_above_max_raises(self):
        with self.assertRaises(DiceRollerError):
            roll_dice(1, MAX_SIDES + 1)

    # -- modifier boundaries --

    def test_modifier_zero_does_not_change_total(self):
        with patch("dice_roller.random.randint", return_value=3):
            result = roll_dice(2, 6, modifier=0)
        self.assertEqual(result["total"], 6)

    def test_modifier_positive(self):
        with patch("dice_roller.random.randint", return_value=3):
            result = roll_dice(2, 6, modifier=10)
        self.assertEqual(result["total"], 3 + 3 + 10)

    def test_modifier_negative(self):
        with patch("dice_roller.random.randint", return_value=5):
            result = roll_dice(1, 6, modifier=-3)
        self.assertEqual(result["total"], 5 - 3)

    def test_modifier_large_negative_can_make_total_negative(self):
        with patch("dice_roller.random.randint", return_value=1):
            result = roll_dice(1, 6, modifier=-100)
        self.assertEqual(result["total"], 1 - 100)


class TestRollDiceInternal(unittest.TestCase):
    """Internal / correctness tests for roll_dice."""

    def test_total_equals_sum_of_rolls_plus_modifier(self):
        with patch("dice_roller.random.randint", side_effect=[2, 4, 6]):
            result = roll_dice(3, 6, modifier=5)
        self.assertEqual(result["total"], 2 + 4 + 6 + 5)

    def test_rolls_list_contains_correct_values(self):
        with patch("dice_roller.random.randint", side_effect=[1, 2, 3]):
            result = roll_dice(3, 6)
        self.assertEqual(result["rolls"], [1, 2, 3])

    def test_modifier_stored_correctly_positive(self):
        result = roll_dice(1, 6, modifier=7)
        self.assertEqual(result["modifier"], 7)

    def test_modifier_stored_correctly_negative(self):
        result = roll_dice(1, 6, modifier=-4)
        self.assertEqual(result["modifier"], -4)

    def test_default_modifier_is_zero(self):
        result = roll_dice(1, 6)
        self.assertEqual(result["modifier"], 0)

    def test_all_individual_rolls_within_range(self):
        result = roll_dice(20, 6)
        for roll in result["rolls"]:
            self.assertGreaterEqual(roll, 1)
            self.assertLessEqual(roll, 6)

    def test_result_dict_has_required_keys(self):
        result = roll_dice(1, 6)
        self.assertIn("rolls", result)
        self.assertIn("total", result)
        self.assertIn("modifier", result)

    def test_rolls_is_list(self):
        result = roll_dice(3, 6)
        self.assertIsInstance(result["rolls"], list)

    def test_total_is_int(self):
        result = roll_dice(1, 6)
        self.assertIsInstance(result["total"], int)

    def test_no_modifier_total_sum_of_rolls(self):
        with patch("dice_roller.random.randint", return_value=4):
            result = roll_dice(3, 6)
        self.assertEqual(result["total"], 12)


class TestRollDiceTypeValidation(unittest.TestCase):
    """Type-validation tests for roll_dice."""

    def test_float_count_raises(self):
        with self.assertRaises(DiceRollerError):
            roll_dice(2.0, 6)

    def test_float_sides_raises(self):
        with self.assertRaises(DiceRollerError):
            roll_dice(2, 6.5)

    def test_float_modifier_raises(self):
        with self.assertRaises(DiceRollerError):
            roll_dice(2, 6, 1.5)

    def test_string_count_raises(self):
        with self.assertRaises(DiceRollerError):
            roll_dice("2", 6)

    def test_none_sides_raises(self):
        with self.assertRaises(DiceRollerError):
            roll_dice(2, None)

    def test_bool_count_raises(self):
        with self.assertRaises(DiceRollerError):
            roll_dice(True, 6)

    def test_bool_sides_raises(self):
        with self.assertRaises(DiceRollerError):
            roll_dice(2, False)


# ---------------------------------------------------------------------------
# parse_dice_notation
# ---------------------------------------------------------------------------

class TestParseDiceNotationValid(unittest.TestCase):
    """Tests for valid dice notation strings."""

    def test_basic_2d6(self):
        self.assertEqual(
            parse_dice_notation("2d6"),
            {"count": 2, "sides": 6, "modifier": 0},
        )

    def test_1d20_no_modifier(self):
        self.assertEqual(
            parse_dice_notation("1d20"),
            {"count": 1, "sides": 20, "modifier": 0},
        )

    def test_positive_modifier(self):
        self.assertEqual(
            parse_dice_notation("1d20+5"),
            {"count": 1, "sides": 20, "modifier": 5},
        )

    def test_negative_modifier(self):
        self.assertEqual(
            parse_dice_notation("3d8-2"),
            {"count": 3, "sides": 8, "modifier": -2},
        )

    def test_zero_modifier_explicit(self):
        self.assertEqual(
            parse_dice_notation("1d6+0"),
            {"count": 1, "sides": 6, "modifier": 0},
        )

    def test_case_insensitive_uppercase_D(self):
        self.assertEqual(
            parse_dice_notation("2D6"),
            {"count": 2, "sides": 6, "modifier": 0},
        )

    def test_strips_leading_trailing_whitespace(self):
        self.assertEqual(
            parse_dice_notation("  2d6  "),
            {"count": 2, "sides": 6, "modifier": 0},
        )

    def test_large_modifier(self):
        result = parse_dice_notation("1d6+999")
        self.assertEqual(result["modifier"], 999)

    def test_large_negative_modifier(self):
        result = parse_dice_notation("1d6-500")
        self.assertEqual(result["modifier"], -500)

    def test_large_count(self):
        result = parse_dice_notation("100d6")
        self.assertEqual(result["count"], 100)

    def test_large_sides(self):
        result = parse_dice_notation("1d1000")
        self.assertEqual(result["sides"], 1000)

    def test_returns_dict_with_correct_keys(self):
        result = parse_dice_notation("2d6")
        self.assertIn("count", result)
        self.assertIn("sides", result)
        self.assertIn("modifier", result)

    def test_all_values_are_int(self):
        result = parse_dice_notation("2d6+3")
        self.assertIsInstance(result["count"], int)
        self.assertIsInstance(result["sides"], int)
        self.assertIsInstance(result["modifier"], int)


class TestParseDiceNotationBoundary(unittest.TestCase):
    """Boundary cases for parse_dice_notation."""

    def test_minimum_notation_1d1(self):
        self.assertEqual(
            parse_dice_notation("1d1"),
            {"count": 1, "sides": 1, "modifier": 0},
        )

    def test_single_die_single_side_with_modifier(self):
        self.assertEqual(
            parse_dice_notation("1d1+1"),
            {"count": 1, "sides": 1, "modifier": 1},
        )

    def test_modifier_of_negative_one(self):
        result = parse_dice_notation("2d6-1")
        self.assertEqual(result["modifier"], -1)


class TestParseDiceNotationInvalid(unittest.TestCase):
    """Invalid input tests for parse_dice_notation."""

    def test_empty_string_raises(self):
        with self.assertRaises(DiceRollerError):
            parse_dice_notation("")

    def test_whitespace_only_raises(self):
        with self.assertRaises(DiceRollerError):
            parse_dice_notation("   ")

    def test_missing_count_d6_raises(self):
        with self.assertRaises(DiceRollerError):
            parse_dice_notation("d6")

    def test_missing_sides_2d_raises(self):
        with self.assertRaises(DiceRollerError):
            parse_dice_notation("2d")

    def test_no_d_separator_raises(self):
        with self.assertRaises(DiceRollerError):
            parse_dice_notation("26")

    def test_wrong_separator_raises(self):
        with self.assertRaises(DiceRollerError):
            parse_dice_notation("2x6")

    def test_float_notation_raises(self):
        with self.assertRaises(DiceRollerError):
            parse_dice_notation("2.0d6")

    def test_non_string_int_raises(self):
        with self.assertRaises(DiceRollerError):
            parse_dice_notation(26)

    def test_non_string_none_raises(self):
        with self.assertRaises(DiceRollerError):
            parse_dice_notation(None)

    def test_non_string_list_raises(self):
        with self.assertRaises(DiceRollerError):
            parse_dice_notation(["2d6"])

    def test_reversed_order_raises(self):
        with self.assertRaises(DiceRollerError):
            parse_dice_notation("d6d2")


# ---------------------------------------------------------------------------
# Integration: parse then roll
# ---------------------------------------------------------------------------

class TestParseAndRollIntegration(unittest.TestCase):
    """Ensure parse_dice_notation output feeds correctly into roll_dice."""

    def test_2d6_plus_3_integration(self):
        parsed = parse_dice_notation("2d6+3")
        with patch("dice_roller.random.randint", return_value=4):
            result = roll_dice(**parsed)
        self.assertEqual(result["total"], 4 + 4 + 3)
        self.assertEqual(result["modifier"], 3)

    def test_3d8_minus_2_integration(self):
        parsed = parse_dice_notation("3d8-2")
        with patch("dice_roller.random.randint", side_effect=[5, 6, 7]):
            result = roll_dice(**parsed)
        self.assertEqual(result["total"], 5 + 6 + 7 - 2)

    def test_1d1_integration_total_always_one(self):
        parsed = parse_dice_notation("1d1")
        result = roll_dice(**parsed)
        self.assertEqual(result["total"], 1)


if __name__ == "__main__":
    unittest.main()
