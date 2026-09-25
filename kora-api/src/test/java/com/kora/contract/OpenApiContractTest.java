package com.kora.contract;

import static com.kora.contract.OpenApiContract.refName;
import static com.kora.contract.OpenApiContract.resolve;
import static com.kora.contract.OpenApiContract.spec;
import static org.assertj.core.api.Assertions.assertThat;

import io.swagger.v3.oas.models.Operation;
import io.swagger.v3.oas.models.PathItem;
import io.swagger.v3.oas.models.media.MediaType;
import io.swagger.v3.oas.models.parameters.Parameter;
import io.swagger.v3.oas.models.responses.ApiResponse;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.BiConsumer;
import org.junit.jupiter.api.Test;

/**
 * The contract is linted like code (ADR 0006): it must parse without warnings, and every operation must follow
 * the conventions of ADR 0005. A violation names the operation, so the fix is obvious.
 */
class OpenApiContractTest {

    private static final String PROBLEM_JSON = "application/problem+json";
    private static final String PROBLEM_SCHEMA = "#/components/schemas/Problem";
    private static final String CORRELATION_HEADER = "X-Correlation-Id";

    /** Endpoints that work before an organization is chosen: sign-in flows, the user's own profile, invitation links. */
    private static final List<String> NOT_TENANT_SCOPED = List.of("/auth/", "/me/", "/invitations/token/");

    @Test
    void parsesWithoutErrorsOrWarnings() {
        assertThat(OpenApiContract.parse().getMessages()).isEmpty();
        assertThat(spec()).isNotNull();
        assertThat(spec().getOpenapi()).startsWith("3.0.");
    }

    @Test
    void everyOperationIsIdentifiedDocumentedAndTagged() {
        Set<String> operationIds = new HashSet<>();
        List<String> problems = forEachOperation((name, operation) -> {
            if (operation.getOperationId() == null) {
                throw new AssertionError(name + " has no operationId");
            }
            if (!operationIds.add(operation.getOperationId())) {
                throw new AssertionError(name + " reuses operationId " + operation.getOperationId());
            }
            if (operation.getSummary() == null
                    || operation.getTags() == null
                    || operation.getTags().isEmpty()) {
                throw new AssertionError(name + " needs a summary and a tag");
            }
        });
        assertThat(problems).isEmpty();
    }

    @Test
    void everyErrorResponseIsProblemDetails() {
        List<String> problems = forEachOperation((name, operation) -> {
            if (!operation.getResponses().containsKey("500")) {
                throw new AssertionError(name + " doesn't declare 500");
            }
            operation.getResponses().forEach((status, response) -> {
                if (status.startsWith("4") || status.startsWith("5")) {
                    Map<String, MediaType> content = resolve(response).getContent();
                    boolean isProblem = content != null
                            && content.size() == 1
                            && content.containsKey(PROBLEM_JSON)
                            && PROBLEM_SCHEMA.equals(
                                    content.get(PROBLEM_JSON).getSchema().get$ref());
                    if (!isProblem) {
                        throw new AssertionError(name + " " + status + " is not " + PROBLEM_JSON + " Problem");
                    }
                }
            });
        });
        assertThat(problems).isEmpty();
    }

    @Test
    void everyResponseEchoesTheCorrelationId() {
        List<String> problems =
                forEachOperation((name, operation) -> operation.getResponses().forEach((status, response) -> {
                    ApiResponse resolved = resolve(response);
                    if (resolved.getHeaders() == null || !resolved.getHeaders().containsKey(CORRELATION_HEADER)) {
                        throw new AssertionError(name + " " + status + " doesn't declare " + CORRELATION_HEADER);
                    }
                }));
        assertThat(problems).isEmpty();
    }

    @Test
    void tenantScopedOperationsRequireTheOrganizationHeaderAndOthersDont() {
        List<String> problems = forEachOperation((name, operation) -> {
            String path = name.substring(name.indexOf(' ') + 1);
            boolean tenantScoped =
                    !path.equals("/me") && NOT_TENANT_SCOPED.stream().noneMatch(path::startsWith);
            boolean hasHeader = parameterNames(operation).contains("X-Organization-Id");
            if (tenantScoped != hasHeader) {
                throw new AssertionError(
                        name + (tenantScoped ? " is missing" : " must not have") + " X-Organization-Id");
            }
            if (tenantScoped && !operation.getResponses().containsKey("403")) {
                throw new AssertionError(name + " is tenant-scoped but doesn't declare 403 (tenant.forbidden)");
            }
        });
        assertThat(problems).isEmpty();
    }

    @Test
    void versionedUpdatesRequireIfMatchAndDeclare412And428() {
        List<String> problems = forEachOperation((name, operation) -> {
            boolean hasIfMatch = parameterNames(operation).contains("If-Match");
            if (name.startsWith("PATCH") && !name.equals("PATCH /me") && !hasIfMatch) {
                throw new AssertionError(name + " updates a versioned resource without If-Match");
            }
            if (hasIfMatch
                    && !(operation.getResponses().containsKey("412")
                            && operation.getResponses().containsKey("428"))) {
                throw new AssertionError(name + " takes If-Match but doesn't declare 412 and 428");
            }
        });
        assertThat(problems).isEmpty();
    }

    @Test
    void requestBodiesAreJson() {
        List<String> problems = forEachOperation((name, operation) -> {
            if (operation.getRequestBody() != null
                    && !operation.getRequestBody().getContent().keySet().equals(Set.of("application/json"))) {
                throw new AssertionError(name + " request body must be application/json only");
            }
        });
        assertThat(problems).isEmpty();
    }

    @Test
    void publicOperationsAreExactlyTheSignInAndInvitationLinkFlows() {
        List<String> publicOperations = new ArrayList<>();
        forEachOperation((name, operation) -> {
            if (operation.getSecurity() != null && operation.getSecurity().isEmpty()) {
                publicOperations.add(name);
            }
        });
        assertThat(publicOperations)
                .containsExactlyInAnyOrder(
                        "POST /auth/login",
                        "POST /auth/register-organization",
                        "POST /auth/password/forgot",
                        "POST /auth/password/reset",
                        "GET /invitations/token/{token}",
                        "POST /invitations/token/{token}/accept");
    }

    private static Set<String> parameterNames(Operation operation) {
        Set<String> names = new HashSet<>();
        if (operation.getParameters() != null) {
            for (Parameter parameter : operation.getParameters()) {
                names.add(resolve(parameter).getName());
            }
        }
        return names;
    }

    /** Runs a check on every operation and collects failures, so one run reports every broken operation. */
    private static List<String> forEachOperation(BiConsumer<String, Operation> check) {
        List<String> failures = new ArrayList<>();
        spec().getPaths().forEach((path, item) -> {
            for (Map.Entry<PathItem.HttpMethod, Operation> entry :
                    item.readOperationsMap().entrySet()) {
                try {
                    check.accept(entry.getKey() + " " + path, entry.getValue());
                } catch (AssertionError failure) {
                    failures.add(failure.getMessage());
                }
            }
        });
        return failures;
    }

    @Test
    void responseComponentsAreAllUsed() {
        Set<String> used = new HashSet<>();
        forEachOperation((name, operation) -> operation.getResponses().values().stream()
                .filter(response -> response.get$ref() != null)
                .forEach(response -> used.add(refName(response.get$ref()))));
        assertThat(used)
                .containsExactlyInAnyOrderElementsOf(
                        spec().getComponents().getResponses().keySet());
    }
}
