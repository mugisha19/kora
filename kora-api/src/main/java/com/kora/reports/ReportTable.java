package com.kora.reports;

import java.util.ArrayList;
import java.util.List;

/** Rows of typed cells under column headers; every row has one cell per header. */
public record ReportTable(List<String> headers, List<List<Cell>> rows) {

    public ReportTable {
        headers = List.copyOf(headers);
        List<List<Cell>> copy = new ArrayList<>(rows.size());
        for (List<Cell> row : rows) {
            if (row.size() != headers.size()) {
                throw new IllegalArgumentException(
                        "Row of " + row.size() + " cells under " + headers.size() + " headers");
            }
            copy.add(List.copyOf(row));
        }
        rows = List.copyOf(copy);
    }
}
