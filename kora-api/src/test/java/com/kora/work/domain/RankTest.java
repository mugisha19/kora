package com.kora.work.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.ArrayList;
import java.util.List;
import java.util.Random;
import org.junit.jupiter.api.Test;

class RankTest {

    @Test
    void theFirstKeyIsInTheMiddleOfTheRange() {
        assertThat(Rank.between(null, null)).isEqualTo("i");
    }

    @Test
    void aKeyFallsStrictlyBetweenItsNeighbours() {
        assertThat(Rank.between("a", "c")).isEqualTo("b");
        assertThat(Rank.between("a", "b")).isBetween("a", "b").isNotIn("a", "b");
        assertThat(Rank.between("a", "a1")).isGreaterThan("a").isLessThan("a1");
        assertThat(Rank.between(null, "01")).isLessThan("01").doesNotEndWith("0");
        assertThat(Rank.between("zz", null)).isGreaterThan("zz");
    }

    @Test
    void insertingRepeatedlyIntoTheSameGapKeepsTheOrder() {
        String low = "a";
        String high = "b";
        for (int i = 0; i < 200; i++) {
            String middle = Rank.between(low, high);
            assertThat(middle).isGreaterThan(low).isLessThan(high).doesNotEndWith("0");
            high = middle;
        }
        assertThat(high.length()).isLessThan(60);
    }

    @Test
    void randomInsertionsProduceAStrictOrder() {
        Random random = new Random(42);
        List<String> keys = new ArrayList<>(List.of(Rank.between(null, null)));
        for (int i = 0; i < 500; i++) {
            int at = random.nextInt(keys.size() + 1);
            String lower = at == 0 ? null : keys.get(at - 1);
            String upper = at == keys.size() ? null : keys.get(at);
            keys.add(at, Rank.between(lower, upper));
        }
        assertThat(keys).isSorted().doesNotHaveDuplicates();
    }

    @Test
    void rejectsNeighboursInTheWrongOrder() {
        assertThatThrownBy(() -> Rank.between("c", "a")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> Rank.between("b", "b")).isInstanceOf(IllegalArgumentException.class);
    }
}
