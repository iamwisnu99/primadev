const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

if (!admin.apps.length) {
    let serviceAccount = null;
    try {
        if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
            serviceAccount = {
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n').replace(/"/g, '')
            };
        } else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
            const raw = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
            serviceAccount = {
                projectId: raw.project_id,
                clientEmail: raw.client_email,
                privateKey: raw.private_key.replace(/\\n/g, '\n')
            };
        }

        if (serviceAccount) {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
                databaseURL: process.env.FIREBASE_DATABASE_URL || "https://strukmaker-3327d110-default-rtdb.asia-southeast1.firebasedatabase.app"
            });
        }
    } catch (error) {
        console.error("Firebase Init Error", error);
    }
}

const db = admin.database();

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});


const sendEmail = async (to, subject, htmlContent) => {
    try {
        if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
            console.warn("Kredensial email tidak diset. Email tidak dikirim ke:", to);
            return false;
        }

        const info = await transporter.sendMail({
            from: `"PT. Primadev Digital Technology" <${process.env.EMAIL_USER}>`,
            to: to,
            subject: subject,
            html: htmlContent
        });
        console.log("Email terkirim:", info.messageId);
        return true;
    } catch (error) {
        console.error("Gagal mengirim email:", error);
        return false;
    }
};

const getAdminNotificationTemplate = (data) => {
    const LOGO_URL = "https://i.imgur.com/BZ1xLO3.png";
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body { margin: 0; padding: 0; background-color: #f1f5f9; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; }
            .container { width: 100%; max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1); }
            .header { padding: 40px 20px; text-align: center; }
            .content { padding: 40px 30px; color: #334155; line-height: 1.6; }
            .details-table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            .details-table td { padding: 12px 0; border-bottom: 1px solid #f1f5f9; font-size: 14px; }
            .footer { background-color: #1e293b; color: #94a3b8; padding: 30px; text-align: center; font-size: 12px; line-height: 1.5; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <img src="${LOGO_URL}" alt="Primadev" width="160" style="display: block; margin: 0 auto;">
                <h2 style="color: #334155; margin: 20px 0 0 0; font-weight: 600;">Lamaran Baru Masuk!</h2>
            </div>
            <div class="content">
                <p>Halo Admin,</p>
                <p>Terdapat pengajuan lamaran baru untuk bergabung dengan PT. Primadev Digital Technology. Berikut adalah rincian data pelamar:</p>
                <table class="details-table">
                    <tr><td style="color: #64748b; width: 40%;">Nama Lengkap</td><td style="font-weight: bold;">${data.name}</td></tr>
                    <tr><td style="color: #64748b;">Email</td><td style="font-weight: bold;">${data.email}</td></tr>
                    <tr><td style="color: #64748b;">WhatsApp</td><td style="font-weight: bold;">${data.whatsapp || '-'}</td></tr>
                    <tr><td style="color: #64748b;">Portofolio</td><td style="font-weight: bold;">${data.portfolio && data.portfolio !== '-' ? `<a href="${data.portfolio}" style="color: #2563eb;">Lihat Portofolio</a>` : '-'}</td></tr>
                    <tr><td style="color: #64748b;">Keahlian</td><td style="font-weight: bold; white-space: pre-wrap;">${data.keahlian || '-'}</td></tr>
                    <tr><td style="color: #64748b;">Dokumen</td><td style="font-weight: bold;">${data.dokumenUrl && data.dokumenUrl !== '-' ? `<a href="${data.dokumenUrl}" style="color: #2563eb;" target="_blank">Unduh / Lihat Dokumen</a>` : '-'}</td></tr>
                </table>
                <p style="margin-top: 30px; font-size: 14px;">Silakan login ke Dashboard Admin untuk meninjau dan menindaklanjuti lamaran ini.</p>
            </div>
            <div class="footer">
                <p style="margin-bottom: 10px; font-weight: bold; color: #ffffff;">PT. PRIMADEV DIGITAL TECHNOLOGY</p>
                <p>Wangon<br>Kelurahan Wangon, Kecamatan Wangon<br>Kabupaten Banyumas, Jawa Tengah, Indonesia<br>53176</p>
                
                <p style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #334155;">
                    &copy; ${new Date().getFullYear()} PT. Primadev Digital Technology. All rights reserved.<br>
                    <a href="https://apps-primadev.netlify.app" style="color: #6366f1; text-decoration: none;">Visit Website</a> • 
                    <a href="https://apps-primadev.netlify.app/app/legal/syarat-ketentuan" style="color: #6366f1; text-decoration: none;">Syarat & Ketentuan</a>
                </p>
            </div>
        </div>
    </body>
    </html>
    `;
};

const getAcceptanceTemplate = (data) => {
    const LOGO_URL = "https://i.imgur.com/BZ1xLO3.png";
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body { margin: 0; padding: 0; background-color: #f1f5f9; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; }
            .container { width: 100%; max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1); }
            .header { padding: 40px 20px; text-align: center; }
            .content { padding: 40px 30px; color: #334155; line-height: 1.6; }
            .key-box { background-color: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 12px; padding: 25px; text-align: center; margin: 30px 0; }
            .license-key { font-family: 'Courier New', monospace; font-size: 24px; font-weight: bold; color: #000000; letter-spacing: 2px; display: block; margin-bottom: 5px; }
            .label-key { font-size: 11px; text-transform: uppercase; color: #64748b; letter-spacing: 1px; font-weight: 600; }
            .footer { background-color: #1e293b; color: #94a3b8; padding: 30px; text-align: center; font-size: 12px; line-height: 1.5; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <img src="${LOGO_URL}" alt="Primadev" width="160" style="display: block; margin: 0 auto;">
                <h2 style="color: #334155; margin: 20px 0 0 0; font-weight: 600;">Selamat Bergabung!</h2>
            </div>
            <div class="content">
                <p>Halo <strong>${data.name}</strong>,</p>
                <p>Kami sangat senang menginformasikan bahwa Anda telah <strong>DITERIMA</strong> untuk bergabung bersama PT. Primadev Digital Technology sebagai <strong>${data.employeeType === 'tetap' ? 'Karyawan Tetap (PKWTT)' : 'Karyawan Kontrak (PKWT)'}</strong>.</p>
                <div class="key-box">
                    <span class="label-key">ID KARYAWAN ANDA</span>
                    <span class="license-key">${data.empId}</span>
                </div>
                <div style="text-align: center; margin-top: 30px; margin-bottom: 30px;">
                    <a href="https://apps-primadev.netlify.app/app/employer?id=${data.empId}" style="background-color: #10b981; color: #ffffff; padding: 14px 30px; border-radius: 50px; text-decoration: none; font-weight: bold; display: inline-block; box-shadow: 0 4px 6px -1px rgba(16, 185, 129, 0.3);">Lihat Detail</a>
                </div>
                <p>Tim HR kami akan segera menghubungi Anda melalui WhatsApp atau Email untuk menginformasikan proses onboarding dan tahap selanjutnya.</p>
                <p>Sekali lagi, selamat! Kami tidak sabar melihat kontribusi luar biasa Anda di Primadev.</p>
            </div>
            <div class="footer">
                <p style="margin-bottom: 10px; font-weight: bold; color: #ffffff;">PT. PRIMADEV DIGITAL TECHNOLOGY</p>
                <p>Wangon<br>Kelurahan Wangon, Kecamatan Wangon<br>Kabupaten Banyumas, Jawa Tengah, Indonesia<br>53176</p>
                
                <p style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #334155;">
                    &copy; ${new Date().getFullYear()} PT. Primadev Digital Technology. All rights reserved.<br>
                    <a href="https://apps-primadev.netlify.app" style="color: #6366f1; text-decoration: none;">Visit Website</a> • 
                    <a href="https://apps-primadev.netlify.app/app/legal/syarat-ketentuan" style="color: #6366f1; text-decoration: none;">Syarat & Ketentuan</a>
                </p>
            </div>
        </div>
    </body>
    </html>
    `;
};

const getRejectionTemplate = (data) => {
    const LOGO_URL = "https://i.imgur.com/BZ1xLO3.png";
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body { margin: 0; padding: 0; background-color: #f1f5f9; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; }
            .container { width: 100%; max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1); }
            .header { padding: 40px 20px; text-align: center; }
            .content { padding: 40px 30px; color: #334155; line-height: 1.6; text-align: justify; }
            .footer { background-color: #1e293b; color: #94a3b8; padding: 30px; text-align: center; font-size: 12px; line-height: 1.5; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <img src="${LOGO_URL}" alt="Primadev" width="160" style="display: block; margin: 0 auto;">
                <h2 style="color: #334155; margin: 20px 0 0 0; font-weight: 600;">Pemberitahuan Rekrutmen</h2>
            </div>
            <div class="content">
                <p>Halo <strong>${data.name}</strong>,</p>
                <p>Terima kasih banyak atas ketertarikan Anda untuk bergabung dan berkembang bersama PT. Primadev Digital Technology.</p>
                <p>Setelah meninjau kualifikasi dan portofolio Anda secara saksama, dengan berat hati kami sampaikan bahwa saat ini kami belum dapat melanjutkan proses lamaran Anda ke tahap berikutnya. Kami harus mengambil keputusan sulit mengingat tingginya kualitas kandidat yang mendaftar pada periode ini.</p>
                <p>Kami sangat menghargai waktu dan antusiasme Anda. Kami akan menyimpan data Anda dan mungkin akan menghubungi Anda kembali apabila ada posisi yang sesuai di masa mendatang.</p>
                <p>Semoga sukses untuk perjalanan karir Anda ke depannya!</p>
                <p style="margin-top: 30px;">Hormat kami,<br><strong>Tim HR PT. Primadev Digital Technology</strong></p>
            </div>
            <div class="footer">
                <p style="margin-bottom: 10px; font-weight: bold; color: #ffffff;">PT. PRIMADEV DIGITAL TECHNOLOGY</p>
                <p>Wangon<br>Kelurahan Wangon, Kecamatan Wangon<br>Kabupaten Banyumas, Jawa Tengah, Indonesia<br>53176</p>
                
                <p style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #334155;">
                    &copy; ${new Date().getFullYear()} PT. Primadev Digital Technology. All rights reserved.<br>
                    <a href="https://apps-primadev.netlify.app" style="color: #6366f1; text-decoration: none;">Visit Website</a> • 
                    <a href="https://apps-primadev.netlify.app/app/legal/syarat-ketentuan" style="color: #6366f1; text-decoration: none;">Syarat & Ketentuan</a>
                </p>
            </div>
        </div>
    </body>
    </html>
    `;
};

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
    };

    const respond = (statusCode, body) => {
        return {
            statusCode,
            headers,
            body: JSON.stringify(body)
        };
    };

    if (event.httpMethod === 'OPTIONS') {
        return respond(200, {});
    }

    const path = 'employees';

    try {
        if (event.httpMethod === 'GET') {
            const statusFilter = event.queryStringParameters && event.queryStringParameters.status;
            const empIdFilter = event.queryStringParameters && event.queryStringParameters.empId;
            const snapshot = await db.ref(path).once('value');

            let dataArray = [];
            if (snapshot.exists()) {
                const data = snapshot.val();
                for (let key in data) {
                    if (empIdFilter && data[key].employeeId === empIdFilter) {
                        return respond(200, { id: key, ...data[key] });
                    }
                    if (!statusFilter || data[key].status === statusFilter) {
                        dataArray.push({ id: key, ...data[key] });
                    }
                }
            }

            if (empIdFilter) {
                return respond(404, { error: 'Karyawan tidak ditemukan' });
            }

            dataArray.sort((a, b) => b.createdAt - a.createdAt);

            return respond(200, dataArray);
        }

        if (event.httpMethod === 'POST') {
            const body = JSON.parse(event.body || '{}');
            const { name, email, whatsapp, portfolio, keahlian, dokumenUrl, turnstileResponse } = body;

            if (!name || !email) {
                return respond(400, { error: 'Nama dan Email wajib diisi' });
            }

            if (!turnstileResponse) {
                return respond(400, { error: 'Verifikasi keamanan (CAPTCHA) gagal.' });
            }

            try {
                const secret = process.env.TURNSTILE_SECRET_KEY || '1x0000000000000000000000000000000AA';
                const verifyUrl = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
                const verifyFormData = new URLSearchParams();
                verifyFormData.append('secret', secret);
                verifyFormData.append('response', turnstileResponse);

                const verifyRes = await fetch(verifyUrl, {
                    method: 'POST',
                    body: verifyFormData,
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
                });

                const verifyData = await verifyRes.json();
                if (!verifyData.success) {
                    return respond(400, { error: 'Validasi Turnstile gagal. Silakan muat ulang halaman.' });
                }
            } catch (err) {
                return respond(500, { error: 'Terjadi kesalahan saat memverifikasi Turnstile.' });
            }

            const applicationId = `APP-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

            const newApplication = {
                name,
                email,
                whatsapp: whatsapp || '-',
                portfolio: portfolio || '-',
                keahlian: keahlian || '-',
                dokumenUrl: dokumenUrl || '-',
                status: 'lamaran',
                createdAt: Date.now()
            };

            await db.ref(`${path}/${applicationId}`).set(newApplication);

            const adminEmail = process.env.EMAIL_USER;
            const subjectAdmin = `Lamaran Baru Masuk - ${name}`;
            const htmlAdmin = getAdminNotificationTemplate({ name, email, whatsapp, portfolio, keahlian, dokumenUrl });
            await sendEmail(adminEmail, subjectAdmin, htmlAdmin);

            return respond(201, { message: 'Pengajuan lamaran berhasil terkirim', id: applicationId });
        }

        if (event.httpMethod === 'PUT') {
            const body = JSON.parse(event.body);
            const { id, action } = body;

            if (!id || !action) {
                return respond(400, { error: 'ID dan Action dibutuhkan' });
            }

            const snapshot = await db.ref(`${path}/${id}`).once('value');
            if (!snapshot.exists()) {
                return respond(404, { error: 'Data tidak ditemukan' });
            }

            const employeeData = snapshot.val();
            let updates = {};
            let subjectUser = "";
            let htmlUser = "";

            if (action === 'terima') {
                const allSnapshot = await db.ref(path).once('value');
                let acceptedCount = 0;
                if (allSnapshot.exists()) {
                    const allData = allSnapshot.val();
                    for (const key in allData) {
                        if (allData[key].status === 'aktif' || allData[key].employeeId) {
                            acceptedCount++;
                        }
                    }
                }
                const employeeNumber = (acceptedCount + 1).toString().padStart(4, '0');

                const employeeType = body.employeeType || 'kontrak';
                const now = new Date();
                const month = (now.getMonth() + 1).toString().padStart(2, '0');
                const year = now.getFullYear().toString();
                const typeCode = employeeType === 'tetap' ? '92' : '91';

                const empId = `P${employeeNumber}D${month}V${year}${typeCode}`;

                updates = {
                    status: 'aktif',
                    employeeId: empId,
                    acceptedAt: Date.now(),
                    employeeType: body.employeeType || 'kontrak'
                };

                subjectUser = `Selamat! Lamaran Anda Diterima di PT. Primadev Digital Technology`;
                htmlUser = getAcceptanceTemplate({ name: employeeData.name, empId: empId, employeeType: updates.employeeType });
            } else if (action === 'tolak') {
                updates = {
                    status: 'ditolak',
                    rejectedAt: Date.now()
                };

                subjectUser = `Pemberitahuan Lamaran Kerja - PT. Primadev Digital Technology`;
                htmlUser = getRejectionTemplate({ name: employeeData.name });
            } else if (action === 'resign') {
                updates = {
                    status: 'resign',
                    resignedAt: Date.now()
                };
            } else if (action === 'rekruit_kembali') {
                updates = {
                    status: 'aktif',
                    rehiredAt: Date.now()
                };
            } else {
                return respond(400, { error: 'Action tidak valid' });
            }

            await db.ref(`${path}/${id}`).update(updates);

            if (action === 'terima' || action === 'tolak') {
                await sendEmail(employeeData.email, subjectUser, htmlUser);
            }

            return respond(200, { message: `Status berhasil diubah menjadi ${updates.status}`, data: updates });
        }

        if (event.httpMethod === 'DELETE') {
            const id = event.queryStringParameters && event.queryStringParameters.id;
            if (!id) {
                return respond(400, { error: 'ID dibutuhkan' });
            }
            await db.ref(`${path}/${id}`).remove();
            return respond(200, { message: 'Data karyawan berhasil dihapus' });
        }

        return respond(405, { error: 'Method Not Allowed' });

    } catch (error) {
        console.error("Backend Employees Error:", error);
        return respond(500, { error: error.message });
    }
};
