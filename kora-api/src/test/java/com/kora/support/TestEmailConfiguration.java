package com.kora.support;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

/** Swaps the SMTP sender for {@link RecordingEmailSender} in every integration test. */
@TestConfiguration(proxyBeanMethods = false)
public class TestEmailConfiguration {

    @Bean
    @Primary
    RecordingEmailSender recordingEmailSender() {
        return new RecordingEmailSender();
    }
}
