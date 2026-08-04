const nodemailer = require('nodemailer');

// ============================================
// TRANSPORTER CON CONFIGURACIÓN PARA RAILWAY
// ============================================

function createTransporter() {
    return nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,           // Puerto SSL (más estable en Railway)
        secure: true,        // SSL activado
        auth: {
            user: process.env.ADMIN_EMAIL,
            pass: process.env.EMAIL_PASS
        },
        // Timeouts altos para Railway
        connectionTimeout: 60000,
        greetingTimeout: 60000,
        socketTimeout: 60000,
        // Evitar problemas de certificado
        tls: {
            rejectUnauthorized: false
        }
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
        // Esperar 3 segundos entre envíos para evitar bloqueos
        await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    return resultados;
}

module.exports = {
    createTransporter,
    reenviarCorreoOriginal,
    reenviarTokenMultiple
};
