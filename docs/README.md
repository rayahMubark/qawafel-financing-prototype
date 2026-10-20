# Task 2 diagrams

Each diagram has Mermaid source (`.mmd`) and a rendered image (`.png`).

## Data model

The data model has **19 tables**: 8 financial core tables and 11 workflow tables (including `DOCUMENT_ISSUE` and `BANK_EVENT`). `APPLICATION` and `DOCUMENT` appear in both diagrams to show where the workflow tables attach; they are counted once, in the core.

| Diagram | What it shows |
|---|---|
| [data-model-core](data-model-core.png) ([source](data-model-core.mmd)) | The 8 financial core tables: organization, bank accounts, customers, application, documents, invoices, bank transactions and the match allocations that link payments to invoices. |
| [data-model-workflow](data-model-workflow.png) ([source](data-model-workflow.mmd)) | The 11 workflow tables: users, document issues, review items, flags, info requests, packages, consent, bank submission, bank events, bank decision and audit log. |

## Process flow

| Diagram | What it shows |
|---|---|
| [process-flow-1-upload](process-flow-1-upload.png) ([source](process-flow-1-upload.mmd)) | Phase 1: the SME uploads invoices and statements, the platform checks 12-month coverage and extracts the data, and ops confirm low-confidence values. |
| [process-flow-2-verification](process-flow-2-verification.png) ([source](process-flow-2-verification.mmd)) | Phase 2: normalization, reconciliation of invoices to bank deposits and risk checks; ops resolve flags or request documents before the package is generated. |
| [process-flow-3-decision](process-flow-3-decision.png) ([source](process-flow-3-decision.mmd)) | Phase 3: the SME consents, ops submit to the bank with an idempotency key, and the bank's decision is confirmed by webhook and status read before the SME is notified. |

## Application status

| Diagram | What it shows |
|---|---|
| [application-status](application-status.png) ([source](application-status.mmd)) | The application's states from Draft to Decision received, and the events that move it between them. |
