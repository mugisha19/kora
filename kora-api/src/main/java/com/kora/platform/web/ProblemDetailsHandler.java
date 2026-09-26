package com.kora.platform.web;

import com.kora.platform.error.FieldViolation;
import com.kora.platform.error.ForbiddenException;
import com.kora.platform.error.OptimisticLock;
import com.kora.platform.error.PlatformErrorCodes;
import com.kora.platform.error.ProblemException;
import com.kora.platform.error.RateLimitedException;
import com.kora.platform.error.UnauthenticatedException;
import jakarta.validation.ConstraintViolation;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Supplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.TypeMismatchException;
import org.springframework.context.MessageSourceResolvable;
import org.springframework.core.MethodParameter;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.validation.FieldError;
import org.springframework.validation.ObjectError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.ServletWebRequest;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;
import tools.jackson.core.JacksonException;

/**
 * The single place where failures become HTTP responses: RFC 9457 Problem Details with the contract's extensions
 * ({@code code}, {@code correlationId}, {@code errors[]}) and a {@code urn:kora:problem:<code>} type.
 *
 * <p>Spring MVC's own exceptions (bad JSON, unknown path, wrong method...) are handled by the base class and then
 * enriched in {@link #createResponseEntity}, so every error, expected or not, has the same shape. Unexpected
 * exceptions are logged with their stack trace and answered with a generic {@code 500 internal.error}: internal
 * messages never reach the client.
 */
@RestControllerAdvice
class ProblemDetailsHandler extends ResponseEntityExceptionHandler {

    private static final Logger LOG = LoggerFactory.getLogger(ProblemDetailsHandler.class);

    private static final String INVALID_FIELDS = "The request has invalid fields";
    private static final Set<String> MESSAGE_PARAMS = Set.of("min", "max", "value");

    // ---- Kora's own problems -------------------------------------------------------------------------------

    @ExceptionHandler(ProblemException.class)
    ResponseEntity<Object> handleProblem(ProblemException ex, WebRequest request) {
        HttpHeaders headers = new HttpHeaders();
        if (ex instanceof RateLimitedException rateLimited) {
            headers.set(HttpHeaders.RETRY_AFTER, String.valueOf(rateLimited.retryAfterSeconds()));
        }
        HttpStatus status = ProblemDetailsFactory.statusOf(ex);
        return handleExceptionInternal(ex, ProblemDetailsFactory.from(ex), headers, status, request);
    }

    /** Method security denied the call (the UI hides what a role can't do; the API enforces it). */
    @ExceptionHandler(AccessDeniedException.class)
    ResponseEntity<Object> handleAccessDenied(AccessDeniedException ex, WebRequest request) {
        return handleProblem(new ForbiddenException("You don't have permission to do this"), request);
    }

    @ExceptionHandler(AuthenticationException.class)
    ResponseEntity<Object> handleAuthentication(AuthenticationException ex, WebRequest request) {
        return handleProblem(
                new UnauthenticatedException(PlatformErrorCodes.UNAUTHENTICATED, "Sign in to continue"), request);
    }

    /** JPA's {@code @Version} check caught a concurrent write that slipped past the {@code If-Match} check. */
    @ExceptionHandler(ObjectOptimisticLockingFailureException.class)
    ResponseEntity<Object> handleOptimisticLockFailure(ObjectOptimisticLockingFailureException ex, WebRequest request) {
        return handleProblem(OptimisticLock.staleVersion(), request);
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<Object> handleUnexpected(Exception ex, WebRequest request) {
        LOG.error("Unhandled exception", ex);
        HttpStatus status = HttpStatus.INTERNAL_SERVER_ERROR;
        ProblemDetail body = ProblemDetailsFactory.create(
                status, ProblemDetailsFactory.GENERIC_SERVER_ERROR, PlatformErrorCodes.INTERNAL_ERROR, List.of());
        return handleExceptionInternal(ex, body, new HttpHeaders(), status, request);
    }

    // ---- Spring MVC exceptions that carry field-level detail ----------------------------------------------

    @Override
    protected ResponseEntity<Object> handleMethodArgumentNotValid(
            MethodArgumentNotValidException ex, HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        List<FieldViolation> violations = new ArrayList<>();
        for (FieldError error : ex.getBindingResult().getFieldErrors()) {
            violations.add(
                    violation(error.getField(), error.getCode(), error.getDefaultMessage(), constraintOf(error)));
        }
        for (ObjectError error : ex.getBindingResult().getGlobalErrors()) {
            violations.add(violation("body", error.getCode(), error.getDefaultMessage(), constraintOf(error)));
        }
        return invalid(ex, violations, headers, status, request);
    }

    @Override
    protected ResponseEntity<Object> handleHandlerMethodValidationException(
            HandlerMethodValidationException ex, HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        List<FieldViolation> violations = new ArrayList<>();
        ex.getParameterValidationResults().forEach(result -> {
            String parameter = requestName(result.getMethodParameter());
            for (MessageSourceResolvable error : result.getResolvableErrors()) {
                String field = error instanceof FieldError fieldError ? fieldError.getField() : parameter;
                ConstraintViolation<?> constraint =
                        unwrapConstraint(() -> result.unwrap(error, ConstraintViolation.class));
                violations.add(violation(field, lastCode(error), error.getDefaultMessage(), constraint));
            }
        });
        return invalid(ex, violations, headers, status, request);
    }

    @Override
    protected ResponseEntity<Object> handleHttpMessageNotReadable(
            HttpMessageNotReadableException ex, HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        FieldViolation violation = unreadableBody(ex);
        return invalid(ex, List.of(violation), headers, status, request);
    }

    @Override
    protected ResponseEntity<Object> handleTypeMismatch(
            TypeMismatchException ex, HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        String field = ex instanceof MethodArgumentTypeMismatchException mismatch
                ? requestName(mismatch.getParameter())
                : String.valueOf(ex.getPropertyName());
        String expected =
                ex.getRequiredType() == null ? "value" : ex.getRequiredType().getSimpleName();
        FieldViolation violation =
                FieldViolation.of(field, PlatformErrorCodes.Field.INVALID, "must be a valid " + expected);
        return invalid(ex, List.of(violation), headers, HttpStatus.BAD_REQUEST, request);
    }

    @Override
    protected ResponseEntity<Object> handleMissingServletRequestParameter(
            MissingServletRequestParameterException ex,
            HttpHeaders headers,
            HttpStatusCode status,
            WebRequest request) {
        FieldViolation violation =
                FieldViolation.of(ex.getParameterName(), PlatformErrorCodes.Field.REQUIRED, "is required");
        return invalid(ex, List.of(violation), headers, status, request);
    }

    // ---- One shape for every error response ---------------------------------------------------------------

    /**
     * Last hook before any error response is written, whichever handler produced it. Fills in what the contract
     * requires and the base class doesn't know about: code, type, instance and correlation id.
     */
    @Override
    protected ResponseEntity<Object> createResponseEntity(
            Object body, HttpHeaders headers, HttpStatusCode statusCode, WebRequest request) {
        ProblemDetail problem = body instanceof ProblemDetail detail ? detail : ProblemDetail.forStatus(statusCode);
        String uri = request instanceof ServletWebRequest servlet
                ? servlet.getRequest().getRequestURI()
                : null;
        ProblemDetailsFactory.complete(problem, statusCode, uri);
        return new ResponseEntity<>(problem, headers, statusCode);
    }

    private ResponseEntity<Object> invalid(
            Exception ex,
            List<FieldViolation> violations,
            HttpHeaders headers,
            HttpStatusCode status,
            WebRequest request) {
        ProblemDetail body =
                ProblemDetailsFactory.create(status, INVALID_FIELDS, PlatformErrorCodes.VALIDATION_FAILED, violations);
        return handleExceptionInternal(ex, body, headers, status, request);
    }

    // ---- Translating validation details into the contract's field codes ------------------------------------

    private static FieldViolation violation(
            String field, String constraintName, String message, ConstraintViolation<?> constraint) {
        return new FieldViolation(
                field,
                fieldCode(constraintName),
                message == null ? "is invalid" : message,
                constraint == null ? Map.of() : messageParams(constraint));
    }

    /** Bean Validation constraint name (e.g. {@code Size}) to the contract's field-agnostic reason. */
    private static String fieldCode(String constraintName) {
        if (constraintName == null) {
            return PlatformErrorCodes.Field.INVALID;
        }
        return switch (constraintName) {
            case "NotNull", "NotBlank", "NotEmpty" -> PlatformErrorCodes.Field.REQUIRED;
            case "Size", "Length" -> PlatformErrorCodes.Field.LENGTH;
            case "Email" -> PlatformErrorCodes.Field.EMAIL;
            case "Pattern" -> PlatformErrorCodes.Field.FORMAT;
            case "Min",
                    "Max",
                    "DecimalMin",
                    "DecimalMax",
                    "Positive",
                    "PositiveOrZero",
                    "Negative",
                    "NegativeOrZero",
                    "Range",
                    "Digits",
                    "Past",
                    "PastOrPresent",
                    "Future",
                    "FutureOrPresent" -> PlatformErrorCodes.Field.RANGE;
            default -> PlatformErrorCodes.Field.INVALID;
        };
    }

    /** Only the bounds a translated message needs ({@code min}, {@code max}, {@code value}), never the input. */
    private static Map<String, Object> messageParams(ConstraintViolation<?> constraint) {
        Map<String, Object> params = new LinkedHashMap<>();
        constraint.getConstraintDescriptor().getAttributes().forEach((name, value) -> {
            if (MESSAGE_PARAMS.contains(name)) {
                params.put(name, value);
            }
        });
        return params;
    }

    private static ConstraintViolation<?> constraintOf(ObjectError error) {
        return error.contains(ConstraintViolation.class) ? error.unwrap(ConstraintViolation.class) : null;
    }

    private static ConstraintViolation<?> unwrapConstraint(Supplier<ConstraintViolation<?>> unwrap) {
        try {
            return unwrap.get();
        } catch (IllegalArgumentException notAConstraint) {
            return null;
        }
    }

    private static String lastCode(MessageSourceResolvable error) {
        String[] codes = error.getCodes();
        return codes == null || codes.length == 0 ? null : codes[codes.length - 1];
    }

    /** The name the client used: {@code @RequestParam("q")} rather than the Java parameter name. */
    private static String requestName(MethodParameter parameter) {
        RequestParam param = parameter.getParameterAnnotation(RequestParam.class);
        if (param != null && !param.name().isEmpty()) {
            return param.name();
        }
        RequestHeader header = parameter.getParameterAnnotation(RequestHeader.class);
        if (header != null && !header.name().isEmpty()) {
            return header.name();
        }
        PathVariable path = parameter.getParameterAnnotation(PathVariable.class);
        if (path != null && !path.name().isEmpty()) {
            return path.name();
        }
        return String.valueOf(parameter.getParameterName());
    }

    /**
     * Points at the offending JSON field when Jackson knows it ({@code role} for an unknown enum value), otherwise
     * at {@code body}. The rejected value is never echoed back: it may be a password.
     */
    private static FieldViolation unreadableBody(HttpMessageNotReadableException ex) {
        Throwable cause = ex.getCause();
        while (cause != null && !(cause instanceof JacksonException)) {
            cause = cause.getCause();
        }
        if (cause instanceof JacksonException jackson && !jackson.getPath().isEmpty()) {
            StringBuilder field = new StringBuilder();
            for (JacksonException.Reference reference : jackson.getPath()) {
                if (reference.getPropertyName() != null) {
                    if (!field.isEmpty()) {
                        field.append('.');
                    }
                    field.append(reference.getPropertyName());
                } else if (reference.getIndex() >= 0) {
                    field.append('[').append(reference.getIndex()).append(']');
                }
            }
            return FieldViolation.of(field.toString(), PlatformErrorCodes.Field.INVALID, "has an invalid value");
        }
        if (cause == null) {
            return FieldViolation.of("body", PlatformErrorCodes.Field.REQUIRED, "A JSON request body is required");
        }
        return FieldViolation.of("body", PlatformErrorCodes.Field.INVALID, "The request body is not valid JSON");
    }
}
