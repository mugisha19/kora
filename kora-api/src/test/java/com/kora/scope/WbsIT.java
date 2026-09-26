package com.kora.scope;

import static com.kora.support.Contract.conforms;
import static com.kora.support.TestPortfolios.etag;
import static com.kora.support.TestPortfolios.read;
import static org.assertj.core.api.Assertions.assertThat;

import com.kora.organization.Role;
import com.kora.support.IntegrationTest;
import com.kora.support.RecordingEmailSender;
import com.kora.support.TestAccounts;
import com.kora.support.TestAccounts.Session;
import com.kora.support.TestPortfolios;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.assertj.MockMvcTester;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

/** Feature 07: the WBS tree, its roll-ups and its structural rules, through the API. */
@IntegrationTest
class WbsIT {

    @Autowired
    private MockMvcTester mvc;

    @Autowired
    private RecordingEmailSender emails;

    private Session manager;
    private String projectId;

    @BeforeEach
    void setUp() {
        TestAccounts accounts = new TestAccounts(mvc, emails);
        TestPortfolios portfolios = new TestPortfolios(mvc);
        Session admin = accounts.registerOrganization();
        manager = accounts.join(admin, Role.PROJECT_MANAGER);
        projectId = portfolios.project(manager, portfolios.portfolio(admin));
    }

    @Test
    void buildsATreeWithCodesAndEffortWeightedRollUps() {
        String design = id(add(null, "DELIVERABLE", "Design", ""));
        add(
                design,
                "WORK_PACKAGE",
                "Wireframes",
                ",\"plannedEffortHours\":100,\"plannedCost\":\"1000000\",\"percentComplete\":50");
        add(
                design,
                "WORK_PACKAGE",
                "Visual design",
                ",\"plannedEffortHours\":300,\"plannedCost\":\"3000000\",\"percentComplete\":10");

        assertThat(conforms(tree())).hasStatusOk().bodyJson().isLenientlyEqualTo("""
                        { "plannedEffortHours": 400, "percentComplete": 20,
                          "plannedCost": { "amount": "4000000", "currency": "RWF" },
                          "earnedValue": { "amount": "800000", "currency": "RWF" },
                          "nodes": [{ "code": "1", "name": "Design", "type": "DELIVERABLE", "percentComplete": 20,
                                      "children": [{ "code": "1.1", "name": "Wireframes" },
                                                   { "code": "1.2", "name": "Visual design" }] }] }
                        """);
    }

    @Test
    void progressChangesRollUpToEveryAncestor() {
        String top = id(add(null, "DELIVERABLE", "App", ""));
        String middle = id(add(top, "DELIVERABLE", "Backend", ""));
        MvcTestResult api = add(middle, "WORK_PACKAGE", "API", ",\"plannedEffortHours\":10,\"percentComplete\":0");

        assertThat(conforms(mvc.patch()
                        .uri("/api/v1/wbs/nodes/{id}", id(api))
                        .headers(manager.headers())
                        .header(HttpHeaders.IF_MATCH, etag(api))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"percentComplete\":75}")
                        .exchange()))
                .hasStatusOk();

        MvcTestResult tree = tree();
        for (String level : new String[] {"$", "$.nodes[0]", "$.nodes[0].children[0]"}) {
            assertThat(tree)
                    .bodyJson()
                    .extractingPath(level + ".percentComplete")
                    .isEqualTo(75.0);
        }
    }

    @Test
    void enforcesTheStructuralRules() {
        String leaf = id(add(null, "WORK_PACKAGE", "Leaf", ""));
        String top = id(add(null, "DELIVERABLE", "Top", ""));
        String child = id(add(top, "DELIVERABLE", "Child", ""));

        assertThat(conforms(add(leaf, "WORK_PACKAGE", "Under a leaf", "")))
                .hasStatus(HttpStatus.CONFLICT)
                .bodyJson()
                .extractingPath("$.code")
                .isEqualTo("wbs.parent_not_deliverable");
        assertThat(conforms(move(top, child, 0)))
                .hasStatus(HttpStatus.CONFLICT)
                .bodyJson()
                .extractingPath("$.code")
                .isEqualTo("wbs.cycle");
        assertThat(conforms(add(top, "DELIVERABLE", "Costed deliverable", ",\"plannedCost\":\"100\"")))
                .hasStatus(HttpStatus.BAD_REQUEST)
                .bodyJson()
                .extractingPath("$.errors[0].field")
                .isEqualTo("plannedCost");
    }

    @Test
    void movingRenumbersTheTree() {
        String first = id(add(null, "DELIVERABLE", "First", ""));
        String second = id(add(null, "DELIVERABLE", "Second", ""));

        assertThat(conforms(move(second, null, 0))).hasStatusOk().bodyJson().isLenientlyEqualTo("""
                        { "nodes": [{ "id": "%s", "code": "1" }, { "id": "%s", "code": "2" }] }
                        """.formatted(
                        second, first));
    }

    @Test
    void deletingASubtreeNeedsCascade() {
        String top = id(add(null, "DELIVERABLE", "Top", ""));
        add(top, "WORK_PACKAGE", "Child", "");

        assertThat(conforms(mvc.delete()
                        .uri("/api/v1/wbs/nodes/{id}", top)
                        .headers(manager.headers())
                        .exchange()))
                .hasStatus(HttpStatus.CONFLICT)
                .bodyJson()
                .extractingPath("$.code")
                .isEqualTo("wbs.has_children");
        assertThat(conforms(mvc.delete()
                        .uri("/api/v1/wbs/nodes/{id}?cascade=true", top)
                        .headers(manager.headers())
                        .exchange()))
                .hasStatus(HttpStatus.NO_CONTENT);
        assertThat(tree()).bodyJson().extractingPath("$.nodes").asArray().isEmpty();
    }

    @Test
    void theDashboardFollowsWbsProgress() {
        add(null, "WORK_PACKAGE", "Everything", ",\"plannedEffortHours\":8,\"percentComplete\":40");

        assertThat(mvc.get().uri("/api/v1/dashboard/projects").headers(manager.headers()))
                .bodyJson()
                .extractingPath("$.content[0].percentComplete")
                .isEqualTo(40.0);
    }

    private MvcTestResult add(String parentId, String type, String name, String extra) {
        String parent = parentId == null ? "" : "\"parentId\":\"%s\",".formatted(parentId);
        return mvc.post()
                .uri("/api/v1/projects/{id}/wbs/nodes", projectId)
                .headers(manager.headers())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{%s\"name\":\"%s\",\"type\":\"%s\"%s}".formatted(parent, name, type, extra))
                .exchange();
    }

    private MvcTestResult move(String nodeId, String newParentId, int position) {
        String parent = newParentId == null ? "" : "\"newParentId\":\"%s\",".formatted(newParentId);
        return mvc.post()
                .uri("/api/v1/wbs/nodes/{id}/move", nodeId)
                .headers(manager.headers())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{%s\"position\":%d}".formatted(parent, position))
                .exchange();
    }

    private MvcTestResult tree() {
        return mvc.get()
                .uri("/api/v1/projects/{id}/wbs", projectId)
                .headers(manager.headers())
                .exchange();
    }

    private static String id(MvcTestResult created) {
        assertThat(created).hasStatus(HttpStatus.CREATED);
        return read(created, "$.id");
    }
}
