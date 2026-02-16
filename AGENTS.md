# Project: Google Sheets + Apps Script invoicing system

Goal:
- Build a Google Sheets + Apps Script system that generates PDFs:
  Quote / Invoice / Receipt / Delivery note / Payment statement
- Source of truth: Google Sheets
  - SETTINGS, CLIENTS, BANK_ACCOUNTS, DOCS, LINES, ISSUE_LOG
- Google Docs templates use placeholders:
  {{DOC_TITLE}}, {{DOC_NO}}, {{ISSUE_DATE}}, {{CLIENT_DISPLAY_NAME}}, {{SUBJECT}}, {{NOTE}},
  markers: {{LINES_TABLE}}, {{TAX_SUMMARY}}, {{INFO_BLOCK}}, {{SEAL_IMAGE}}, {{BANK_INFO}}

Rules:
- Filename: YYYYMMDD_CompanyNameForFilename_110,000_請求書.pdf
  - CompanyNameForFilename excludes "(株)" and no honorific; store in CLIENTS.client_name_for_filename
  - If same name exists, rename old to _OLD_01, _OLD_02... and keep latest as base name
- Bank selection priority:
  DOCS.bank_id > CLIENTS.preferred_bank_id > SETTINGS.default_bank_id
- Tax:
  - Per-tax-rate rounding ONCE (10% and 8%) with FLOOR/ROUND/CEIL
  - INFO_ONLY lines are not part of taxable base and shown in INFO_BLOCK
  - payableTotal = invoiceTotal - infoOnlyTotal
- price_mode: EXCL (外税) or INCL (内税) per document

Deliverables:
- Apps Script code (Code.gs or src/*.gs)
- A setup() function that creates:
  sheets + headers + dropdown validations,
  Drive folders (templates/output),
  duplicates Docs templates, writes IDs back to SETTINGS.
- A render function:
  renderPdfForDocId(docId) and a UI menu.
- README with step-by-step setup (Mac, clasp).
