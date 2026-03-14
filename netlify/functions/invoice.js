const admin = require('firebase-admin');
const PDFDocument = require('pdfkit');

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
    // CARA 3: File Lokal (Untuk Localhost)
    else {
      console.log("[INIT] Mencari File JSON Lokal...");
      serviceAccount = require('../../strukmaker-3327d110-firebase-adminsdk-fbsvc-28cd459e84.json');
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
              const safeFilename = `Invoice-${id.substring(0,8)}.pdf`; 
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
          doc.fillColor('#4f46e5').fontSize(24).font('Helvetica-Bold').text('PRIMADEV', 50, 50, { align: 'left' });
          doc.fillColor('black').fontSize(10).font('Helvetica').text('Software Solutions', 50, 75, { align: 'left' });

          // --- JUDUL "INVOICE" (Kanan Atas) ---
          doc.fillColor('black').fontSize(20).text('INVOICE', 400, 50, { align: 'right', width: 150 });
          
          // --- STEMPEL "PAID" (Kanan Atas, dibawah tulisan Invoice) ---
          doc.save();
          doc.rotate(-10, { origin: [500, 90] });
          doc.rect(480, 80, 80, 30).lineWidth(2).strokeColor('#22c55e').stroke();
          doc.fillColor('#22c55e').fontSize(18).font('Helvetica-Bold').text('PAID', 480, 88, { width: 80, align: 'center' });
          doc.restore();

          // Garis Pembatas
          doc.moveTo(50, 130).lineTo(550, 130).lineWidth(1).strokeColor('#e2e8f0').stroke();

          // --- INFO KUSTOMER (Kiri) ---
          const topInfo = 150;
          doc.fontSize(10).fillColor('#64748b').text('Ditagihkan Kepada:', 50, topInfo);
          doc.fillColor('black').font('Helvetica-Bold').text(data.name || 'Pelanggan', 50, topInfo + 15);
          doc.font('Helvetica').fontSize(9).text(data.email || '-', 50, topInfo + 30);

          const date = new Date();
          const dateStr = date.toLocaleDateString('id-ID', { 
              timeZone: 'Asia/Jakarta',
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
          });

          doc.fontSize(9).fillColor('#64748b');
          doc.text('No. Invoice:', 350, topInfo, { align: 'left' });
          doc.text('Tanggal Bayar:', 350, topInfo + 15, { align: 'left' });
          doc.text('Metode Bayar:', 350, topInfo + 30, { align: 'left' });
          doc.text('Transaction ID:', 350, topInfo + 45, { align: 'left' });

          doc.fillColor('black');
          doc.text(`INV-${id.substring(1, 8).toUpperCase()}`, 430, topInfo, { align: 'right' });
          doc.text(dateStr, 430, topInfo + 15, { align: 'right' });
          doc.text(data.paymentMethod || 'Transfer', 430, topInfo + 30, { align: 'right' });
          doc.text(data.transactionId || '-', 430, topInfo + 45, { align: 'right' });

          // --- TABEL PRODUK ---
          const tableTop = 240;
          doc.rect(50, tableTop, 500, 25).fill('#f1f5f9');
          doc.fillColor('black').font('Helvetica-Bold').fontSize(10);
          doc.text('DESKRIPSI', 60, tableTop + 7);
          doc.text('TIPE', 300, tableTop + 7);
          doc.text('HARGA', 450, tableTop + 7, { align: 'right' });

          // Isi Item
          const itemY = tableTop + 35;
          doc.font('Helvetica-Bold').fontSize(11).text('Lisensi Aplikasi Struk SPBU', 60, itemY);
          doc.font('Helvetica').fontSize(9).fillColor('#64748b').text(`License Key: ${id}`, 60, itemY + 15);

          const type = (data.type || 'Standard').toUpperCase();
          doc.fillColor('black').fontSize(10).text(type, 300, itemY);

          const price = parseInt(data.price) || 0;
          const formattedPrice = "Rp " + price.toLocaleString('id-ID');
          doc.text(formattedPrice, 450, itemY, { align: 'right' });

          doc.moveTo(50, itemY + 35).lineTo(550, itemY + 35).strokeColor('#e2e8f0').stroke();

          // --- TOTAL ---
          const totalY = itemY + 50;
          doc.font('Helvetica-Bold').fontSize(14).text('TOTAL LUNAS', 300, totalY);
          doc.fillColor('#22c55e').text(formattedPrice, 450, totalY, { align: 'right' });

          // --- FOOTER ---
          doc.fontSize(9).fillColor('#94a3b8').font('Helvetica');
          doc.text('Bukti pembayaran ini sah dan diterbitkan secara otomatis oleh sistem.', 50, 700, { align: 'center', width: 500 });
          doc.text('Terima kasih atas kepercayaan Anda.', 50, 715, { align: 'center', width: 500 });

          doc.end();
      });

  } catch (error) {
      console.error("Invoice Error:", error);
      return { statusCode: 500, body: "Error Backend: " + error.message };
  }
};