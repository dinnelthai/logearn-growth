# Phase 3: External ranking evidence (seo)

Only schema-validated projected connector output is archived. An additive `external_rank_snapshot` evidence record holds provider, capability/version, owner, connection/project binding, collection/check times, source kind, coverage, truncation and non-billable cost status. This is not a LogEarn business fact or GSC measurement; no existing metric ID or GSC first-party sync was changed.

Owner and scope enforcement reuses the existing immutable SQLite agent_evidence store and claim reference validation. `forModel` and initial `modelContext` use the same positive-list rank projection, exposing no connection ID, project binding or unreviewed provider fields. Rank 0 is not a valid found position; missing, unqueried and not-found remain distinct.

Tests: `node --test test/capabilityEvidence.test.js test/capabilityCatalog.test.js test/capabilityGateway.test.js test/growthStatisticalModelTransport.test.js`. Node tests and real SQLite writes still require a local repo checkout; JavaScript syntax verified during remote commit. No migration or external service call. Roll back the phase 3 commit if required.
