const fs = require('fs');
const path = require('path');

const careerCssPath = path.join(__dirname, 'public/css/career.css');
const adminCssPath = path.join(__dirname, 'public/css/admin.css');
const indexHtmlPath = path.join(__dirname, 'index.html');

const careerDark = `
@media (prefers-color-scheme: dark) {
    :root {
        --bg: #0f172a;
        --surface: #1e293b;
        --text-main: #f8fafc;
        --text-muted: #94a3b8;
        --border: #334155;
    }
    body {
        background-color: var(--bg);
        color: var(--text-main);
    }
    .form-control, .custom-select-trigger {
        background-color: #0f172a !important;
        color: #f8fafc !important;
        border-color: var(--border) !important;
    }
    .form-control:focus {
        background-color: #1e293b !important;
        color: #fff !important;
    }
    .step-indicator {
        background-color: #334155;
        color: #94a3b8;
    }
    .step-indicator.active {
        background-color: var(--primary);
        color: #fff;
    }
    .file-upload-wrapper {
        background-color: #0f172a;
        color: #f8fafc;
    }
    .card, .form-container, .step-content {
        background-color: var(--surface);
        color: var(--text-main);
    }
    label {
        color: #e2e8f0 !important;
    }
    .input-hint {
        color: #94a3b8 !important;
    }
    .checkbox-group label {
        color: #cbd5e1 !important;
    }
}
`;

const adminDark = `
@media (prefers-color-scheme: dark) {
    :root {
        --bg: #0f172a;
        --surface: #1e293b;
        --text-main: #f8fafc;
        --text-muted: #94a3b8;
        --border: #334155;
        --sidebar-bg: #0f172a;
    }
    body, .dashboard-container {
        background-color: var(--bg);
        color: var(--text-main);
    }
    .sidebar {
        background-color: var(--surface);
        border-right: 1px solid var(--border);
    }
    .nav-item {
        color: #cbd5e1;
    }
    .nav-item:hover {
        background-color: #334155;
    }
    .nav-item.active {
        background-color: var(--primary);
        color: #fff;
    }
    .main-content {
        background-color: var(--bg);
    }
    .stat-card, .table-container, .card, .section {
        background-color: var(--surface);
        border: 1px solid var(--border);
    }
    .table th {
        background-color: #0f172a;
        color: #94a3b8;
        border-bottom: 1px solid var(--border);
    }
    .table td {
        border-bottom: 1px solid var(--border);
        color: #cbd5e1;
    }
    .form-control, .form-select {
        background-color: #0f172a !important;
        color: #f8fafc !important;
        border: 1px solid var(--border) !important;
    }
    .modal-content {
        background-color: var(--surface);
        border: 1px solid var(--border);
    }
    .modal-header, .modal-footer {
        border-color: var(--border);
    }
    .text-dark { color: #f8fafc !important; }
    .text-muted { color: #94a3b8 !important; }
}
`;

const indexDark = `
    <style>
        @media (prefers-color-scheme: dark) {
            body {
                background-color: #0f172a !important;
                color: #f8fafc !important;
            }
            .navbar {
                background-color: rgba(15, 23, 42, 0.95) !important;
                border-bottom: 1px solid #334155;
            }
            .navbar-brand, .nav-link {
                color: #f8fafc !important;
            }
            .hero-section {
                background-color: #0f172a !important;
            }
            h1, h2, h3, h4, h5, h6 {
                color: #f8fafc !important;
            }
            p.text-muted {
                color: #94a3b8 !important;
            }
            .card {
                background-color: #1e293b !important;
                border: 1px solid #334155 !important;
            }
            .card-title {
                color: #f8fafc !important;
            }
            .card-text {
                color: #cbd5e1 !important;
            }
            footer {
                background-color: #020617 !important;
                border-top: 1px solid #334155;
            }
            .trust-logo {
                filter: brightness(0) invert(1) opacity(0.7) !important;
            }
            .faq-button {
                background-color: #1e293b !important;
                color: #f8fafc !important;
                border-bottom: 1px solid #334155 !important;
            }
        }
    </style>
</head>
`;

if(fs.existsSync(careerCssPath)) {
    fs.appendFileSync(careerCssPath, careerDark);
    console.log('Updated career.css');
}

if(fs.existsSync(adminCssPath)) {
    fs.appendFileSync(adminCssPath, adminDark);
    console.log('Updated admin.css');
}

if(fs.existsSync(indexHtmlPath)) {
    let indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
    indexHtml = indexHtml.replace('</head>', indexDark);
    fs.writeFileSync(indexHtmlPath, indexHtml);
    console.log('Updated index.html');
}
