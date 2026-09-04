# Known Issues

Issue:
npm dependency audit vulnerabilities

Description:
`npm install` reported 7 vulnerabilities in the dependency tree: 5 moderate, 1 high, and 1 critical.

Steps to reproduce:
Run `npm install` or `npm audit`.

Expected:
No dependency audit vulnerabilities.

Actual:
npm reports 7 vulnerabilities.

Priority:
Medium

Status:
Open. No automatic `npm audit fix` was applied because dependency changes should be reviewed separately.
