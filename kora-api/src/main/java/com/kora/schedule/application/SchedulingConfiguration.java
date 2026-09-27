package com.kora.schedule.application;

import com.kora.schedule.domain.CriticalPathMethod;
import com.kora.schedule.domain.SchedulingStrategy;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** The domain stays free of Spring; the strategy in use is chosen here. */
@Configuration(proxyBeanMethods = false)
class SchedulingConfiguration {

    @Bean
    SchedulingStrategy schedulingStrategy() {
        return new CriticalPathMethod();
    }
}
