/**
 * Portfolio management (features 04 and 06): portfolios group work for strategic objectives, programs group related
 * projects, and a project (authorized by its charter) is the unit of delivery.
 *
 * <p>Other modules reach projects only through {@link com.kora.portfolio.ProjectAccess}, which answers "may the
 * caller see / change this project?" the same way everywhere.
 */
@ApplicationModule(displayName = "Portfolio")
package com.kora.portfolio;

import org.springframework.modulith.ApplicationModule;
