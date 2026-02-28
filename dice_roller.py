"""
Dice Roller Module

Provides functions to roll dice using standard tabletop RPG notation.
Supports rolling single dice, multiple dice with modifiers, and parsing
standard dice notation strings (e.g. '2d6+3').
"""

import random
import re

# --- Constants ---
MIN_SIDES = 1
MAX_SIDES = 1000
MIN_DICE = 1
MAX_DICE = 100


class DiceRollerError(ValueError):
    """Raised when invalid dice parameters or notation are provided."""
    pass


def roll_die(sides: int) -> int:
    """Roll a single die with the given number of sides.

    Args:
        sides: Number of faces on the die. Must be an integer in
               [MIN_SIDES, MAX_SIDES].

    Returns:
        A random integer in the range [1, sides].

    Raises:
        DiceRollerError: If ``sides`` is not a valid integer or out of range.
    """
    if not isinstance(sides, int) or isinstance(sides, bool):
        raise DiceRollerError(
            f"sides must be an integer, got {type(sides).__name__}"
        )
    if sides < MIN_SIDES:
        raise DiceRollerError(
            f"sides must be at least {MIN_SIDES}, got {sides}"
        )
    if sides > MAX_SIDES:
        raise DiceRollerError(
            f"sides must be at most {MAX_SIDES}, got {sides}"
        )
    return random.randint(1, sides)


def roll_dice(count: int, sides: int, modifier: int = 0) -> dict:
    """Roll *count* dice each with *sides* faces and apply a flat *modifier*.

    Args:
        count:    Number of dice to roll. Must be an integer in
                  [MIN_DICE, MAX_DICE].
        sides:    Number of faces on each die. Must be an integer in
                  [MIN_SIDES, MAX_SIDES].
        modifier: Flat integer added to the sum of all rolls (can be negative).

    Returns:
        A dict with keys:
            ``rolls``    – list of individual die results (int each)
            ``total``    – sum of rolls plus modifier
            ``modifier`` – the modifier that was applied

    Raises:
        DiceRollerError: If any argument is invalid or out of range.
    """
    for name, value in (("count", count), ("sides", sides), ("modifier", modifier)):
        if not isinstance(value, int) or isinstance(value, bool):
            raise DiceRollerError(
                f"{name} must be an integer, got {type(value).__name__}"
            )

    if count < MIN_DICE:
        raise DiceRollerError(f"count must be at least {MIN_DICE}, got {count}")
    if count > MAX_DICE:
        raise DiceRollerError(f"count must be at most {MAX_DICE}, got {count}")
    if sides < MIN_SIDES:
        raise DiceRollerError(f"sides must be at least {MIN_SIDES}, got {sides}")
    if sides > MAX_SIDES:
        raise DiceRollerError(f"sides must be at most {MAX_SIDES}, got {sides}")

    rolls = [roll_die(sides) for _ in range(count)]
    return {
        "rolls": rolls,
        "total": sum(rolls) + modifier,
        "modifier": modifier,
    }


def parse_dice_notation(notation: str) -> dict:
    """Parse a standard dice notation string into its components.

    Accepted format: ``NdS`` or ``NdS+M`` / ``NdS-M``
    where N = number of dice, S = sides, M = modifier.

    Examples::

        parse_dice_notation('2d6')    # {'count': 2, 'sides': 6, 'modifier': 0}
        parse_dice_notation('1d20+5') # {'count': 1, 'sides': 20, 'modifier': 5}
        parse_dice_notation('3d8-2')  # {'count': 3, 'sides': 8, 'modifier': -2}

    Args:
        notation: Dice notation string. Leading/trailing whitespace and
                  uppercase letters are accepted.

    Returns:
        A dict with integer keys ``count``, ``sides``, and ``modifier``.

    Raises:
        DiceRollerError: If ``notation`` is not a string or does not match
                         the expected format.
    """
    if not isinstance(notation, str):
        raise DiceRollerError(
            f"notation must be a string, got {type(notation).__name__}"
        )

    cleaned = notation.strip().lower()
    match = re.fullmatch(r"(\d+)d(\d+)([+-]\d+)?", cleaned)
    if not match:
        raise DiceRollerError(
            f"Invalid dice notation '{notation}'. Expected format: NdS[+/-M]"
        )

    count = int(match.group(1))
    sides = int(match.group(2))
    modifier = int(match.group(3)) if match.group(3) else 0
    return {"count": count, "sides": sides, "modifier": modifier}
