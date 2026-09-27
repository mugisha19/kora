package com.kora.demo;

import static com.kora.demo.DemoApi.body;

import com.kora.demo.DemoApi.Session;
import com.kora.identity.UserAccounts;
import com.kora.identity.UserLocale;
import com.kora.organization.MemberProvisioning;
import com.kora.organization.Role;
import java.nio.charset.StandardCharsets;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.IsoFields;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import tools.jackson.databind.JsonNode;

/**
 * The demo story (feature 22), all fictional: Akagera Digital Ltd (Kigali, RWF) runs a digital services portfolio
 * where one project is healthy, one late and one in trouble; Virunga Build Partners shows a second tenant. The people
 * and projects mirror the web app's mock data, so mock mode and the real API look the same.
 *
 * <p>Everything is created through the public API as the person who would do it, in the order it would happen. The
 * health each project ends up with is computed by the real rules from the work done, so the numbers here are tuned:
 * the mobile app has finished about 60% of its points at 57% of its time (on track), the portal is late with a little
 * work left (amber), and the ERP rollout has a critical risk past its review (red).
 */
final class DemoStory {

    static final String PASSWORD = "KoraDemo!2026";
    static final String ADMIN = "admin@kora.demo";

    private static final Logger LOG = LoggerFactory.getLogger(DemoStory.class);
    private static final String[] WORKFLOW = {"TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"};

    private final DemoApi api;
    private final UserAccounts accounts;
    private final MemberProvisioning provisioning;
    private final LocalDate today;

    private final Map<String, Session> sessions = new LinkedHashMap<>();
    private final Map<String, UUID> people = new LinkedHashMap<>();
    private final Map<String, String> emails = new LinkedHashMap<>();
    private UUID akagera;
    private UUID virunga;

    DemoStory(DemoApi api, UserAccounts accounts, MemberProvisioning provisioning, LocalDate today) {
        this.api = api;
        this.accounts = accounts;
        this.provisioning = provisioning;
        this.today = today;
    }

    /** An organization created and its administrator, for the history backfills. */
    record Tenant(UUID organizationId, UUID administratorId) {}

    private record Project(UUID id, Session manager) {}

    List<Tenant> tell() {
        people();
        LOG.info("Demo: people and organizations ready");
        UUID digital = portfolio(
                as("pmo"),
                "Digital Services 2026",
                "pmo",
                "Half of customer transactions happen on digital channels by the end of 2026",
                "Retire systems that cost more to run than they return");
        UUID operations =
                portfolio(as("admin"), "Operations Excellence", "admin", "A workplace that supports hybrid teams");
        UUID channels = program(digital, "Customer Channels", "pm");
        UUID platforms = program(digital, "Core Platforms", "alice");
        for (int year : new int[] {today.getYear(), today.getYear() + 1}) {
            api.postMatching(
                    as("admin"),
                    "/organization/calendar/public-holidays",
                    "/organization/calendar",
                    body("country", "RW", "year", year));
        }
        mobileBanking(digital, channels);
        selfServicePortal(digital, channels);
        erpRollout(digital, platforms);
        officeFitOut(operations);
        dataWarehouse(digital, platforms);
        digitalSkills(operations);
        legacyCrm(digital, platforms);
        LOG.info("Demo: Akagera Digital Ltd told");
        virunga();
        LOG.info("Demo: Virunga Build Partners told");
        return List.of(new Tenant(akagera, id("admin")), new Tenant(virunga, id("olivier")));
    }

    // ---------------------------------------------------------------- people and organizations

    private void people() {
        Session admin = api.register("Akagera Digital Ltd", "Aline Uwase", ADMIN, PASSWORD);
        akagera = admin.organizationId();
        signedIn("admin", admin);
        member("pmo", "pmo@kora.demo", "Jean-Paul Habimana", Role.PMO, UserLocale.FR);
        member("pm", "pm@kora.demo", "Grace Mukamana", Role.PROJECT_MANAGER, UserLocale.EN);
        member("member", "member@kora.demo", "Eric Nshimiyimana", Role.MEMBER, UserLocale.RW);
        member("viewer", "viewer@kora.demo", "Diane Ingabire", Role.VIEWER, UserLocale.EN);
        String[] staff = {
            "alice Alice Umutoni PROJECT_MANAGER",
            "bosco Bosco Niyonsaba MEMBER",
            "chantal Chantal Mukeshimana MEMBER",
            "david David Hakizimana PMO",
            "esther Esther Uwamahoro MEMBER",
            "fabrice Fabrice Ndayisaba VIEWER",
            "gloria Gloria Iradukunda MEMBER",
            "herve Herve Munyaneza PROJECT_MANAGER",
            "immaculee Immaculee Nyirahabimana MEMBER",
            "janvier Janvier Kwizera MEMBER",
            "kevine Kevine Umurerwa VIEWER",
            "laurent Laurent Twagirumukiza MEMBER",
            "marie Marie Claire Uwineza MEMBER",
            "norbert Norbert Rukundo MEMBER",
            "odette Odette Mukamurenzi PROJECT_MANAGER",
            "pacifique Pacifique Irakoze MEMBER",
            "queen Queen Ishimwe MEMBER",
            "robert Robert Nkurunziza VIEWER"
        };
        for (String line : staff) {
            String key = line.substring(0, line.indexOf(' '));
            String role = line.substring(line.lastIndexOf(' ') + 1);
            String fullName = line.substring(key.length() + 1, line.lastIndexOf(' '));
            String email = fullName.toLowerCase(Locale.ROOT).replace(' ', '.') + "@akagera.example";
            member(key, email, fullName, Role.valueOf(role), UserLocale.EN);
        }
        Session olivier = api.register(
                "Virunga Build Partners", "Olivier Hakizimana", "olivier.hakizimana@virunga.example", PASSWORD);
        virunga = olivier.organizationId();
        signedIn("olivier", olivier);
        // Languages as in the web app's mock data: registration starts in English.
        api.patch(olivier, "/me", body("locale", "fr"));
        // The administrator of Akagera is also in Virunga's PMO: the organization switcher has two entries.
        provisioning.addMember(virunga, id("admin"), Role.PMO);
    }

    private void member(String key, String email, String fullName, Role role, UserLocale locale) {
        UUID userId = accounts.createAccount(email, fullName, PASSWORD, locale);
        provisioning.addMember(akagera, userId, role);
        people.put(key, userId);
        emails.put(key, email);
    }

    private void signedIn(String key, Session session) {
        sessions.put(key, session);
        people.put(key, session.userId());
    }

    /** The person's session in Akagera, signing in the first time. */
    private Session as(String key) {
        return sessions.computeIfAbsent(key, missing -> api.login(emails.get(missing), PASSWORD));
    }

    private UUID id(String key) {
        UUID userId = people.get(key);
        if (userId == null) {
            throw new IllegalArgumentException("Unknown demo person " + key);
        }
        return userId;
    }

    // ---------------------------------------------------------------- building blocks

    private UUID portfolio(Session session, String name, String owner, String... objectives) {
        return uuid(api.post(
                session,
                "/portfolios",
                body("name", name, "strategicObjectives", List.of(objectives), "ownerId", id(owner))));
    }

    private UUID program(UUID portfolio, String name, String manager) {
        return uuid(api.post(
                as("pmo"), "/portfolios/" + portfolio + "/programs", body("name", name, "managerId", id(manager))));
    }

    /**
     * A project created by the PMO for its manager.
     *
     * @param spec {@code METHODOLOGY start..end [budget]} in days from today, e.g. {@code AGILE -120..90 150000000}
     */
    private Project project(
            Session creator, String manager, UUID portfolio, UUID program, String code, String name, String spec) {
        String[] parts = spec.split(" ");
        String[] days = parts[1].split("\\.\\.");
        Session managing = manager.equals("olivier") ? sessions.get("olivier") : as(manager);
        UUID id = uuid(api.post(
                creator,
                "/projects",
                body(
                        "code",
                        code,
                        "name",
                        name,
                        "portfolioId",
                        portfolio,
                        "programId",
                        program,
                        "managerId",
                        managing.userId(),
                        "methodology",
                        parts[0],
                        "startDate",
                        day(Integer.parseInt(days[0])),
                        "targetEndDate",
                        day(Integer.parseInt(days[1])),
                        "budget",
                        parts.length > 2 ? body("amount", parts[2], "currency", "RWF") : null)));
        return new Project(id, managing);
    }

    /** The manager writes the charter and submits it; the sponsor's approval approves the project. */
    private void charter(Project project, Session sponsor, String purpose, boolean approve, String... milestones) {
        List<Map<String, Object>> dated = new ArrayList<>();
        for (String milestone : milestones) {
            int at = milestone.lastIndexOf('@');
            dated.add(body(
                    "name",
                    milestone.substring(0, at),
                    "targetDate",
                    day(Integer.parseInt(milestone.substring(at + 1)))));
        }
        api.update(
                project.manager(),
                "PUT",
                "/projects/" + project.id() + "/charter",
                body(
                        "purpose",
                        purpose,
                        "objectives",
                        List.of(body("text", purpose, "successMetric", "Agreed by the steering committee")),
                        "milestones",
                        dated,
                        "sponsorId",
                        sponsor.userId()));
        if (approve) {
            api.post(project.manager(), "/projects/" + project.id() + "/charter/submit", null);
            api.post(sponsor, "/projects/" + project.id() + "/charter/approve", null);
        }
    }

    private void transition(Project project, String to, String reason) {
        api.post(project.manager(), "/projects/" + project.id() + "/transitions", body("to", to, "reason", reason));
    }

    private void team(Project project, String... keys) {
        for (String key : keys) {
            api.put(
                    project.manager(),
                    "/projects/" + project.id() + "/members/" + id(key),
                    body("projectRole", "CONTRIBUTOR"));
        }
    }

    /** A deliverable (no spec) or a work package ({@code hours cost}). */
    private UUID node(Project project, UUID parent, String name, String spec) {
        String[] parts = spec == null ? new String[0] : spec.split(" ");
        return uuid(api.post(
                project.manager(),
                "/projects/" + project.id() + "/wbs/nodes",
                body(
                        "parentId", parent,
                        "name", name,
                        "type", spec == null ? "DELIVERABLE" : "WORK_PACKAGE",
                        "plannedEffortHours", parts.length > 0 ? Integer.parseInt(parts[0]) : null,
                        "plannedCost", parts.length > 1 ? parts[1] : null)));
    }

    /**
     * A task, described compactly: {@code TYPE/PRIORITY}, then any of {@code @assignee}, {@code 5pt}, {@code 32h}
     * (estimate), {@code 10d} (duration) and {@code due+3}; e.g. {@code STORY/HIGH @member 5pt 32h due+6}.
     */
    private UUID task(Project project, UUID workPackage, String spec, String title) {
        String[] parts = spec.split(" ");
        String[] kind = parts[0].split("/");
        Map<String, Object> task = body("title", title, "type", kind[0], "priority", kind[1], "wbsNodeId", workPackage);
        for (int i = 1; i < parts.length; i++) {
            String part = parts[i];
            if (part.startsWith("@")) {
                task.put("assigneeId", id(part.substring(1)).toString());
            } else if (part.startsWith("due")) {
                task.put("dueDate", day(Integer.parseInt(part.substring(3))).toString());
            } else if (part.endsWith("pt")) {
                task.put("storyPoints", Integer.parseInt(part.substring(0, part.length() - 2)));
            } else if (part.endsWith("h")) {
                task.put("estimateHours", Integer.parseInt(part.substring(0, part.length() - 1)));
            } else if (part.endsWith("d")) {
                task.put("durationDays", Integer.parseInt(part.substring(0, part.length() - 1)));
            }
        }
        return uuid(api.post(project.manager(), "/projects/" + project.id() + "/tasks", task));
    }

    /** Moves a new task along the board up to {@code status}, the way the team would. */
    private void advance(Session session, UUID task, String status) {
        advance(session, task, "BACKLOG", status);
    }

    /** Moves the task from its current column to {@code status}, one column at a time. */
    private void advance(Session session, UUID task, String from, String status) {
        boolean moving = from.equals("BACKLOG");
        for (String step : WORKFLOW) {
            if (moving) {
                api.post(session, "/tasks/" + task + "/move", body("status", step));
                if (step.equals(status)) {
                    return;
                }
            }
            moving = moving || step.equals(from);
        }
    }

    /**
     * A risk: {@code KIND CATEGORY PxI @owner STRATEGY review±days}, e.g. {@code THREAT FINANCIAL 4x5 @pmo ESCALATE
     * review+5}.
     */
    private void risk(Project project, String spec, String title, String plan) {
        String[] parts = spec.split(" ");
        String[] scores = parts[2].split("x");
        api.post(
                project.manager(),
                "/projects/" + project.id() + "/risks",
                body(
                        "title",
                        title,
                        "kind",
                        parts[0],
                        "category",
                        parts[1],
                        "probability",
                        Integer.parseInt(scores[0]),
                        "impact",
                        Integer.parseInt(scores[1]),
                        "ownerId",
                        id(parts[3].substring(1)),
                        "responseStrategy",
                        parts[4],
                        "responsePlan",
                        plan,
                        "reviewDate",
                        day(Integer.parseInt(parts[5].substring("review".length())))));
    }

    /** A stakeholder: {@code power/interest CURRENT>DESIRED}, e.g. {@code 5/4 SUPPORTIVE>LEADING}. */
    private void stakeholder(Project project, String spec, String name, String organization, String role) {
        String[] parts = spec.split(" ");
        String[] grid = parts[0].split("/");
        String[] engagement = parts[1].split(">");
        api.post(
                project.manager(),
                "/projects/" + project.id() + "/stakeholders",
                body(
                        "name",
                        name,
                        "organization",
                        organization,
                        "role",
                        role,
                        "power",
                        Integer.parseInt(grid[0]),
                        "interest",
                        Integer.parseInt(grid[1]),
                        "currentEngagement",
                        engagement[0],
                        "desiredEngagement",
                        engagement[1]));
    }

    private UUID changeRequest(String requester, Project project, String spec, String title, boolean submit) {
        String[] parts = spec.split(" ");
        UUID id = uuid(api.post(
                as(requester),
                "/projects/" + project.id() + "/change-requests",
                body(
                        "title",
                        title,
                        "type",
                        parts[0],
                        "reason",
                        "Raised in the sprint review",
                        "impact",
                        body(
                                "costDelta",
                                body("amount", parts[1], "currency", "RWF"),
                                "scheduleDeltaDays",
                                Integer.parseInt(parts[2]),
                                "scopeSummary",
                                title,
                                "changesCharterScope",
                                false))));
        if (submit) {
            api.post(as(requester), "/change-requests/" + id + "/submit", null);
        }
        return id;
    }

    private void decide(String approver, UUID request, String decision, String comment) {
        api.post(
                as(approver),
                "/change-requests/" + request + "/decisions",
                body("decision", decision, "comment", comment));
    }

    // ---------------------------------------------------------------- AKG-001: the healthy flagship

    private void mobileBanking(UUID portfolio, UUID program) {
        Project mobile = project(
                as("pmo"), "pm", portfolio, program, "AKG-001", "Mobile banking app", "AGILE -120..90 150000000");
        charter(
                mobile,
                as("pmo"),
                "Let customers bank from their phones in English, French and Kinyarwanda",
                true,
                "Beta with staff@20",
                "Public launch@85");
        transition(mobile, "IN_PROGRESS", null);
        team(mobile, "member", "bosco", "chantal", "viewer");

        UUID discovery = node(mobile, null, "Discovery", null);
        UUID build = node(mobile, null, "Build", null);
        UUID launch = node(mobile, null, "Launch", null);
        UUID research = node(mobile, discovery, "User research", "400 8000000");
        UUID architecture = node(mobile, discovery, "Architecture", "300 9000000");
        UUID accountsPackage = node(mobile, build, "Accounts and balances", "1200 30000000");
        UUID transfers = node(mobile, build, "Transfers", "1400 35000000");
        UUID bills = node(mobile, build, "Bill payments", "1000 25000000");
        UUID security = node(mobile, launch, "Security review", "300 10000000");
        node(mobile, launch, "App store release", "200 6000000");

        List<UUID> done = List.of(
                task(mobile, research, "TASK/HIGH @chantal 5pt 40h", "Interview 20 branch customers"),
                task(mobile, research, "STORY/MEDIUM @chantal 3pt 24h", "Journey map for transfers"),
                task(mobile, architecture, "TASK/HIGH @bosco 3pt 16h", "Choose the mobile framework"),
                task(mobile, accountsPackage, "STORY/CRITICAL @member 8pt 60h", "Sign in with PIN and fingerprint"),
                task(mobile, accountsPackage, "STORY/HIGH @member 5pt 32h", "Show balances of all accounts"),
                task(mobile, architecture, "CHORE/MEDIUM @bosco 5pt 24h", "Continuous delivery to the test stores"),
                task(mobile, security, "TASK/HIGH @bosco 3pt 16h", "Threat model"),
                task(mobile, research, "TASK/LOW @chantal 3pt 12h", "App brand guidelines"));
        UUID toAccount = task(mobile, transfers, "STORY/CRITICAL @member 5pt 56h due+5", "Transfer to another account");
        UUID mobileMoney = task(mobile, transfers, "STORY/HIGH @bosco 5pt 60h due+6", "Transfer to mobile money");
        UUID electricity = task(mobile, bills, "STORY/MEDIUM @chantal 3pt 40h due+6", "Pay electricity bills");
        UUID crash = task(mobile, accountsPackage, "BUG/HIGH @member 2pt 6h due+2", "Crash on login with an old PIN");
        task(mobile, bills, "STORY/MEDIUM 3pt 24h", "Pay water bills");
        UUID pentest = task(mobile, security, "TASK/HIGH @bosco 5pt 40h due+60", "Penetration test");
        task(mobile, accountsPackage, "STORY/LOW 20h", "Transaction history export");

        // Sprint 1 is history: planned, run, and closed with the bug carried over to sprint 2.
        String sprints = "/projects/" + mobile.id() + "/sprints";
        UUID sprint1 = uuid(api.post(
                as("pm"),
                sprints,
                body(
                        "name",
                        "Sprint 1",
                        "goal",
                        "Customers can sign in and see their money",
                        "startDate",
                        day(-20),
                        "endDate",
                        day(-7))));
        UUID sprint2 = uuid(api.post(
                as("pm"),
                sprints,
                body("name", "Sprint 2", "goal", "Customers can send money", "startDate", day(-6), "endDate", day(7))));
        List<UUID> sprintOne = new ArrayList<>(done);
        sprintOne.add(crash);
        api.post(as("pm"), "/sprints/" + sprint1 + "/tasks", body("taskIds", sprintOne));
        api.post(as("pm"), "/sprints/" + sprint1 + "/start", null);
        for (UUID task : done) {
            advance(as("pm"), task, "DONE");
        }
        advance(as("pm"), crash, "IN_PROGRESS");
        api.post(as("pm"), "/sprints/" + sprint1 + "/close", body("carryOverTo", sprint2));
        api.post(
                as("pm"),
                "/sprints/" + sprint2 + "/tasks",
                body("taskIds", List.of(toAccount, mobileMoney, electricity)));
        api.post(as("pm"), "/sprints/" + sprint2 + "/start", null);
        advance(as("pm"), crash, "IN_PROGRESS", "DONE");
        advance(as("pm"), toAccount, "IN_REVIEW");
        advance(as("pm"), mobileMoney, "IN_PROGRESS");
        advance(as("pm"), pentest, "TODO");

        risk(
                mobile,
                "THREAT FINANCIAL 4x5 @pmo ESCALATE review+5",
                "Payment gateway contract not signed",
                "Legal and procurement meet the gateway every week until signature");
        risk(
                mobile,
                "THREAT TECHNICAL 3x4 @pm MITIGATE review+10",
                "App store rejection delays launch",
                "Pre-submission review against the store guidelines");
        risk(
                mobile,
                "THREAT EXTERNAL 2x5 @pmo ACCEPT review+20",
                "Regulator changes mobile money rules",
                "Monthly call with the national payments office");
        risk(
                mobile,
                "THREAT ORGANIZATIONAL 2x3 @pm MITIGATE review+30",
                "Key Android developer leaves",
                "Pair programming on every critical feature");
        risk(mobile, "THREAT TECHNICAL 1x2 @member ACCEPT review+45", "Card partner API downtime", null);
        risk(
                mobile,
                "OPPORTUNITY TECHNICAL 3x3 @bosco EXPLOIT review+14",
                "Reuse the portal's identity service",
                "Spike in sprint 3");

        String issues = "/projects/" + mobile.id() + "/issues";
        api.post(
                as("pm"),
                issues,
                body(
                        "title",
                        "Push notifications not delivered on some Android phones",
                        "type",
                        "TECHNICAL",
                        "priority",
                        "HIGH",
                        "ownerId",
                        id("member"),
                        "dueDate",
                        day(3)));
        UUID devices = uuid(api.post(
                as("pm"),
                issues,
                body(
                        "title",
                        "Not enough test devices",
                        "type",
                        "RESOURCE",
                        "priority",
                        "MEDIUM",
                        "ownerId",
                        id("pm"),
                        "dueDate",
                        day(-5))));
        api.post(
                as("pm"),
                "/issues/" + devices + "/resolve",
                body("resolution", "Borrowed six phones from the branch network"));

        stakeholder(mobile, "5/4 SUPPORTIVE>LEADING", "Beatrice Kamanzi", "Akagera Digital Ltd", "Board chair");
        stakeholder(mobile, "5/2 NEUTRAL>SUPPORTIVE", "Emmanuel Gatete", "National payments office", "Supervisor");
        stakeholder(mobile, "2/5 RESISTANT>SUPPORTIVE", "Branch managers", "Akagera Digital Ltd", "Branch network");
        stakeholder(mobile, "1/4 UNAWARE>NEUTRAL", "Customer panel", null, "Twelve volunteer customers");

        // One change request at each step of the approval chain.
        changeRequest("member", mobile, "SCOPE 500000 0", "Add a dark mode", false);
        changeRequest("member", mobile, "SCOPE 1200000 0", "Kinyarwanda voice prompts", true);
        UUID atm = changeRequest("member", mobile, "SCOPE 12000000 15", "Card-less ATM withdrawals", true);
        decide("pm", atm, "APPROVE", "Customers ask for it at every branch");
        UUID beta = changeRequest("member", mobile, "SCHEDULE 0 5", "Extend the staff beta by one week", true);
        decide("pm", beta, "APPROVE", "Worth it: fewer bugs at launch");
        if ("APPROVED"
                .equals(api.get(as("pm"), "/change-requests/" + beta)
                        .get("status")
                        .asString())) {
            api.post(as("pm"), "/change-requests/" + beta + "/implement", null);
        }
        UUID rewrite =
                changeRequest("member", mobile, "OTHER 30000000 40", "Rebuild the app in another framework", true);
        decide("pm", rewrite, "REJECT", "No benefit for customers this year");

        resourcing(mobile, List.of(done.get(3), done.get(4), toAccount, crash), List.of(done.get(2), mobileMoney));
        api.update(
                as("pm"),
                "PUT",
                "/projects/" + mobile.id() + "/evm/settings",
                body("percentCompleteMethod", "STORY_POINTS", "eacMethod", "TYPICAL"));
        attachment(mobile);
    }

    /**
     * Rates, twelve weeks of approved time (the actual cost behind EVM) with last week still waiting for approval, a
     * few days of leave, and allocations that overload Eric, who also works on the ERP rollout.
     */
    private void resourcing(Project project, List<UUID> ericsTasks, List<UUID> boscosTasks) {
        for (String rate :
                new String[] {"pm 25000", "member 15000", "bosco 15000", "chantal 14000", "alice 25000", "gloria 16000"
                }) {
            String[] parts = rate.split(" ");
            api.post(
                    as("admin"),
                    "/users/" + id(parts[0]) + "/cost-rates",
                    body("hourlyRate", body("amount", parts[1], "currency", "RWF"), "validFrom", day(-400)));
        }
        api.post(
                as("admin"),
                "/users/" + id("member") + "/leave",
                body("from", monday(1).plusDays(3), "to", monday(1).plusDays(4), "reason", "Family event"));
        for (int week = -12; week <= 0; week++) {
            timesheet(as("member"), week, ericsTasks, week < 0);
            timesheet(as("bosco"), week, boscosTasks, week < 0);
        }
        JsonNode submitted = api.get(as("pm"), "/projects/" + project.id() + "/timesheets?status=SUBMITTED&size=100");
        for (JsonNode sheet : submitted.get("content")) {
            if (!monday(-1).toString().equals(sheet.get("weekStart").asString())) {
                api.post(as("pm"), "/timesheets/" + sheet.get("id").asString() + "/approve", null);
            }
        }
        allocate(project, "member 30", "bosco 32", "chantal 24");
    }

    /** Four weeks from this one, {@code person hours} each week. */
    private void allocate(Project project, String... perWeek) {
        List<Map<String, Object>> allocations = new ArrayList<>();
        for (int week = 0; week < 4; week++) {
            for (String allocation : perWeek) {
                String[] parts = allocation.split(" ");
                allocations.add(
                        body("userId", id(parts[0]), "weekStart", monday(week), "hours", Integer.parseInt(parts[1])));
            }
        }
        api.put(project.manager(), "/projects/" + project.id() + "/allocations", body("allocations", allocations));
    }

    /** A week of six-and-a-half-hour days (a short Friday) on the given tasks, up to yesterday. */
    private void timesheet(Session session, int week, List<UUID> tasks, boolean submit) {
        List<Map<String, Object>> entries = new ArrayList<>();
        LocalDate monday = monday(week);
        for (int weekday = 0; weekday < 5 && monday.plusDays(weekday).isBefore(today); weekday++) {
            entries.add(body(
                    "taskId",
                    tasks.get(Math.floorMod(weekday + week, tasks.size())),
                    "date",
                    monday.plusDays(weekday),
                    "hours",
                    weekday == 4 ? 4 : 6.5,
                    "billable",
                    true));
        }
        if (entries.isEmpty()) {
            return;
        }
        String isoWeek = "%d-W%02d"
                .formatted(monday.get(IsoFields.WEEK_BASED_YEAR), monday.get(IsoFields.WEEK_OF_WEEK_BASED_YEAR));
        api.put(session, "/timesheets/me/" + isoWeek + "/entries", body("entries", entries));
        if (submit) {
            api.post(session, "/timesheets/me/" + isoWeek + "/submit", null);
        }
    }

    /** The launch plan as a file on the project; skipped when storage isn't running. */
    private void attachment(Project project) {
        byte[] content = """
                Mobile banking app: launch plan
                1. Staff beta in all Kigali branches
                2. Public launch with a radio campaign in Kinyarwanda
                3. Support desk open until 22:00 for the first month
                """.getBytes(StandardCharsets.UTF_8);
        try {
            JsonNode upload = api.post(
                    as("pm"),
                    "/attachments/uploads",
                    body(
                            "ownerType", "PROJECT",
                            "ownerId", project.id(),
                            "fileName", "Launch plan.txt",
                            "contentType", "text/plain",
                            "sizeBytes", content.length));
            if (api.upload(upload.get("uploadUrl").asString(), "text/plain", content) == 200) {
                api.post(
                        as("pm"),
                        "/attachments/" + upload.get("attachment").get("id").asString() + "/complete",
                        null);
            }
        } catch (IllegalStateException unavailable) {
            LOG.warn("Demo: no attachment, storage is not available ({})", unavailable.getMessage());
        }
    }

    // ---------------------------------------------------------------- the other Akagera projects

    /** Past its target end with a little work left: AMBER. */
    private void selfServicePortal(UUID portfolio, UUID program) {
        Project portal = project(
                as("pmo"),
                "pm",
                portfolio,
                program,
                "AKG-002",
                "Customer self-service portal",
                "HYBRID -200..-10 80000000");
        charter(portal, as("pmo"), "Customers change their details and order cards online", true, "Go-live@-10");
        transition(portal, "IN_PROGRESS", null);
        team(portal, "member", "esther");
        UUID portalWork = node(portal, null, "Portal", "2400 60000000");
        for (String finished : new String[] {
            "24h Update address and phone",
            "120h Sign in with the mobile app PIN",
            "80h Download statements",
            "60h Activate a new card"
        }) {
            int space = finished.indexOf(' ');
            UUID task = task(
                    portal,
                    portalWork,
                    "STORY/MEDIUM @member 3pt " + finished.substring(0, space) + " due-30",
                    finished.substring(space + 1));
            advance(portal.manager(), task, "DONE");
        }
        UUID cards = task(portal, portalWork, "STORY/HIGH @esther 5pt 16h due-15", "Order a replacement card");
        advance(portal.manager(), cards, "IN_PROGRESS");
        UUID review = task(portal, portalWork, "TASK/MEDIUM @esther 2pt 12h due-12", "Accessibility review");
        advance(portal.manager(), review, "IN_REVIEW");
        risk(
                portal,
                "THREAT PROJECT_MANAGEMENT 3x3 @pm AVOID review+7",
                "Scope creep from branch requests",
                "Every request goes through change control");
    }

    /** In trouble: a critical risk past its review, a critical vendor issue, and the PMO's RED override. */
    private void erpRollout(UUID portfolio, UUID program) {
        Project erp =
                project(as("pmo"), "alice", portfolio, program, "AKG-003", "ERP rollout", "HYBRID -160..120 320000000");
        charter(
                erp,
                as("pmo"),
                "One system for finance, HR and procurement",
                true,
                "Finance module live@45",
                "HR module live@110");
        transition(erp, "IN_PROGRESS", null);
        team(erp, "member", "gloria", "janvier");
        UUID finance = node(erp, null, "Finance module", "5000 140000000");
        UUID hr = node(erp, null, "HR module", "3500 90000000");
        UUID migration = node(erp, null, "Data migration", "1500 40000000");
        UUID ledger = task(erp, finance, "TASK/CRITICAL @gloria 120h 20d due-5", "Configure the general ledger");
        advance(as("alice"), ledger, "IN_PROGRESS");
        task(erp, hr, "TASK/HIGH @janvier 80h 15d due+40", "Payroll rules for Rwanda");
        UUID cleanse = task(erp, migration, "TASK/HIGH @member 60h 10d due-20", "Cleanse supplier master data");
        advance(as("alice"), cleanse, "DONE");
        risk(
                erp,
                "THREAT EXTERNAL 5x5 @alice ESCALATE review-3",
                "Finance module vendor three months late",
                "Penalty clause invoked; weekly steering with the vendor");
        risk(
                erp,
                "THREAT TECHNICAL 4x4 @gloria MITIGATE review+12",
                "Migrated balances don't reconcile",
                "Three dress rehearsals before cut-over");
        api.post(
                as("alice"),
                "/projects/" + erp.id() + "/issues",
                body(
                        "title",
                        "Vendor missed the data migration milestone",
                        "type",
                        "VENDOR",
                        "priority",
                        "CRITICAL",
                        "ownerId",
                        id("alice"),
                        "dueDate",
                        day(-2)));
        api.update(
                as("alice"),
                "PUT",
                "/projects/" + erp.id() + "/evm/settings",
                body("percentCompleteMethod", "FIFTY_FIFTY", "eacMethod", "COMPOSITE"));
        api.put(
                as("pmo"),
                "/projects/" + erp.id() + "/health-override",
                body("health", "RED", "reason", "Finance module vendor is three months late"));
        allocate(erp, "member 20");
    }

    /** Approved, starting in two weeks: a predictive plan with a clear critical path and a baseline. */
    private void officeFitOut(UUID portfolio) {
        Project fitOut = project(
                as("pmo"), "herve", portfolio, null, "AKG-004", "Kigali office fit-out", "PREDICTIVE 14..150 95000000");
        charter(fitOut, as("pmo"), "A floor that supports hybrid teams", true, "Contractor on site@20");
        team(fitOut, "laurent", "marie");
        UUID works = node(fitOut, null, "Works", "3000 80000000");
        UUID survey = task(fitOut, works, "TASK/HIGH @laurent 40h 5d", "Site survey");
        UUID design = task(fitOut, works, "TASK/HIGH @marie 60h 10d", "Design approval");
        UUID partitions = task(fitOut, works, "TASK/MEDIUM @laurent 200h 15d", "Partitions and ceilings");
        UUID cabling = task(fitOut, works, "TASK/MEDIUM @laurent 150h 12d", "Electrical and data cabling");
        UUID furniture = task(fitOut, works, "TASK/LOW @marie 40h 7d", "Furniture delivery");
        UUID moveIn = task(fitOut, works, "TASK/HIGH @marie 30h 3d", "Move-in weekend");
        UUID[][] links = {
            {survey, design},
            {design, partitions},
            {design, cabling},
            {partitions, furniture},
            {furniture, moveIn},
            {cabling, moveIn}
        };
        for (UUID[] link : links) {
            api.post(
                    fitOut.manager(),
                    "/projects/" + fitOut.id() + "/dependencies",
                    body("predecessorId", link[0], "successorId", link[1], "type", "FS"));
        }
        api.post(fitOut.manager(), "/projects/" + fitOut.id() + "/schedule/baseline", null);
        risk(
                fitOut,
                "THREAT EXTERNAL 3x3 @herve MITIGATE review+21",
                "Contractor availability in the rainy season",
                "Book two contractors");
    }

    /** Proposed: the charter is still a draft. */
    private void dataWarehouse(UUID portfolio, UUID program) {
        Project warehouse = project(
                as("pmo"), "pm", portfolio, program, "AKG-005", "Data warehouse", "PREDICTIVE 30..240 60000000");
        charter(warehouse, as("pmo"), "One place for reporting data", false, "First data mart@120");
    }

    private void digitalSkills(UUID portfolio) {
        Project skills = project(
                as("pmo"), "odette", portfolio, null, "AKG-006", "Staff digital skills programme", "AGILE -60..60");
        charter(
                skills,
                as("pmo"),
                "Every employee confident with the new digital tools",
                true,
                "First cohort trained@30");
        transition(skills, "IN_PROGRESS", null);
        transition(skills, "ON_HOLD", "Training budget frozen until the next quarter");
    }

    private void legacyCrm(UUID portfolio, UUID program) {
        Project crm = project(
                as("pmo"),
                "alice",
                portfolio,
                program,
                "AKG-007",
                "Legacy CRM retirement",
                "PREDICTIVE -300..-40 25000000");
        charter(crm, as("pmo"), "Switch off the old CRM after moving its data", true, "CRM off@-45");
        transition(crm, "IN_PROGRESS", null);
        UUID decommissioning = node(crm, null, "Decommissioning", "800 22000000");
        UUID archive = task(crm, decommissioning, "TASK/HIGH 80h 10d due-60", "Archive customer history");
        advance(as("alice"), archive, "DONE");
        transition(crm, "CLOSING", null);
        transition(crm, "CLOSED", null);
    }

    // ---------------------------------------------------------------- Virunga Build Partners

    private void virunga() {
        Session olivier = sessions.get("olivier");
        UUID construction =
                portfolio(olivier, "Construction 2026", "olivier", "Deliver public facilities on time and on budget");
        Project clinic = project(
                olivier,
                "olivier",
                construction,
                null,
                "VBP-001",
                "Musanze clinic build",
                "PREDICTIVE -90..200 450000000");
        charter(clinic, as("admin").in(virunga), "A 40-bed clinic for Musanze district", true, "Roof on@60");
        transition(clinic, "IN_PROGRESS", null);
        UUID shell = node(clinic, null, "Building shell", "12000 300000000");
        UUID foundations = task(clinic, shell, "TASK/CRITICAL 2000h 30d due-30", "Foundations");
        advance(olivier, foundations, "DONE");
        UUID walls = task(clinic, shell, "TASK/HIGH 4000h 45d due+30", "Walls and columns");
        advance(olivier, walls, "IN_PROGRESS");
        risk(
                clinic,
                "THREAT FINANCIAL 3x4 @olivier TRANSFER review+14",
                "Cement price increase",
                "Fixed-price supply contract");
        project(olivier, "olivier", construction, null, "VBP-002", "Equipment depot", "AGILE 45..180");
    }

    // ---------------------------------------------------------------- dates

    private LocalDate day(int offset) {
        return today.plusDays(offset);
    }

    /** The Monday of the week {@code offset} weeks from this one. */
    private LocalDate monday(int offset) {
        return today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)).plusWeeks(offset);
    }

    private static UUID uuid(JsonNode created) {
        return UUID.fromString(created.get("id").asString());
    }
}
