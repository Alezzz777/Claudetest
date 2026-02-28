import random
import sys


def roll_dice(sides):
    return random.randint(1, sides)


def main():
    if len(sys.argv) != 2:
        print("Usage: python dice_roller.py <number_of_sides>")
        sys.exit(1)

    try:
        sides = int(sys.argv[1])
    except ValueError:
        print("Error: number of sides must be an integer")
        sys.exit(1)

    if sides < 1:
        print("Error: number of sides must be at least 1")
        sys.exit(1)

    result = roll_dice(sides)
    print(f"Rolling a d{sides}... You got: {result}")


if __name__ == "__main__":
    main()
