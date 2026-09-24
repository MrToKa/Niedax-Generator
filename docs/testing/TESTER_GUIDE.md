# Internal TEST tester guide

Open `http://<test-server-hostname-or-ip>:8080` using the address supplied by the TEST operator.
This is an address template, not evidence of a deployed server. The application must display its
visible **TEST** badge. Check the environment and build identity in system information before
recording results.

Obtain approved TEST credentials privately from the TEST operator. Passwords are never listed
in this guide, defect reports or shared screenshots.

| Account              | Role          | Intended use                                                                  |
| -------------------- | ------------- | ----------------------------------------------------------------------------- |
| `test.designer`      | Designer      | Edit permitted projects, calculate and save revisions.                        |
| `test.reviewer`      | Reviewer      | Inspect, check and approve revisions when permitted.                          |
| `test.administrator` | Administrator | Manage permitted accounts/catalog operations and inspect operational metrics. |
| `test.viewer`        | Viewer        | Inspect data with the existing read-only permissions.                         |

Roles follow the application's existing permission matrix. Switching a role does not bypass
validation, project ownership rules or approval blockers.

## Suggested test session

1. Log in and select an `S11-DEMO-` project appropriate to the scenario.
2. Inspect its geometry, product choices, connections and support settings.
3. Calculate and inspect the detailed BOM, order quantities and warning explanations.
4. Save a revision with a meaningful test note. Existing saved revisions remain immutable.
5. Use Reviewer to check and approve only when the application permits it; record legitimate
   blockers rather than bypassing them.
6. Request an Excel export and inspect the downloaded workbook. Report any warning or failure
   together with its error reference.

Demo data exercises workflows; it does not provide additional engineering approval. Read the
catalogue/source limitations in [TEST operations](TEST_ENVIRONMENT.md) and the
[Stage 10 review package](stage10-regression-review.md). Synthetic fixtures, where present, must
remain identified as synthetic. Some unresolved connections intentionally produce warnings or
prevent approval. Ask the operator to restore the demo baseline only through the documented TEST
process; do not delete historical revisions.

## Report a defect

Copy the environment, application/build version, Git commit, build timestamp and active catalog
and rule versions from system information. Include the displayed correlation/error ID for an
unexpected failure; operators use it to locate the matching safe server log. No database access
is needed. Send the report through your team's approved internal channel.

```text
Title:
Date/time and timezone:
Environment:
Application/build version:
Git commit:
Build timestamp:
Active catalog version:
Active rule version:
Role:
Project/demo scenario:
Steps to reproduce:
Expected result:
Actual result:
Severity:
Screenshot, if useful:
Downloaded workbook, if relevant:
Correlation/error ID:
```

Use the existing [Stage 10 severity policy](stage10-defects.md):

- **Severity 1:** data loss/corruption, unauthorized access or an unusable critical workflow.
- **Severity 2:** incorrect material/order quantities, broken immutability/approval or a critical
  workflow failure without a safe workaround.
- **Severity 3:** a limited functional defect, bounded workaround or incorrect non-critical
  warning/validation.
- **Severity 4:** cosmetic or usability defects only.

Do not downgrade an acceptance blocker by changing its label. Never attach passwords, cookies,
session tokens, browser storage or database dumps. Workbook/screenshots may contain project data;
use approved internal access controls when sharing them.
