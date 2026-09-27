package com.kora.support;

import static org.assertj.core.api.Assertions.assertThat;

import com.kora.support.TestAccounts.Session;
import java.time.LocalDate;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.assertj.MockMvcTester;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

/** Creates and moves tasks and sprints through the real endpoints. */
public final class TestWork {

    private final MockMvcTester mvc;

    public TestWork(MockMvcTester mvc) {
        this.mvc = mvc;
    }

    /** @param extra more JSON members, starting with a comma, or "" */
    public MvcTestResult createTask(Session session, String projectId, String title, String extra) {
        return Contract.conforms(mvc.post()
                .uri("/api/v1/projects/{id}/tasks", projectId)
                .headers(session.headers())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"%s\",\"type\":\"TASK\"%s}".formatted(title, extra))
                .exchange());
    }

    public String task(Session session, String projectId, String title, String extra) {
        MvcTestResult result = createTask(session, projectId, title, extra);
        assertThat(result).hasStatus(HttpStatus.CREATED);
        return TestPortfolios.read(result, "$.id");
    }

    /** @param body the whole MoveTaskRequest */
    public MvcTestResult move(Session session, String taskId, String body) {
        return Contract.conforms(mvc.post()
                .uri("/api/v1/tasks/{id}/move", taskId)
                .headers(session.headers())
                .contentType(MediaType.APPLICATION_JSON)
                .content(body)
                .exchange());
    }

    public MvcTestResult moveTo(Session session, String taskId, String status) {
        return move(session, taskId, "{\"status\":\"%s\"}".formatted(status));
    }

    /** Walks a new task through the lifecycle to {@code DONE}. */
    public void finish(Session session, String taskId) {
        for (String status : new String[] {"TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"}) {
            assertThat(moveTo(session, taskId, status)).hasStatusOk();
        }
    }

    public String sprint(Session session, String projectId, String name, LocalDate start, LocalDate end) {
        MvcTestResult result = Contract.conforms(mvc.post()
                .uri("/api/v1/projects/{id}/sprints", projectId)
                .headers(session.headers())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"%s\",\"goal\":\"Ship it\",\"startDate\":\"%s\",\"endDate\":\"%s\"}"
                        .formatted(name, start, end))
                .exchange());
        assertThat(result).hasStatus(HttpStatus.CREATED);
        return TestPortfolios.read(result, "$.id");
    }

    public MvcTestResult addToSprint(Session session, String sprintId, String... taskIds) {
        return Contract.conforms(mvc.post()
                .uri("/api/v1/sprints/{id}/tasks", sprintId)
                .headers(session.headers())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"taskIds\":[\"%s\"]}".formatted(String.join("\",\"", taskIds)))
                .exchange());
    }

    public MvcTestResult start(Session session, String sprintId) {
        return Contract.conforms(mvc.post()
                .uri("/api/v1/sprints/{id}/start", sprintId)
                .headers(session.headers())
                .exchange());
    }

    public MvcTestResult close(Session session, String sprintId, String carryOverTo) {
        return Contract.conforms(mvc.post()
                .uri("/api/v1/sprints/{id}/close", sprintId)
                .headers(session.headers())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"carryOverTo\":\"%s\"}".formatted(carryOverTo))
                .exchange());
    }
}
