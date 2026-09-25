package com.kora.platform.web;

import com.kora.platform.error.OptimisticLock;
import org.springframework.core.MethodParameter;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;

/** Resolves {@link IfMatchVersion} parameters; registered in {@link PlatformWebConfig}. */
class IfMatchVersionArgumentResolver implements HandlerMethodArgumentResolver {

    @Override
    public boolean supportsParameter(MethodParameter parameter) {
        Class<?> type = parameter.getParameterType();
        return parameter.hasParameterAnnotation(IfMatchVersion.class) && (type == long.class || type == Long.class);
    }

    @Override
    public Object resolveArgument(
            MethodParameter parameter,
            ModelAndViewContainer mavContainer,
            NativeWebRequest webRequest,
            WebDataBinderFactory binderFactory) {
        return EntityTags.parse(webRequest.getHeader(HttpHeaders.IF_MATCH))
                .orElseThrow(OptimisticLock::ifMatchRequired);
    }
}
