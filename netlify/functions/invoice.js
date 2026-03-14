const admin = require('firebase-admin');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

// --- INISIALISASI FIREBASE (SMART MODE) ---
if (!admin.apps.length) {
  let serviceAccount = null;

  try {
    if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
      console.log("[INIT] Menggunakan ENV Variable Terpisah...");
      serviceAccount = {
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n').replace(/"/g, '')
      };
    }
    // CARA 2: Cek Format JSON Satu Blok (Cara Lama)
    else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      console.log("[INIT] Menggunakan ENV JSON Blob...");
      const raw = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      serviceAccount = {
        projectId: raw.project_id,
        clientEmail: raw.client_email,
        privateKey: raw.private_key.replace(/\\n/g, '\n')
      };
    }
    // CARA 3: File Lokal (Hanya di Localhost)
    else if (!process.env.NETLIFY) {
      try {
        const localKey = '../../strukmaker-3327d110-firebase-adminsdk-fbsvc-28cd459e84.json';
        serviceAccount = require(localKey);
      } catch (e) {
        console.log("[INIT] File JSON lokal tidak ditemukan.");
      }
    }

  } catch (err) {
    console.error("[INIT ERROR] Gagal memproses kredensial:", err.message);
  }

  // --- FINAL CHECK & CONNECT ---
  const dbUrl = process.env.FIREBASE_DATABASE_URL || "https://strukmaker-3327d110-default-rtdb.asia-southeast1.firebasedatabase.app";

  if (serviceAccount && serviceAccount.privateKey) {
    const keySample = serviceAccount.privateKey.substring(0, 30);
    console.log(`[INIT] Private Key Check: ${keySample}... (Valid Header?)`);

    if (!serviceAccount.privateKey.includes("BEGIN PRIVATE KEY")) {
      console.error("❌ FATAL: Format Private Key SALAH! Pastikan mengandung '-----BEGIN PRIVATE KEY-----'");
    } else {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: dbUrl
      });
      console.log("✅ Firebase Berhasil Terhubung!");
    }
  } else {
    console.error("❌ FATAL: Tidak ada kredensial yang terbaca. Cek .env kamu!");
  }
}

const db = admin.database();

exports.handler = async (event, context) => {
  const { id } = event.queryStringParameters;
  if (!id) return { statusCode: 400, body: "Mana ID-nya bos?" };

  try {
    const snapshot = await db.ref('licenses/' + id).once('value');
    const data = snapshot.val();
    if (!data) return { statusCode: 404, body: "Data Invoice Tidak Ditemukan" };

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      let buffers = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        const safeFilename = `Invoice-${id.substring(0, 8)}.pdf`;
        resolve({
          statusCode: 200,
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `inline; filename=${safeFilename}`
          },
          body: pdfData.toString('base64'),
          isBase64Encoded: true
        });
      });

      // --- HEADER & LOGO ---
      const logoPath = path.join(process.cwd(), 'public', 'logo.png');
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, 50, 45, { height: 40 });
      } else {
        doc.fillColor('#4f46e5').fontSize(24).font('Helvetica-Bold').text('PRIMADEV', 50, 50);
      }

      // Alamat Perusahaan (Kiri Atas)
      doc.fillColor('#1e293b').fontSize(8).font('Helvetica-Bold').text('PT PRIMADEV DIGITAL TECHNOLOGY', 50, 95);
      doc.fillColor('#64748b').font('Helvetica').fontSize(7)
        .text('Jl. Kedoya Raya No. 1, Kedoya Selatan\nKebon Jeruk, Jakarta Barat, 11520\nEmail: wisnu.bussines99@gmail.com | Web: apps-primadev.netlify.app', 50, 107, { lineGap: 2 });

      // Judul Dokumen (Kanan Atas)
      doc.fillColor('#4f46e5').fontSize(26).font('Helvetica-Bold').text('INVOICE', 350, 45, { align: 'right', width: 200 });
      doc.fillColor('#94a3b8').fontSize(9).font('Helvetica').text('Official Payment Receipt', 350, 75, { align: 'right', width: 200 });

      // Badge PAID (Kanan Atas)
      doc.save();
      doc.translate(480, 105);
      doc.rotate(-15);
      doc.rect(0, 0, 70, 22).lineWidth(1.5).strokeColor('#22c55e').stroke();
      doc.fillColor('#22c55e').fontSize(12).font('Helvetica-Bold').text('PAID', 0, 5, { width: 70, align: 'center' });
      doc.restore();

      // Garis Dekoratif Indigo
      doc.rect(50, 150, 500, 2).fill('#4f46e5');

      // --- INFORMASI TRANSAKSI ---
      const infoTop = 175;

      // Kolom Kiri: Pelanggan
      doc.fillColor('#94a3b8').fontSize(8).font('Helvetica-Bold').text('BILLED TO', 50, infoTop);
      doc.fillColor('#1e293b').fontSize(11).font('Helvetica-Bold').text(data.name || 'Pelanggan Setia', 50, infoTop + 13);
      doc.fillColor('#64748b').fontSize(9).font('Helvetica').text(data.email || '-', 50, infoTop + 28);
      doc.fillColor('#64748b').fontSize(9).font('Helvetica').text(data.phone || '', 50, infoTop + 40);

      // Kolom Kanan: Detail Invoice
      const date = new Date(data.paidAt || Date.now());
      const dateStr = date.toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' });

      const rightColX = 380;
      const labelWidth = 80;

      const drawInfoRow = (label, value, y) => {
        doc.fillColor('#94a3b8').fontSize(8).font('Helvetica-Bold').text(label, rightColX, y, { width: labelWidth });
        doc.fillColor('#1e293b').fontSize(9).font('Helvetica-Bold').text(value, rightColX + labelWidth, y, { align: 'right', width: 100 });
      };

      drawInfoRow('INVOICE NO', `INV/${id.substring(1, 8).toUpperCase()}`, infoTop);
      drawInfoRow('DATE PAID', dateStr, infoTop + 15);
      drawInfoRow('METHOD', (data.paymentMethod || 'Transfer').toUpperCase(), infoTop + 30);
      drawInfoRow('STATUS', 'SUCCESSFUL', infoTop + 45);

      // --- TABEL PRODUK ---
      const tableTop = 270;

      // Header Tabel
      doc.rect(50, tableTop, 500, 30).fill('#1e293b');
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9);
      doc.text('ITEM DESCRIPTION', 65, tableTop + 10);
      doc.text('PLAN TYPE', 320, tableTop + 10);
      doc.text('AMOUNT', 450, tableTop + 10, { align: 'right', width: 85 });

      // Isi Tabel
      const itemY = tableTop + 45;
      const appName = data.appName || 'Aplikasi PrimaDev';

      // Row Background (Zebra)
      doc.rect(50, itemY - 10, 500, 50).fill('#f8fafc');

      doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(11).text('Lisensi ' + appName, 65, itemY);
      doc.fillColor('#64748b').font('Helvetica').fontSize(8).text(`Unique License ID: ${id}`, 65, itemY + 16);
      doc.fillColor('#94a3b8').font('Helvetica').fontSize(7).text(`Authorized via ${data.transactionId || 'Manual System'}`, 65, itemY + 27);

      const type = (data.type || 'Standard').toUpperCase();
      doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(10).text(type, 320, itemY + 5);

      const price = parseInt(data.price) || 0;
      const subtotal = Math.round(price / 1.11);
      const taxAmount = price - subtotal;

      const formattedPrice = "IDR " + price.toLocaleString('id-ID');
      const formattedSubtotal = "IDR " + subtotal.toLocaleString('id-ID');
      const formattedTax = "IDR " + taxAmount.toLocaleString('id-ID');

      doc.fillColor('#4f46e5').font('Helvetica-Bold').fontSize(11).text(formattedSubtotal, 450, itemY + 5, { align: 'right', width: 85 });

      // --- TOTAL SECTION ---
      const summarytop = 400;
      doc.moveTo(350, summarytop).lineTo(550, summarytop).lineWidth(0.5).strokeColor('#e2e8f0').stroke();

      doc.fillColor('#94a3b8').fontSize(9).font('Helvetica').text('Subtotal', 350, summarytop + 15);
      doc.fillColor('#1e293b').fontSize(9).font('Helvetica-Bold').text(formattedSubtotal, 450, summarytop + 15, { align: 'right', width: 85 });

      doc.fillColor('#94a3b8').fontSize(9).font('Helvetica').text('Tax (11%)', 350, summarytop + 30);
      doc.fillColor('#1e293b').fontSize(9).font('Helvetica-Bold').text(formattedTax, 450, summarytop + 30, { align: 'right', width: 85 });

      // Total Box
      doc.rect(350, summarytop + 50, 200, 40).fill('#4f46e5');
      doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold').text('TOTAL PAID', 365, summarytop + 65);
      doc.fillColor('#ffffff').fontSize(14).font('Helvetica-Bold').text(formattedPrice, 450, summarytop + 62, { align: 'right', width: 85 });

      // --- FOOTER & SIGNATURE ---
      const footerTop = 680;
      doc.rect(50, footerTop, 500, 1).fill('#e2e8f0');

      doc.fillColor('#1e293b').fontSize(9).font('Helvetica-Bold').text('Notes & Terms:', 50, footerTop + 15);
      doc.fillColor('#64748b').fontSize(8).font('Helvetica').text('1. Invoice ini adalah bukti pembayaran yang sah.\n2. Lisensi bersifat mengikat pada satu perangkat kecuali disebutkan lain.\n3. Pertanyaan lebih lanjut? Hubungi wisnu.bussines99@gmail.com', 50, footerTop + 30, { lineGap: 3 });

      // Digital signature or Seal
      doc.fillColor('#94a3b8').fontSize(7).font('Helvetica-Bold').text('COMPUTER GENERATED DOCUMENT\nNO SIGNATURE REQUIRED', 350, footerTop + 45, { align: 'center', width: 200 });

      doc.end();
    });

  } catch (error) {
    console.error("Invoice Error:", error);
    return { statusCode: 500, body: "Error Backend: " + error.message };
  }
};