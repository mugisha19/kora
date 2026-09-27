package com.kora.work;

import static com.kora.support.Contract.conforms;
import static com.kora.support.TestPortfolios.etag;
import static com.kora.support.TestPortfolios.read;
import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import com.kora.organization.Role;
import com.kora.support.IntegrationTest;
import com.kora.support.RecordingEmailSender;
import com.kora.support.TestAccounts;
import com.kora.support.TestAccounts.Session;
import com.kora.support.TestPortfolios;
import com.kora.support.TestWork;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.assertj.MockMvcTester;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

/** Feature 08: tasks, their lifecycle, ordering, WIP limits, comments and task-based WBS progress. */
@IntegrationTest
class TaskIT {

    @Autowired
    private MockMvcTester mvc;

    @Autowired
    private RecordingEmailSender emails;

    private TestAccounts accounts;
    private TestPortfolios portfolios;
    private TestWork work;
    private Session admin;
    private Session manager;
    private Session contributor;
    private String projectId;
    private String projectCode;

    @BeforeEach
    void setUp() {
        accounts = new TestAccounts(mvc, emails);
        portfolios = new TestPortfolios(mvc);
        work = new TestWork(mvc);
        admin = accounts.registerOrganization();
        manager = accounts.join(admin, Role.PROJECT_MANAGER);
        contributor = accounts.join(admin, Role.MEMBER);
        projectId = portfolios.project(manager, portfolios.portfolio(admin));
        projectCode = read(get("/api/v1/projects/" + projectId, manager), "$.code");
        assertThat(portfolios.addToTeam(manager, projectId, contributor.userId(), "CONTRIBUTOR"))
                .hasStatusOk();
    }

    @Test
    void newTasksGetSequentialKeysAndGoToTheBottomOfTheBacklog() {
        MvcTestResult first = work.createTask(manager, projectId, "Design the login", ",\"storyPoints\":3");
        MvcTestResult second = work.createTask(manager, projectId, "Build the login", ",\"status\":\"TODO\"");

        assertThat(first)
                .hasStatus(HttpStatus.CREATED)
                .hasHeader(HttpHeaders.LOCATION, "/api/v1/tasks/" + read(first, "$.id"))
                .bodyJson()
                .isLenientlyEqualTo("""
                        {"key":"%s-1","status":"BACKLOG","priority":"MEDIUM","type":"TASK","storyPoints":3,
                         "labels":[]}
                        """.formatted(projectCode));
        assertThat(read(second, "$.key")).isEqualTo(projectCode + "-2");
        assertThat(read(second, "$.rank")).isGreaterThan(read(first, "$.rank"));
        assertThat(conforms(get("/api/v1/projects/" + projectId + "/tasks", manager)))
                .hasStatusOk()
                .bodyJson()
                .extractingPath("$.content[*].title")
                .isEqualTo(List.of("Design the login", "Build the login"));
    }

    @Test
    void listsFilterByLabelStatusAndTextAndSortByPriority() {
        work.task(
                manager, projectId, "Fix crash", ",\"type\":\"BUG\",\"priority\":\"CRITICAL\",\"labels\":[\"mobile\"]");
        work.task(manager, projectId, "Polish icons", ",\"priority\":\"LOW\",\"labels\":[\"mobile\",\"ui\"]");
        work.task(manager, projectId, "Write API docs", ",\"priority\":\"HIGH\",\"labels\":[\"api\"]");

        assertThat(conforms(get("/api/v1/projects/" + projectId + "/tasks?label=mobile&sort=priority,desc", manager)))
                .bodyJson()
                .extractingPath("$.content[*].title")
                .isEqualTo(List.of("Fix crash", "Polish icons"));
        assertThat(conforms(get("/api/v1/projects/" + projectId + "/tasks?sort=priority,asc", manager)))
                .bodyJson()
                .extractingPath("$.content[*].title")
                .isEqualTo(List.of("Polish icons", "Write API docs", "Fix crash"));
        assertThat(conforms(get("/api/v1/projects/" + projectId + "/tasks?q=docs", manager)))
                .bodyJson()
                .extractingPath("$.totalElements")
                .isEqualTo(1);
        assertThat(conforms(get("/api/v1/projects/" + projectId + "/tasks?type=BUG&status=BACKLOG", manager)))
                .bodyJson()
                .extractingPath("$.content[0].title")
                .isEqualTo("Fix crash");
    }

    @Test
    void tasksFollowTheLifecycle() {
        String task = work.task(manager, projectId, "Payment form", ",\"estimateHours\":8,\"remainingHours\":2");

        assertThat(work.moveTo(manager, task, "IN_PROGRESS"))
                .hasStatus(HttpStatus.CONFLICT)
                .bodyJson()
                .extractingPath("$.code")
                .isEqualTo("tasks.invalid_transition");
        assertThat(work.moveTo(manager, task, "TODO")).hasStatusOk();
        assertThat(work.moveTo(manager, task, "BLOCKED"))
                .hasStatus(HttpStatus.BAD_REQUEST)
                .bodyJson()
                .extractingPath("$.errors[0].field")
                .isEqualTo("reason");
        assertThat(work.move(manager, task, "{\"status\":\"BLOCKED\",\"reason\":\"Waiting for the gateway keys\"}"))
                .hasStatusOk()
                .bodyJson()
                .extractingPath("$.blockedReason")
                .isEqualTo("Waiting for the gateway keys");
        assertThat(work.moveTo(manager, task, "IN_PROGRESS")).hasStatusOk();
        assertThat(work.moveTo(manager, task, "IN_REVIEW")).hasStatusOk();
        assertThat(work.moveTo(manager, task, "DONE"))
                .hasStatus(HttpStatus.CONFLICT)
                .bodyJson()
                .extractingPath("$.code")
                .isEqualTo("tasks.remaining_work");

        MvcTestResult current = get("/api/v1/tasks/" + task, manager);
        assertThat(conforms(mvc.patch()
                        .uri("/api/v1/tasks/{id}", task)
                        .headers(manager.headers())
                        .header(HttpHeaders.IF_MATCH, etag(current))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"remainingHours\":0}")
                        .exchange()))
                .hasStatusOk();
        assertThat(work.moveTo(manager, task, "DONE"))
                .hasStatusOk()
                .bodyJson()
                .extractingPath("$.completedAt")
                .isNotNull();
    }

    @Test
    void aMovePlacesTheTaskBetweenItsNewNeighbours() {
        String first = work.task(manager, projectId, "First", ",\"status\":\"TODO\"");
        String second = work.task(manager, projectId, "Second", ",\"status\":\"TODO\"");
        String third = work.task(manager, projectId, "Third", ",\"status\":\"TODO\"");

        assertThat(work.move(manager, third, """
                        {"status":"TODO","afterTaskId":"%s","beforeTaskId":"%s"}
                        """.formatted(first, second))).hasStatusOk();
        assertThat(todoColumn()).isEqualTo(List.of("First", "Third", "Second"));

        assertThat(work.move(manager, second, "{\"status\":\"TODO\",\"beforeTaskId\":\"%s\"}".formatted(first)))
                .hasStatusOk();
        assertThat(todoColumn()).isEqualTo(List.of("Second", "First", "Third"));

        assertThat(work.move(manager, second, "{\"status\":\"TODO\",\"afterTaskId\":\"%s\"}".formatted(first)))
                .hasStatusOk();
        assertThat(todoColumn()).isEqualTo(List.of("First", "Second", "Third"));

        assertThat(work.moveTo(manager, first, "TODO")).hasStatusOk();
        assertThat(todoColumn()).isEqualTo(List.of("Second", "Third", "First"));

        assertThat(work.move(manager, first, """
                        {"status":"TODO","afterTaskId":"%s","beforeTaskId":"%s"}
                        """.formatted(third, second))).hasStatus(HttpStatus.BAD_REQUEST);
    }

    @Test
    void aFullColumnTakesMoreCardsOnlyWithAnOverride() {
        assertThat(conforms(mvc.put()
                        .uri("/api/v1/projects/{id}/board/columns/IN_PROGRESS", projectId)
                        .headers(manager.headers())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"IN_PROGRESS\",\"name\":\"Doing\",\"wipLimit\":1}")
                        .exchange()))
                .hasStatusOk()
                .bodyJson()
                .isLenientlyEqualTo("{\"status\":\"IN_PROGRESS\",\"name\":\"Doing\",\"wipLimit\":1}");
        String first = work.task(manager, projectId, "First", ",\"status\":\"TODO\"");
        String second = work.task(manager, projectId, "Second", ",\"status\":\"TODO\"");
        assertThat(work.moveTo(manager, first, "IN_PROGRESS")).hasStatusOk();

        assertThat(work.moveTo(manager, second, "IN_PROGRESS"))
                .hasStatus(HttpStatus.CONFLICT)
                .bodyJson()
                .extractingPath("$.code")
                .isEqualTo("tasks.wip_limit_reached");
        assertThat(work.move(manager, second, "{\"status\":\"IN_PROGRESS\",\"override\":true}"))
                .hasStatusOk();

        assertThat(conforms(get("/api/v1/projects/" + projectId + "/board", manager)))
                .hasStatusOk()
                .bodyJson()
                .isLenientlyEqualTo("""
                        {"columns":[{"status":"TODO","name":"To do","taskCount":0,"atLimit":false},
                                    {"status":"IN_PROGRESS","name":"Doing","wipLimit":1,"taskCount":2,"atLimit":true},
                                    {"status":"BLOCKED"},{"status":"IN_REVIEW"},{"status":"DONE"}]}
                        """);
    }

    @Test
    void contributorsWorkOnTheirOwnAndUnassignedTasks() {
        Session other = accounts.join(admin, Role.MEMBER);
        assertThat(portfolios.addToTeam(manager, projectId, other.userId(), "CONTRIBUTOR"))
                .hasStatusOk();
        String theirs = work.task(
                manager, projectId, "Theirs", ",\"status\":\"TODO\",\"assigneeId\":\"%s\"".formatted(other.userId()));
        String open = work.task(manager, projectId, "Open", ",\"status\":\"TODO\"");

        assertThat(work.createTask(contributor, projectId, "My idea", "")).hasStatus(HttpStatus.CREATED);
        assertThat(work.moveTo(contributor, open, "IN_PROGRESS")).hasStatusOk();
        assertThat(work.moveTo(contributor, theirs, "IN_PROGRESS")).hasStatus(HttpStatus.FORBIDDEN);
        assertThat(conforms(mvc.delete()
                        .uri("/api/v1/tasks/{id}", open)
                        .headers(contributor.headers())
                        .exchange()))
                .hasStatus(HttpStatus.FORBIDDEN);

        work.finish(contributor, work.task(contributor, projectId, "Quick fix", ""));
        String done = read(get("/api/v1/projects/" + projectId + "/tasks?status=DONE", manager), "$.content[0].id");
        assertThat(work.moveTo(contributor, done, "TODO")).hasStatus(HttpStatus.FORBIDDEN);
        assertThat(work.moveTo(manager, done, "TODO")).hasStatusOk();
    }

    @Test
    void onlyTheManagerAndContributorsCanBeAssigned() {
        Session observer = accounts.join(admin, Role.MEMBER);
        assertThat(portfolios.addToTeam(manager, projectId, observer.userId(), "OBSERVER"))
                .hasStatusOk();

        assertThat(work.createTask(manager, projectId, "Review", ",\"assigneeId\":\"%s\"".formatted(observer.userId())))
                .hasStatus(HttpStatus.BAD_REQUEST)
                .bodyJson()
                .extractingPath("$.errors[0].field")
                .isEqualTo("assigneeId");
        assertThat(work.createTask(manager, projectId, "Review", ",\"assigneeId\":\"%s\"".formatted(manager.userId())))
                .hasStatus(HttpStatus.CREATED)
                .bodyJson()
                .extractingPath("$.assignee.fullName")
                .isEqualTo("PROJECT_MANAGER User");
        assertThat(work.createTask(observer, projectId, "Can I?", "")).hasStatus(HttpStatus.FORBIDDEN);
    }

    @Test
    void commentsAreListedOldestFirstWithTheirAuthors() {
        String task = work.task(manager, projectId, "Discuss", "");
        comment(manager, task, "What about **offline** mode?");
        comment(contributor, task, "Later, in v2.");

        assertThat(conforms(get("/api/v1/tasks/" + task + "/comments", manager)))
                .hasStatusOk()
                .bodyJson()
                .isLenientlyEqualTo("""
                        [{"author":{"fullName":"PROJECT_MANAGER User"},"body":"What about **offline** mode?"},
                         {"author":{"fullName":"MEMBER User"},"body":"Later, in v2."}]
                        """);
    }

    @Test
    void workPackageProgressIsMeasuredFromItsTasks() {
        MvcTestResult node = conforms(mvc.post()
                .uri("/api/v1/projects/{id}/wbs/nodes", projectId)
                .headers(manager.headers())
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                        "{\"name\":\"Login\",\"type\":\"WORK_PACKAGE\",\"plannedEffortHours\":20,\"percentComplete\":10}")
                .exchange());
        String workPackage = read(node, "$.id");
        String deliverable = read(
                conforms(mvc.post()
                        .uri("/api/v1/projects/{id}/wbs/nodes", projectId)
                        .headers(manager.headers())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"App\",\"type\":\"DELIVERABLE\"}")
                        .exchange()),
                "$.id");

        assertThat(work.createTask(manager, projectId, "Wrong", ",\"wbsNodeId\":\"%s\"".formatted(deliverable)))
                .hasStatus(HttpStatus.BAD_REQUEST);
        work.task(
                manager,
                projectId,
                "Form",
                ",\"wbsNodeId\":\"%s\",\"estimateHours\":10,\"remainingHours\":5".formatted(workPackage));
        work.finish(
                manager,
                work.task(
                        manager,
                        projectId,
                        "API",
                        ",\"wbsNodeId\":\"%s\",\"estimateHours\":30".formatted(workPackage)));

        // (10 × 50 + 30 × 100) / 40
        MvcTestResult tree = conforms(get("/api/v1/projects/" + projectId + "/wbs", manager));
        assertThat(tree).bodyJson().extractingPath("$.nodes[0].percentComplete").isEqualTo(87.5);
        assertThat(tree)
                .bodyJson()
                .extractingPath("$.nodes[0].percentCompleteSource")
                .isEqualTo("TASKS");
        assertThat(tree)
                .bodyJson()
                .extractingPath("$.nodes[1].percentCompleteSource")
                .isEqualTo("ROLLED_UP");

        String currentTag = etag(conforms(mvc.patch()
                .uri("/api/v1/wbs/nodes/{id}", workPackage)
                .headers(manager.headers())
                .header(HttpHeaders.IF_MATCH, etag(node))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Login screens\"}")
                .exchange()));
        assertThat(conforms(mvc.patch()
                        .uri("/api/v1/wbs/nodes/{id}", workPackage)
                        .headers(manager.headers())
                        .header(HttpHeaders.IF_MATCH, currentTag)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"percentComplete\":20}")
                        .exchange()))
                .hasStatus(HttpStatus.BAD_REQUEST);
        assertThat(conforms(mvc.patch()
                        .uri("/api/v1/wbs/nodes/{id}", workPackage)
                        .headers(manager.headers())
                        .header(HttpHeaders.IF_MATCH, currentTag)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"type\":\"DELIVERABLE\"}")
                        .exchange()))
                .hasStatus(HttpStatus.CONFLICT)
                .bodyJson()
                .extractingPath("$.code")
                .isEqualTo("wbs.type_change_not_allowed");
    }

    @Test
    void managersDeleteTasks() {
        String task = work.task(manager, projectId, "Obsolete", "");

        assertThat(conforms(mvc.delete()
                        .uri("/api/v1/tasks/{id}", task)
                        .headers(manager.headers())
                        .exchange()))
                .hasStatus(HttpStatus.NO_CONTENT);
        assertThat(conforms(get("/api/v1/tasks/" + task, manager))).hasStatus(HttpStatus.NOT_FOUND);
    }

    @Test
    void anotherOrganizationCantSeeTheTask() {
        String task = work.task(manager, projectId, "Secret", "");
        Session stranger = accounts.registerOrganization();

        assertThat(conforms(get("/api/v1/tasks/" + task, stranger))).hasStatus(HttpStatus.NOT_FOUND);
        assertThat(conforms(get("/api/v1/projects/" + projectId + "/board", stranger)))
                .hasStatus(HttpStatus.NOT_FOUND);
    }

    private List<String> todoColumn() {
        MvcTestResult board = conforms(get("/api/v1/projects/" + projectId + "/board", manager));
        return JsonPath.read(TestAccounts.body(board), "$.columns[0].tasks[*].title");
    }

    private void comment(Session session, String taskId, String body) {
        assertThat(conforms(mvc.post()
                        .uri("/api/v1/tasks/{id}/comments", taskId)
                        .headers(session.headers())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"body\":\"%s\"}".formatted(body))
                        .exchange()))
                .hasStatus(HttpStatus.CREATED);
    }

    private MvcTestResult get(String uri, Session session) {
        return mvc.get().uri(uri).headers(session.headers()).exchange();
    }
}
