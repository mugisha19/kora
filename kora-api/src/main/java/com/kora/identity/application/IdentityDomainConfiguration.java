package com.kora.identity.application;

import com.kora.identity.domain.BreachedPasswords;
import com.kora.identity.domain.PasswordPolicy;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** Domain objects are plain Java; they become beans here so the domain package stays free of Spring. */
@Configuration(proxyBeanMethods = false)
class IdentityDomainConfiguration {

    @Bean
    PasswordPolicy passwordPolicy(BreachedPasswords breachedPasswords) {
        return new PasswordPolicy(breachedPasswords);
    }
}
