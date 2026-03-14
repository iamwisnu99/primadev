// File: netlify/functions/email_template.js

const getPremiumTemplate = (data) => {
    // URL Website kamu (Ganti kalau beda domain)
    const BASE_URL = "https://primadev.netlify.app";
    const LOGO_URL = "https://i.imgur.com/BZ1xLO3.png";
    const HOME_URL = "https://primadev.netlify.app/home";
    const LEGAL_URL = "https://primadev.netlify.app/legal#privacy";

    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Pembayaran Berhasil</title>
        <style>
            body { margin: 0; padding: 0; background-color: #f1f5f9; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; }
            .container { width: 100%; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1); margin-top: 20px; margin-bottom: 20px; }
            .header { background: linear-gradient(135deg, #4f46e5 0%, #3730a3 100%); padding: 40px 20px; text-align: center; }
            .content { padding: 40px 30px; color: #334155; line-height: 1.6; }
            .key-box { background-color: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 12px; padding: 25px; text-align: center; margin: 30px 0; }
            .license-key { font-family: 'Courier New', monospace; font-size: 24px; font-weight: 800; color: #4f46e5; letter-spacing: 2px; display: block; margin-bottom: 5px; }
            .label-key { font-size: 11px; text-transform: uppercase; color: #64748b; letter-spacing: 1px; font-weight: 600; }
            .btn-invoice { background-color: #4f46e5; color: #ffffff !important; padding: 14px 30px; border-radius: 50px; text-decoration: none; font-weight: bold; display: inline-block; font-size: 14px; box-shadow: 0 4px 6px -1px rgba(79, 70, 229, 0.3); }
            .details-table td { padding: 8px 0; border-bottom: 1px solid #f1f5f9; font-size: 14px; }
            .footer { background-color: #1e293b; color: #94a3b8; padding: 30px; text-align: center; font-size: 12px; line-height: 1.5; }
            .social-link { color: #ffffff; text-decoration: none; margin: 0 5px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <img src="${LOGO_URL}" alt="PrimaDev" width="160" style="display: block; margin: 0 auto;">
                <h2 style="color: #ffffff; margin: 20px 0 0 0; font-weight: 600;">Pembayaran Diterima!</h2>
                <p style="color: #e0e7ff; margin: 5px 0 0 0; font-size: 14px;">Terima kasih telah bergabung dengan PrimaDev.</p>
            </div>

            <div class="content">
                <p>Halo <strong>${data.name}</strong>,</p>
                <p>Pesanan Anda telah berhasil diproses secara otomatis. Berikut adalah akses lisensi premium untuk aplikasi pilihan Anda.</p>

                <div class="key-box">
                    <span class="label-key">LICENSE KEY ANDA</span>
                    <span class="license-key">${data.key}</span>
                    <p style="margin: 10px 0 0 0; font-size: 12px; color: #ef4444;">*Jangan bagikan kode ini kepada siapapun.</p>
                </div>

                <table class="details-table" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 30px;">
                    <tr>
                        <td style="color: #64748b;">Aplikasi</td>
                        <td style="font-weight: bold; text-align: right;">${data.appName}</td>
                    </tr>
                    <tr>
                        <td style="color: #64748b;">Paket Durasi</td>
                        <td style="font-weight: bold; text-align: right;">${data.type.toUpperCase()}</td>
                    </tr>
                    <tr>
                        <td style="color: #64748b;">Expired Date</td>
                        <td style="font-weight: bold; text-align: right;">${data.expiryDate}</td>
                    </tr>
                    <tr>
                        <td style="color: #64748b;">Total Bayar</td>
                        <td style="font-weight: bold; text-align: right; color: #16a34a;">LUNAS</td>
                    </tr>
                </table>

                <div style="text-align: center; margin-top: 40px;">
                    <a href="${BASE_URL}/.netlify/functions/invoice?id=${data.key}" class="btn-invoice">
                        Lihat INVOICE &rarr;
                    </a>
                    <p style="margin-top: 15px; font-size: 12px; color: #94a3b8;">
                        ID Transaksi: ${data.transactionId}
                    </p>
                </div>
            </div>

            <div class="footer">
                <p style="margin-bottom: 10px; font-weight: bold; color: #ffffff;">PT. PRIMADEV DIGITAL INDONESIA</p>
                <p>SPBU Pertamina 34.115.06<br>Jl. Kedoya Raya No. 23, Kedoya Selatan<br>Kebon Jeruk, Jakarta Barat, DKI Jakarta 11520</p>
                
                <p style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #334155;">
                    &copy; ${new Date().getFullYear()} PrimaDev. All rights reserved.<br>
                    <a href="${HOME_URL}" style="color: #6366f1; text-decoration: none;">Visit Website</a> • 
                    <a href="${LEGAL_URL}" style="color: #6366f1; text-decoration: none;">Privacy Policy</a>
                </p>
            </div>
        </div>
    </body>
    </html>
    `;
};


const getRenewalTemplate = (data) => {
    const BASE_URL = "https://primadev.netlify.app";
    const LOGO_URL = "https://i.imgur.com/BZ1xLO3.png";

    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Perpanjangan Berhasil</title>
        <style>
            body { margin: 0; padding: 0; background-color: #f1f5f9; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; }
            .container { width: 100%; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1); margin-top: 20px; }
            .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 40px 20px; text-align: center; }
            .content { padding: 40px 30px; color: #334155; line-height: 1.6; }
            .status-badge { background-color: #dcfce7; color: #166534; padding: 8px 16px; border-radius: 50px; font-weight: bold; font-size: 12px; display: inline-block; margin-bottom: 20px; text-transform: uppercase; }
            .details-card { background-color: #f8fafc; border-radius: 12px; padding: 25px; margin: 20px 0; border: 1px solid #e2e8f0; }
            .footer { background-color: #1e293b; color: #94a3b8; padding: 30px; text-align: center; font-size: 12px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <img src="${LOGO_URL}" alt="PrimaDev" width="140" style="display: block; margin: 0 auto;">
                <h2 style="color: #ffffff; margin: 20px 0 0 0;">Perpanjangan Berhasil!</h2>
            </div>
            <div class="content">
                <div class="status-badge">Payment Confirmed</div>
                <p>Halo <strong>${data.name}</strong>,</p>
                <p>Masa aktif lisensi Anda untuk <strong>${data.appName}</strong> telah berhasil diperpanjang. Terima kasih telah terus mempercayai layanan kami.</p>
                
                <div class="details-card">
                    <p style="margin: 0; color: #64748b; font-size: 12px; text-transform: uppercase; font-weight: bold;">MASA AKTIF BARU</p>
                    <h2 style="margin: 5px 0 15px 0; color: #10b981;">Hingga ${data.expiryDate}</h2>
                    
                    <p style="margin: 15px 0 0 0; font-size: 14px; border-top: 1px solid #e2e8f0; padding-top: 15px;">
                        <strong>License Key:</strong> <span style="font-family: monospace;">${data.key}</span>
                    </p>
                </div>

                <p style="font-size: 14px; color: #64748b;">Sekarang Anda dapat melanjutkan penggunaan aplikasi tanpa hambatan. Jika ada kendala, silakan hubungi tim support kami.</p>
                
                <div style="text-align: center; margin-top: 30px;">
                    <p style="font-size: 12px; color: #94a3b8;">Order ID: ${data.orderId || data.transactionId}</p>
                </div>
            </div>
            <div class="footer">
                <p>&copy; ${new Date().getFullYear()} PrimaDev Digital Indonesia. All rights reserved.</p>
            </div>
        </div>
    </body>
    </html>
    `;
};

module.exports = { getPremiumTemplate, getRenewalTemplate };