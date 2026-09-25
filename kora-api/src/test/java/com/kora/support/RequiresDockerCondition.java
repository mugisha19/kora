package com.kora.support;

import org.junit.jupiter.api.extension.ConditionEvaluationResult;
import org.junit.jupiter.api.extension.ExecutionCondition;
import org.junit.jupiter.api.extension.ExtensionContext;
import org.testcontainers.DockerClientFactory;

/**
 * Skips container-backed tests on a developer machine without Docker, but fails them in CI.
 *
 * <p>Testcontainers' own {@code disabledWithoutDocker} would also skip silently in a CI runner whose Docker
 * daemon is broken, turning a real outage into a green build. CI sets {@code CI=true} (GitHub Actions and
 * GitLab both do), so there a missing Docker is an error instead of a skip.
 */
public final class RequiresDockerCondition implements ExecutionCondition {

    @Override
    public ConditionEvaluationResult evaluateExecutionCondition(ExtensionContext context) {
        if (DockerClientFactory.instance().isDockerAvailable()) {
            return ConditionEvaluationResult.enabled("Docker is available");
        }
        if (Boolean.parseBoolean(System.getenv("CI"))) {
            throw new IllegalStateException("Docker is required for integration tests in CI but is not available");
        }
        return ConditionEvaluationResult.disabled("Docker is not available; integration test skipped locally");
    }
}
