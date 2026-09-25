package com.kora.platform.web;

import java.util.List;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/** Web MVC conventions shared by every module's controllers. */
@Configuration(proxyBeanMethods = false)
class PlatformWebConfig implements WebMvcConfigurer {

    @Override
    public void addArgumentResolvers(List<HandlerMethodArgumentResolver> resolvers) {
        resolvers.add(new IfMatchVersionArgumentResolver());
    }
}
