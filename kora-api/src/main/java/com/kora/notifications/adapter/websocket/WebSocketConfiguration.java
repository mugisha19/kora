package com.kora.notifications.adapter.websocket;

import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.converter.JacksonJsonMessageConverter;
import org.springframework.messaging.converter.MessageConverter;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;
import tools.jackson.databind.json.JsonMapper;

/**
 * Live updates over STOMP on {@code /ws} (feature 18): personal notifications on {@code /user/queue/notifications},
 * project activity on {@code /topic/projects/{id}}. The in-memory simple broker suits one instance; several
 * instances would relay to a shared broker instead (ADR 0013).
 *
 * <p>The handshake itself is open, because browsers can't put headers on it; the STOMP {@code CONNECT} frame carries
 * the access token and the organization, and {@link StompAuthorization} checks them and every subscription.
 */
@Configuration(proxyBeanMethods = false)
@EnableWebSocketMessageBroker
class WebSocketConfiguration implements WebSocketMessageBrokerConfigurer {

    static final String ENDPOINT = "/ws";

    private final StompAuthorization authorization;
    private final JsonMapper json;
    private final String webBaseUrl;

    WebSocketConfiguration(
            StompAuthorization authorization, JsonMapper json, @Value("${kora.web.base-url}") String webBaseUrl) {
        this.authorization = authorization;
        this.json = json;
        this.webBaseUrl = webBaseUrl;
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint(ENDPOINT).setAllowedOrigins(webBaseUrl);
    }

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        registry.enableSimpleBroker("/topic", "/queue");
        registry.setUserDestinationPrefix("/user");
        // Clients only listen: nothing is routed to application handlers.
        registry.setApplicationDestinationPrefixes("/app");
    }

    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        registration.interceptors(authorization);
    }

    /** The API's own JSON settings (absent fields omitted, ISO dates), so pushed payloads match the REST ones. */
    @Override
    public boolean configureMessageConverters(List<MessageConverter> converters) {
        converters.add(new JacksonJsonMessageConverter(json));
        return false;
    }
}
