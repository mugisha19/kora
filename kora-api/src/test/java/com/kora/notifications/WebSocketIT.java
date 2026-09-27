package com.kora.notifications;

import static org.assertj.core.api.Assertions.assertThat;

import com.kora.organization.Role;
import com.kora.support.IntegrationTest;
import com.kora.support.RecordingEmailSender;
import com.kora.support.TestAccounts;
import com.kora.support.TestAccounts.Session;
import com.kora.support.TestPortfolios;
import com.kora.support.TestWork;
import java.lang.reflect.Type;
import java.util.Map;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.messaging.converter.JacksonJsonMessageConverter;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompFrameHandler;
import org.springframework.messaging.simp.stomp.StompHeaders;
import org.springframework.messaging.simp.stomp.StompSession;
import org.springframework.messaging.simp.stomp.StompSessionHandlerAdapter;
import org.springframework.test.web.servlet.assertj.MockMvcTester;
import org.springframework.web.socket.WebSocketHttpHeaders;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.messaging.WebSocketStompClient;

/**
 * Feature 18, live: a member's own notifications and the activity of projects they can see arrive over STOMP; the
 * token, the organization and every subscription are checked like a REST call.
 */
@IntegrationTest
class WebSocketIT {

    @LocalServerPort
    private int port;

    @Autowired
    private MockMvcTester mvc;

    @Autowired
    private RecordingEmailSender emails;

    private final WebSocketStompClient client = new WebSocketStompClient(new StandardWebSocketClient());
    private TestAccounts accounts;
    private Session manager;
    private Session contributor;
    private String projectId;

    @BeforeEach
    void setUp() {
        client.setMessageConverter(new JacksonJsonMessageConverter());
        accounts = new TestAccounts(mvc, emails);
        TestPortfolios portfolios = new TestPortfolios(mvc);
        Session admin = accounts.registerOrganization();
        manager = accounts.join(admin, Role.PROJECT_MANAGER);
        contributor = accounts.join(admin, Role.MEMBER);
        projectId = portfolios.project(manager, portfolios.portfolio(admin));
        portfolios.addToTeam(manager, projectId, contributor.userId(), "CONTRIBUTOR");
    }

    @AfterEach
    void tearDown() {
        client.stop();
    }

    @Test
    void aMemberReceivesTheirNotificationsAsTheyHappen() throws Exception {
        Listener listener = new Listener();
        StompSession session =
                connect(contributor.accessToken(), contributor.organizationId().toString(), listener);
        session.subscribe("/user/queue/notifications", listener);
        Thread.sleep(200); // let the broker register the subscription

        new TestWork(mvc)
                .task(manager, projectId, "Live one", ",\"assigneeId\":\"%s\"".formatted(contributor.userId()));

        Map<String, Object> pushed = listener.next();
        assertThat(pushed)
                .containsEntry("type", "TASK_ASSIGNED")
                .containsEntry("titleKey", "notifications.task_assigned");
        assertThat(pushed).doesNotContainKey("readAt");
    }

    @Test
    void projectActivityReachesEveryoneWhoSeesTheProject() throws Exception {
        Listener listener = new Listener();
        StompSession session =
                connect(contributor.accessToken(), contributor.organizationId().toString(), listener);
        session.subscribe("/topic/projects/" + projectId, listener);
        Thread.sleep(200);

        String task = new TestWork(mvc).task(manager, projectId, "Visible", "");

        assertThat(listener.next()).containsEntry("action", "task.created").containsEntry("entityId", task);
    }

    @Test
    void aProjectOutsideTheMembersReachIsRefused() throws Exception {
        Session stranger = accounts.registerOrganization();
        Listener listener = new Listener();
        StompSession session =
                connect(stranger.accessToken(), stranger.organizationId().toString(), listener);

        session.subscribe("/topic/projects/" + projectId, listener);

        assertThat(listener.error()).contains("Project not found");
    }

    @Test
    void onlyKnownDestinationsCanBeSubscribed() throws Exception {
        Listener listener = new Listener();
        StompSession session =
                connect(contributor.accessToken(), contributor.organizationId().toString(), listener);

        session.subscribe("/topic/everything", listener);

        assertThat(listener.error()).contains("Unknown destination");
    }

    @Test
    void aConnectionNeedsAValidTokenAndAMembership() throws Exception {
        Listener badToken = new Listener();
        connectAsync("not-a-token", contributor.organizationId().toString(), badToken);
        assertThat(badToken.error()).contains("Sign in to continue");

        Listener otherOrganization = new Listener();
        connectAsync(
                contributor.accessToken(),
                accounts.registerOrganization().organizationId().toString(),
                otherOrganization);
        assertThat(otherOrganization.error()).contains("not a member");
    }

    private StompSession connect(String token, String organization, Listener listener) throws Exception {
        return connectAsync(token, organization, listener).get(10, TimeUnit.SECONDS);
    }

    private CompletableFuture<StompSession> connectAsync(String token, String organization, Listener listener) {
        StompHeaders connect = new StompHeaders();
        connect.add("Authorization", "Bearer " + token);
        connect.add("X-Organization-Id", organization);
        return client.connectAsync("ws://localhost:" + port + "/ws", new WebSocketHttpHeaders(), connect, listener);
    }

    /** Collects pushed payloads, and the reason of an ERROR frame. */
    private static final class Listener extends StompSessionHandlerAdapter implements StompFrameHandler {

        private final BlockingQueue<Map<String, Object>> payloads = new LinkedBlockingQueue<>();
        private final CompletableFuture<String> error = new CompletableFuture<>();

        @Override
        public Type getPayloadType(StompHeaders headers) {
            return Map.class;
        }

        @Override
        @SuppressWarnings("unchecked")
        public void handleFrame(StompHeaders headers, Object payload) {
            if (isError(headers)) {
                error.complete(String.valueOf(headers.getFirst("message")));
                return;
            }
            payloads.add((Map<String, Object>) payload);
        }

        @Override
        public void handleException(
                StompSession session, StompCommand command, StompHeaders headers, byte[] payload, Throwable failure) {
            error.complete(String.valueOf(headers.getFirst("message")));
        }

        @Override
        public void handleTransportError(StompSession session, Throwable failure) {
            error.complete(String.valueOf(failure.getMessage()));
        }

        /** An ERROR frame carries a {@code message} header and, unlike a MESSAGE frame, no destination. */
        private static boolean isError(StompHeaders headers) {
            return headers.getFirst("message") != null && headers.getDestination() == null;
        }

        Map<String, Object> next() throws InterruptedException {
            Map<String, Object> payload = payloads.poll(10, TimeUnit.SECONDS);
            assertThat(payload).as("a pushed message").isNotNull();
            return payload;
        }

        String error() throws Exception {
            return error.get(10, TimeUnit.SECONDS);
        }
    }
}
