const nodemailer = require('nodemailer');

// ============================================
// TRANSPORTER CON CONFIGURACIÓN EXTREMA PARA RAILWAY
// ============================================

function createTransporter() {
    return nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: {
            user: process.env.ADMIN_EMAIL,
            pass: process.env.EMAIL_PASS
        },
        // OPCIONES CRÍTICAS PARA RAILWAY
        direct: true,  // Fuerza conexión directa
        connectionTimeout: 120000,  // 2 minutos
        greetingTimeout: 120000,
        socketTimeout: 120000,
        tls: {
            rejectUnauthorized: false,
            ciphers: 'SSLv3'
        },
        debug: true  // Para ver más detalles en logs
    });
}

// ============================================
// REENVIAR CORREO ORIGINAL (CON REINTENTOS)
// ============================================

async function reenviarCorreoOriginal(destinatario, correoOriginal, intentos = 0) {
    try {
        console.log(`📧 Reenviando correo original a ${destinatario}... (Intento ${intentos + 1})`);
        
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
        
        // Si es timeout y es el primer intento, reintentar
        if (error.message.includes('timeout') && intentos < 2) {
            console.log(`🔄 Reintentando envío a ${destinatario}...`);
            await new Promise(resolve => setTimeout(resolve, 5000));
            return reenviarCorreoOriginal(destinatario, correoOriginal, intentos + 1);
        }
        
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
        // Esperar 5 segundos entre envíos
        await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    return resultados;
}

module.exports = {
    createTransporter,
    reenviarCorreoOriginal,
    reenviarTokenMultiple
};
