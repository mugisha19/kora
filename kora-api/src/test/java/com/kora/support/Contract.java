package com.kora.support;

import com.atlassian.oai.validator.OpenApiInteractionValidator;
import com.atlassian.oai.validator.mockmvc.OpenApiValidationMatchers;
import com.atlassian.oai.validator.report.LevelResolver;
import com.atlassian.oai.validator.report.ValidationReport;
import java.nio.file.Path;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

/**
 * Checks a real request/response pair against {@code docs/openapi.yaml}: path, method, parameters, headers, status
 * and body schema (ADR 0006). An endpoint that drifts from the contract fails its integration test, whichever side
 * changed.
 */
public final class Contract {

    private static final String SPEC = Path.of("docs", "openapi.yaml").toUri().toString();

    private static final OpenApiInteractionValidator VALIDATOR = OpenApiInteractionValidator.createForSpecificationUrl(
                    SPEC)
            .withBasePathOverride("/api/v1")
            // Merge allOf (paged lists are PageMetadata + content) before validating, instead of checking each part
            // on its own, which would flag `content` as an unexpected property of PageMetadata.
            .withResolveCombinators(true)
            .build();

    /** Ignores the request side, for tests that send a contract-violating request on purpose. */
    private static final OpenApiInteractionValidator RESPONSE_VALIDATOR =
            OpenApiInteractionValidator.createForSpecificationUrl(SPEC)
                    .withBasePathOverride("/api/v1")
                    .withResolveCombinators(true)
                    .withLevelResolver(LevelResolver.create()
                            .withLevel("validation.request", ValidationReport.Level.IGNORE)
                            .build())
                    .build();

    private Contract() {}

    /** Request and response both match the contract. Returns the result, so it can wrap an exchange inline. */
    public static MvcTestResult conforms(MvcTestResult result) {
        return validate(VALIDATOR, result);
    }

    /** Only the response must match: the test sent an invalid request on purpose (to check the error answer). */
    public static MvcTestResult responseConforms(MvcTestResult result) {
        return validate(RESPONSE_VALIDATOR, result);
    }

    private static MvcTestResult validate(OpenApiInteractionValidator validator, MvcTestResult result) {
        try {
            OpenApiValidationMatchers.openApi().isValid(validator).match(result.getMvcResult());
        } catch (AssertionError e) {
            throw e;
        } catch (Exception e) {
            throw new AssertionError("Contract validation could not run", e);
        }
        return result;
    }
}
