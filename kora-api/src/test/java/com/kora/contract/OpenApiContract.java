package com.kora.contract;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.headers.Header;
import io.swagger.v3.oas.models.parameters.Parameter;
import io.swagger.v3.oas.models.responses.ApiResponse;
import io.swagger.v3.parser.OpenAPIV3Parser;
import io.swagger.v3.parser.core.models.ParseOptions;
import io.swagger.v3.parser.core.models.SwaggerParseResult;
import java.nio.file.Path;
import java.util.List;

/** Loads {@code docs/openapi.yaml} once per test run, keeping {@code $ref}s so tests can check which component is used. */
final class OpenApiContract {

    static final Path LOCATION = Path.of("docs", "openapi.yaml");

    private static SwaggerParseResult result;

    private OpenApiContract() {}

    static synchronized SwaggerParseResult parse() {
        if (result == null) {
            ParseOptions options = new ParseOptions();
            options.setResolve(false);
            result =
                    new OpenAPIV3Parser().readLocation(LOCATION.toAbsolutePath().toString(), List.of(), options);
        }
        return result;
    }

    static OpenAPI spec() {
        return parse().getOpenAPI();
    }

    static ApiResponse resolve(ApiResponse response) {
        return response.get$ref() == null
                ? response
                : spec().getComponents().getResponses().get(refName(response.get$ref()));
    }

    static Parameter resolve(Parameter parameter) {
        return parameter.get$ref() == null
                ? parameter
                : spec().getComponents().getParameters().get(refName(parameter.get$ref()));
    }

    static Header resolve(Header header) {
        return header.get$ref() == null
                ? header
                : spec().getComponents().getHeaders().get(refName(header.get$ref()));
    }

    static String refName(String ref) {
        return ref.substring(ref.lastIndexOf('/') + 1);
    }
}
