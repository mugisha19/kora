package com.kora.work.domain;

/**
 * Lexorank ordering (feature 08): a task's position is a base-36 string, and a moved task gets a new string between
 * its two new neighbours. Moving one card rewrites one row instead of renumbering the whole column.
 *
 * <p>Keys compare byte by byte ({@code COLLATE "C"} in the database) and never end in {@code 0}, so there is always
 * room between two different keys. Repeated inserts at the same spot make keys longer; at 255 characters they would
 * need rebalancing, which takes about 1,000 inserts into one gap.
 */
public final class Rank {

    private static final String DIGITS = "0123456789abcdefghijklmnopqrstuvwxyz";
    private static final int BASE = DIGITS.length();

    private Rank() {}

    /**
     * A key strictly between {@code lower} and {@code upper}.
     *
     * @param lower the key just above, or null for the very top
     * @param upper the key just below, or null for the very bottom
     * @throws IllegalArgumentException when {@code lower} is not before {@code upper}
     */
    public static String between(String lower, String upper) {
        String low = lower == null ? "" : lower;
        if (upper != null && low.compareTo(upper) >= 0) {
            throw new IllegalArgumentException("'" + lower + "' is not before '" + upper + "'");
        }
        StringBuilder key = new StringBuilder();
        String high = upper;
        for (int i = 0; ; i++) {
            int l = i < low.length() ? digit(low.charAt(i)) : 0;
            int h = high != null && i < high.length() ? digit(high.charAt(i)) : BASE;
            if (h - l > 1) {
                return key.append(DIGITS.charAt((l + h) / 2)).toString();
            }
            key.append(DIGITS.charAt(l));
            if (h - l == 1) {
                // The prefix is now below the upper key whatever follows, so only the lower key still bounds it.
                high = null;
            }
        }
    }

    private static int digit(char c) {
        int value = DIGITS.indexOf(c);
        if (value < 0) {
            throw new IllegalArgumentException("Not a rank digit: " + c);
        }
        return value;
    }
}
