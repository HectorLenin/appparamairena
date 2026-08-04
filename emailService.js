const nodemailer = require('nodemailer');

// ============================================
// TRANSPORTER CON PUERTO 587 (TLS)
// ============================================

function createTransporter() {
    return nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,  // TLS (no SSL)
        auth: {
            user: process.env.ADMIN_EMAIL,
            pass: process.env.EMAIL_PASS
        },
        tls: {
            rejectUnauthorized: false,
            ciphers: 'HIGH:!SSLv2:!SSLv3:!TLSv1:!TLSv1.1'
        },
        connectionTimeout: 30000,
        greetingTimeout: 30000,
        socketTimeout: 30000,
        // Evita que Nodemailer use IPv6 (problema común en Railway)
        family: 4
    });
}

// ============================================
// REENVIAR CORREO ORIGINAL
// ============================================

async function reenviarCorreoOriginal(destinatario, correoOriginal) {
    try {
        console.log(`📧 Reenviando correo original a ${destinatario}...`);
        
        const transporter = createTransporter();
        
        const htmlContent = correoOriginal.cuerpoHTML || correoOriginal.cuerpoTexto || '';

        const mailOptions = {
            from: `"Netflix" <${process.env.ADMIN_EMAIL}>`,
            to: destinatario,
            subject: correoOriginal.subject || 'Token Netflix',
            html: htmlContent,
            text: correoOriginal.cuerpoTexto || 'Contenido no disponible'
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`✅ Correo reenviado a ${destinatario} (ID: ${info.messageId})`);
        
        return {
            success: true,
            messageId: info.messageId,
            destinatario: destinatario
        };
    } catch (error) {
        console.error(`❌ Error al reenviar a ${destinatario}:`, error.message);
        return {
            success: false,
            error: error.message,
            destinatario: destinatario
        };
    }
}

// ============================================
// REENVIAR A MÚLTIPLES DESTINATARIOS
// ============================================

async function reenviarTokenMultiple(destinatarios, correoOriginal) {
    const resultados = [];
    
    for (const destinatario of destinatarios) {
        const resultado = await reenviarCorreoOriginal(destinatario, correoOriginal);
        resultados.push(resultado);
        await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    return resultados;
}

module.exports = {
    createTransporter,
    reenviarCorreoOriginal,
    reenviarTokenMultiple
};
