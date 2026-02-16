const SHEETS = {
  SETTINGS: 'SETTINGS',
  CLIENTS: 'CLIENTS',
  BANK_ACCOUNTS: 'BANK_ACCOUNTS',
  DOCS: 'DOCS',
  LINES: 'LINES',
  ISSUE_LOG: 'ISSUE_LOG'
};

const HEADERS = {
  SETTINGS: [
    'settings_id', 'issuer_name', 'issuer_postal', 'issuer_address', 'issuer_tel', 'issuer_email',
    'invoice_reg_no', 'default_price_mode', 'default_rounding_mode', 'default_payment_terms_days',
    'default_bank_id', 'seal_image_file_id', 'seal_enabled_default', 'seal_size_px',
    'output_folder_id', 'template_folder_id',
    'template_doc_id_invoice', 'template_doc_id_quote', 'template_doc_id_receipt',
    'template_doc_id_delivery', 'template_doc_id_payment_statement',
    'timezone'
  ],
  CLIENTS: [
    'client_id', 'client_name', 'client_name_for_filename', 'honorific', 'postal', 'address',
    'contact_person', 'email', 'tel', 'preferred_bank_id', 'default_doc_note', 'is_active'
  ],
  BANK_ACCOUNTS: [
    'bank_id', 'label', 'bank_name', 'branch_name', 'account_type', 'account_no', 'account_name_kana',
    'note', 'is_default', 'is_active'
  ],
  DOCS: [
    'doc_id', 'doc_type', 'client_id', 'issue_date', 'due_date', 'title', 'note',
    'price_mode', 'rounding_mode', 'bank_id', 'show_bank_info', 'seal_enabled',
    'info_block_enabled', 'doc_state', 'change_reason', 'revision_no',
    'latest_pdf_file_id', 'latest_pdf_url', 'latest_pdf_name', 'last_rendered_at',
    'total_payable', 'total_invoice_amount', 'total_info_only'
  ],
  LINES: [
    'line_id', 'doc_id', 'line_no', 'item_name', 'description', 'qty', 'unit', 'unit_price', 'amount',
    'line_role', 'tax_category'
  ],
  ISSUE_LOG: [
    'log_id', 'doc_id', 'revision_no', 'action', 'pdf_file_id', 'pdf_name', 'pdf_url',
    'old_pdf_renamed_to', 'created_at', 'created_by', 'change_reason'
  ]
};

const DOC_TYPES = {
  INVOICE: {
    labelJa: '請求書',
    templateKey: 'template_doc_id_invoice',
    fileSuffixJa: '請求書',
    defaultTitle: 'ご請求書',
    totalLabel: 'ご請求金額',
    dueLabel: 'お支払期日'
  },
  QUOTE: {
    labelJa: '見積書',
    templateKey: 'template_doc_id_quote',
    fileSuffixJa: '見積書',
    defaultTitle: '御見積書',
    totalLabel: '御見積金額',
    dueLabel: '有効期限'
  },
  DELIVERY_NOTE: {
    labelJa: '納品書',
    templateKey: 'template_doc_id_delivery',
    fileSuffixJa: '納品書',
    defaultTitle: '納品書',
    totalLabel: '納品金額',
    dueLabel: '納品日'
  },
  RECEIPT: {
    labelJa: '領収書',
    templateKey: 'template_doc_id_receipt',
    fileSuffixJa: '領収書',
    defaultTitle: '領収書',
    totalLabel: '受領金額',
    dueLabel: '受領日'
  },
  PAYMENT_STATEMENT: {
    labelJa: '支払明細書',
    templateKey: 'template_doc_id_payment_statement',
    fileSuffixJa: '支払明細書',
    defaultTitle: '支払明細書',
    totalLabel: '支払金額',
    dueLabel: '支払日'
  }
};

const DOC_TYPE_INVOICE = 'INVOICE';
const TEMPLATE_KEYS = {
  INVOICE: 'template_doc_id_invoice',
  QUOTE: 'template_doc_id_quote',
  DELIVERY_NOTE: 'template_doc_id_delivery',
  RECEIPT: 'template_doc_id_receipt',
  PAYMENT_STATEMENT: 'template_doc_id_payment_statement'
};
