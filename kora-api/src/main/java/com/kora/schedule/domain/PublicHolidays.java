package com.kora.schedule.domain;

import com.kora.schedule.domain.WorkingCalendar.Holiday;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.Month;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * Public holidays a calendar can be preloaded with (feature 16). Rwanda's are fixed dates, Easter's Good Friday and
 * Monday, and Umuganura on the first Friday of August. Eid al-Fitr and Eid al-Adha follow the lunar calendar and are
 * announced each year, so administrators add them by hand.
 */
public final class PublicHolidays {

    private PublicHolidays() {}

    public static List<Holiday> rwanda(int year) {
        List<Holiday> holidays = new ArrayList<>();
        holidays.add(new Holiday(LocalDate.of(year, Month.JANUARY, 1), "New Year's Day"));
        holidays.add(new Holiday(LocalDate.of(year, Month.JANUARY, 2), "Day after New Year's Day"));
        holidays.add(new Holiday(LocalDate.of(year, Month.FEBRUARY, 1), "National Heroes' Day"));
        holidays.add(new Holiday(LocalDate.of(year, Month.APRIL, 7), "Genocide against the Tutsi Memorial Day"));
        holidays.add(new Holiday(LocalDate.of(year, Month.MAY, 1), "Labour Day"));
        holidays.add(new Holiday(LocalDate.of(year, Month.JULY, 1), "Independence Day"));
        holidays.add(new Holiday(LocalDate.of(year, Month.JULY, 4), "Liberation Day"));
        holidays.add(new Holiday(
                LocalDate.of(year, Month.AUGUST, 1).with(TemporalAdjusters.firstInMonth(DayOfWeek.FRIDAY)),
                "Umuganura Day"));
        holidays.add(new Holiday(LocalDate.of(year, Month.AUGUST, 15), "Assumption Day"));
        holidays.add(new Holiday(LocalDate.of(year, Month.DECEMBER, 25), "Christmas Day"));
        holidays.add(new Holiday(LocalDate.of(year, Month.DECEMBER, 26), "Boxing Day"));
        LocalDate easter = easterSunday(year);
        holidays.add(new Holiday(easter.minusDays(2), "Good Friday"));
        holidays.add(new Holiday(easter.plusDays(1), "Easter Monday"));
        holidays.sort(Comparator.comparing(Holiday::date));
        return holidays;
    }

    /** The anonymous Gregorian algorithm (Meeus/Jones/Butcher). */
    static LocalDate easterSunday(int year) {
        int a = year % 19;
        int b = year / 100;
        int c = year % 100;
        int d = b / 4;
        int e = b % 4;
        int f = (b + 8) / 25;
        int g = (b - f + 1) / 3;
        int h = (19 * a + b - d - g + 15) % 30;
        int i = c / 4;
        int k = c % 4;
        int l = (32 + 2 * e + 2 * i - h - k) % 7;
        int m = (a + 11 * h + 22 * l) / 451;
        int month = (h + l - 7 * m + 114) / 31;
        int day = ((h + l - 7 * m + 114) % 31) + 1;
        return LocalDate.of(year, month, day);
    }
}
